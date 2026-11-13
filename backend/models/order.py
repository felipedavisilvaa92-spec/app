"""Pydantic v2 models for order assembly (pedidos) — mirrored in frontend/src/lib/types.ts."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.stock import _new_id, _now


class OrderItem(BaseModel):
    id: str = Field(default_factory=_new_id)
    item_id: str
    product_type: str
    size: str
    color: str
    quantity: int = Field(gt=0)
    picked: bool = False


class OrderCreate(BaseModel):
    comprador: str = Field(min_length=1)
    separador: str = Field(min_length=1)


class OrderItemAdd(BaseModel):
    item_id: str
    quantity: int = Field(gt=0)


class OrderItemPicked(BaseModel):
    picked: bool


class Order(BaseModel):
    id: str = Field(default_factory=_new_id)
    number: int
    comprador: str
    separador: str
    status: Literal["aberto", "finalizado", "cancelado"] = "aberto"
    items: list[OrderItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_now)
    finalized_at: Optional[datetime] = None
