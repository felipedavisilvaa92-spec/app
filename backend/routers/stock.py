from fastapi import APIRouter

from lib.catalog import PRODUCTS
from lib.db import db
from models.stock import StockItem

router = APIRouter()

_PRODUCT_ORDER = {product["id"]: i for i, product in enumerate(PRODUCTS)}
_COLOR_ORDER = {product["id"]: {c: i for i, c in enumerate(product["colors"])} for product in PRODUCTS}
_SIZE_ORDER = {"P": 0, "M": 1, "G": 2, "GG": 3}


@router.get("/stock", response_model=list[StockItem])
async def list_stock():
    docs = await db.stock_items.find().to_list(1000)
    docs.sort(
        key=lambda d: (
            _PRODUCT_ORDER.get(d["product_type"], 99),
            _COLOR_ORDER.get(d["product_type"], {}).get(d["color"], 99),
            _SIZE_ORDER.get(d["size"], 99),
        )
    )
    return [StockItem(**doc) for doc in docs]
