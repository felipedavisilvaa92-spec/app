"""Pedidos montados: cabeçalho (comprador/separador/nº automático), itens com checkbox de
separação e finalização que abate o estoque e registra as saídas no histórico."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pymongo import DESCENDING

from lib.catalog import COLOR_NAMES, PRODUCTS
from lib.dates import as_utc
from lib.db import db
from models.order import Order, OrderCreate, OrderItem, OrderItemAdd, OrderItemPicked
from models.stock import Movement

router = APIRouter()

_PRODUCT_NAMES = {product["id"]: product["name"] for product in PRODUCTS}


def _order_label(number: int) -> str:
    return f"Pedido #{number:03d}"


def _variant_label(variant: dict) -> str:
    return (
        f"{_PRODUCT_NAMES.get(variant['product_type'], variant['product_type'])} "
        f"{COLOR_NAMES.get(variant['color'], variant['color'])} · {variant['size']}"
    )


async def _get_order(order_id: str) -> dict:
    order = await db.pedidos.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return order


def _get_open(order: dict) -> dict:
    if order["status"] != "aberto":
        raise HTTPException(status_code=400, detail="Pedido já finalizado")
    return order


async def _read_order(order_id: str) -> Order:
    doc = await _get_order(order_id)
    doc["created_at"] = as_utc(doc.get("created_at"))
    doc["finalized_at"] = as_utc(doc.get("finalized_at"))
    return Order(**doc)


@router.get("/orders", response_model=list[Order])
async def list_orders():
    docs = await db.pedidos.find({"status": {"$ne": "cancelado"}}).sort("created_at", DESCENDING).to_list(500)
    orders = []
    for doc in docs:
        doc["created_at"] = as_utc(doc.get("created_at"))
        doc["finalized_at"] = as_utc(doc.get("finalized_at"))
        orders.append(Order(**doc))
    return orders


@router.post("/orders", response_model=Order)
async def create_order(input: OrderCreate):
    last = await db.pedidos.find_one({}, sort=[("number", DESCENDING)])
    number = (last["number"] + 1) if last else 1
    order = Order(number=number, comprador=input.comprador.strip(), separador=input.separador.strip())
    await db.pedidos.insert_one(order.model_dump())
    return order


@router.post("/orders/{order_id}/items", response_model=Order)
async def add_order_item(order_id: str, input: OrderItemAdd):
    order = _get_open(await _get_order(order_id))
    variant = await db.stock_items.find_one({"id": input.item_id})
    if not variant:
        raise HTTPException(status_code=404, detail="Variante não encontrada no estoque")

    row = next((r for r in order.get("items", []) if r["item_id"] == input.item_id), None)
    if row:
        row["quantity"] += input.quantity
    else:
        order["items"].append(
            OrderItem(
                item_id=input.item_id,
                product_type=variant["product_type"],
                size=variant["size"],
                color=variant["color"],
                quantity=input.quantity,
            ).model_dump()
        )
    await db.pedidos.replace_one({"id": order_id}, order)
    return await _read_order(order_id)


@router.patch("/orders/{order_id}/items/{row_id}", response_model=Order)
async def set_order_item_picked(order_id: str, row_id: str, input: OrderItemPicked):
    order = _get_open(await _get_order(order_id))
    row = next((r for r in order.get("items", []) if r["id"] == row_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Item não encontrado no pedido")
    row["picked"] = input.picked
    await db.pedidos.replace_one({"id": order_id}, order)
    return await _read_order(order_id)


@router.delete("/orders/{order_id}/items/{row_id}", response_model=Order)
async def remove_order_item(order_id: str, row_id: str):
    order = _get_open(await _get_order(order_id))
    remaining = [r for r in order.get("items", []) if r["id"] != row_id]
    if len(remaining) == len(order.get("items", [])):
        raise HTTPException(status_code=404, detail="Item não encontrado no pedido")
    order["items"] = remaining
    await db.pedidos.replace_one({"id": order_id}, order)
    return await _read_order(order_id)


@router.delete("/orders/{order_id}", status_code=204)
async def cancel_order(order_id: str) -> None:
    """Soft cancel: the order stays in the DB as 'cancelado' (number stays reserved)."""
    order = _get_open(await _get_order(order_id))
    await db.pedidos.update_one(
        {"id": order["id"]},
        {"$set": {"status": "cancelado", "finalized_at": datetime.now(timezone.utc)}},
    )


@router.post("/orders/{order_id}/finalize", response_model=Order)
async def finalize_order(order_id: str):
    order = _get_open(await _get_order(order_id))

    picked = [row for row in order.get("items", []) if row.get("picked")]
    if not picked:
        raise HTTPException(
            status_code=400,
            detail="Marque ao menos um item como separado para dar baixa no estoque",
        )

    now = datetime.now(timezone.utc)

    # Pre-checa o estoque de todos os itens marcados antes de abater qualquer um.
    variants: dict[str, dict] = {}
    insufficient: list[str] = []
    for row in picked:
        variant = await db.stock_items.find_one({"id": row["item_id"]})
        if not variant:
            insufficient.append(f"{_variant_label({**row})}: item não encontrado no estoque")
        elif variant["quantity"] < row["quantity"]:
            insufficient.append(
                f"{_variant_label(variant)}: disponível {variant['quantity']}, pedido {row['quantity']}"
            )
        else:
            variants[row["item_id"]] = variant
    if insufficient:
        raise HTTPException(status_code=400, detail="Estoque insuficiente — " + "; ".join(insufficient))

    # Abate atomicamente; se algo falhar no meio, devolve o que já foi abatido.
    deducted: list[dict] = []
    try:
        for row in picked:
            result = await db.stock_items.update_one(
                {"id": row["item_id"], "quantity": {"$gte": row["quantity"]}},
                {"$inc": {"quantity": -row["quantity"]}, "$set": {"updated_at": now}},
            )
            if result.matched_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Estoque insuficiente para " + _variant_label(variants[row["item_id"]]),
                )
            deducted.append(row)
    except HTTPException:
        for row in deducted:
            await db.stock_items.update_one(
                {"id": row["item_id"]}, {"$inc": {"quantity": row["quantity"]}}
            )
        raise

    # Registra as saídas no histórico de movimentações, ligadas ao pedido.
    for row in picked:
        variant = variants[row["item_id"]]
        movement = Movement(
            item_id=row["item_id"],
            product_type=variant["product_type"],
            size=variant["size"],
            color=variant["color"],
            kind="saida",
            quantity=row["quantity"],
            note=f"{_order_label(order['number'])} · {order['comprador']}",
            order_number=order["number"],
            created_at=now,
        )
        await db.movements.insert_one(movement.model_dump())

    await db.pedidos.update_one(
        {"id": order_id}, {"$set": {"status": "finalizado", "finalized_at": now}}
    )
    return await _read_order(order_id)
