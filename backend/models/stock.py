"""Pydantic v2 models for the clothing stock controller.

Mirrored by hand in frontend/src/lib/types.ts — keep the pair in sync.
"""

from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from pydantic import BaseModel, Field

from lib.catalog import SIZES


def _new_id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ProductType(BaseModel):
    id: str
    name: str
    name_plural: str
    description: str
    sizes: list[str] = Field(default_factory=lambda: list(SIZES))
    colors: list[str]


class Catalog(BaseModel):
    products: list[ProductType]


class StockItem(BaseModel):
    id: str = Field(default_factory=_new_id)
    product_type: str
    size: str
    color: str
    quantity: int = 0
    created_at: datetime = Field(default_factory=_now)
    updated_at: Optional[datetime] = None


class MovementCreate(BaseModel):
    item_id: str
    kind: Literal["entrada", "saida"]
    quantity: int = Field(gt=0)
    note: Optional[str] = None


class Movement(BaseModel):
    id: str = Field(default_factory=_new_id)
    item_id: str
    product_type: str
    size: str
    color: str
    kind: Literal["entrada", "saida"]
    quantity: int
    note: Optional[str] = None
    order_number: Optional[int] = None
    created_at: datetime = Field(default_factory=_now)


class TopSold(BaseModel):
    product_type: str
    size: str
    color: str
    total_sold: int


class DashboardSummary(BaseModel):
    total_pieces: int = 0
    zero_stock: int = 0
    low_stock: int = 0
    top_sold: list[TopSold] = Field(default_factory=list)
