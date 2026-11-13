"""GET /api/export — planilha .xlsx com duas abas: Estoque (108 variantes) e Histórico."""

from io import BytesIO

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font
from pymongo import DESCENDING

from lib.catalog import COLOR_NAMES, PRODUCTS
from lib.dates import as_utc, today_iso
from lib.db import db

router = APIRouter()

_PRODUCT_NAMES = {product["id"]: product["name"] for product in PRODUCTS}
_TYPE_NAMES = {"entrada": "Entrada", "saida": "Saída"}
_SIZE_ORDER = {"P": 0, "M": 1, "G": 2, "GG": 3}


def _write_sheet(ws, headers: list[str], rows: list[list]) -> None:
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append(row)
    for column in ws.columns:
        width = max(len(str(cell.value if cell.value is not None else "")) for cell in column) + 2
        ws.column_dimensions[column[0].column_letter].width = min(width, 40)


@router.get("/export")
async def export_xlsx():
    stock_docs = await db.stock_items.find().to_list(1000)
    product_order = {product["id"]: i for i, product in enumerate(PRODUCTS)}
    color_order = {product["id"]: {c: i for i, c in enumerate(product["colors"])} for product in PRODUCTS}
    stock_docs.sort(
        key=lambda d: (
            product_order.get(d["product_type"], 99),
            color_order.get(d["product_type"], {}).get(d["color"], 99),
            _SIZE_ORDER.get(d["size"], 99),
        )
    )

    movement_docs = await db.movements.find().sort("created_at", DESCENDING).to_list(10000)

    wb = Workbook()
    ws_stock = wb.active
    ws_stock.title = "Estoque"
    _write_sheet(
        ws_stock,
        ["Produto", "Cor", "Tamanho", "Quantidade"],
        [
            [
                _PRODUCT_NAMES.get(doc["product_type"], doc["product_type"]),
                COLOR_NAMES.get(doc["color"], doc["color"]),
                doc["size"],
                int(doc.get("quantity", 0)),
            ]
            for doc in stock_docs
        ],
    )

    ws_hist = wb.create_sheet("Histórico")
    _write_sheet(
        ws_hist,
        ["Data", "Tipo", "Produto", "Cor", "Tamanho", "Quantidade", "Observação"],
        [
            [
                as_utc(doc.get("created_at")).strftime("%d/%m/%Y %H:%M") if doc.get("created_at") else "",
                _TYPE_NAMES.get(doc.get("kind"), doc.get("kind", "")),
                _PRODUCT_NAMES.get(doc["product_type"], doc["product_type"]),
                COLOR_NAMES.get(doc["color"], doc["color"]),
                doc["size"],
                int(doc.get("quantity", 0)),
                doc.get("note") or "",
            ]
            for doc in movement_docs
        ],
    )

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"estoque-{today_iso()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
