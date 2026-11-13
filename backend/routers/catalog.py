from fastapi import APIRouter

from lib.catalog import PRODUCTS
from models.stock import Catalog, ProductType

router = APIRouter()


@router.get("/catalog", response_model=Catalog)
async def get_catalog():
    return Catalog(products=[ProductType(**product) for product in PRODUCTS])
