from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pymongo import DESCENDING

from lib.dates import as_utc
from lib.db import db
from models.stock import Movement, MovementCreate

router = APIRouter()


@router.get("/movements", response_model=list[Movement])
async def list_movements(
    kind: str | None = Query(default=None),
    item_id: str | None = Query(default=None),
    limit: int = Query(default=100, gt=0, le=500),
):
    query: dict = {}
    if kind in ("entrada", "saida"):
        query["kind"] = kind
    if item_id:
        query["item_id"] = item_id
    docs = await db.movements.find(query).sort("created_at", DESCENDING).to_list(limit)
    movements = []
    for doc in docs:
        doc["created_at"] = as_utc(doc.get("created_at"))
        movements.append(Movement(**doc))
    return movements


@router.post("/movements", response_model=Movement)
async def create_movement(input: MovementCreate):
    item = await db.stock_items.find_one({"id": input.item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item de estoque não encontrado")

    now = datetime.now(timezone.utc)
    if input.kind == "entrada":
        result = await db.stock_items.update_one(
            {"id": input.item_id},
            {"$inc": {"quantity": input.quantity}, "$set": {"updated_at": now}},
        )
    else:
        result = await db.stock_items.update_one(
            {"id": input.item_id, "quantity": {"$gte": input.quantity}},
            {"$inc": {"quantity": -input.quantity}, "$set": {"updated_at": now}},
        )
    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Quantidade de saída maior que o estoque disponível")

    movement = Movement(
        item_id=input.item_id,
        product_type=item["product_type"],
        size=item["size"],
        color=item["color"],
        kind=input.kind,
        quantity=input.quantity,
        note=input.note,
        created_at=now,
    )
    await db.movements.insert_one(movement.model_dump())
    return movement
