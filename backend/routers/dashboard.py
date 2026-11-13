from fastapi import APIRouter

from lib.db import db
from models.stock import DashboardSummary, TopSold

router = APIRouter()


@router.get("/dashboard", response_model=DashboardSummary)
async def get_dashboard():
    items = await db.stock_items.find().to_list(1000)
    quantities = [int(item.get("quantity", 0)) for item in items]
    total_pieces = sum(quantities)
    zero_stock = sum(1 for q in quantities if q == 0)
    low_stock = sum(1 for q in quantities if 1 <= q <= 3)

    pipeline = [
        {"$match": {"kind": "saida"}},
        {
            "$group": {
                "_id": {"product_type": "$product_type", "size": "$size", "color": "$color"},
                "total_sold": {"$sum": "$quantity"},
            }
        },
        {"$sort": {"total_sold": -1}},
        {"$limit": 5},
    ]
    rows = await db.movements.aggregate(pipeline).to_list(5)
    top_sold = [
        TopSold(
            product_type=row["_id"]["product_type"],
            size=row["_id"]["size"],
            color=row["_id"]["color"],
            total_sold=int(row["total_sold"]),
        )
        for row in rows
    ]
    return DashboardSummary(total_pieces=total_pieces, zero_stock=zero_stock, low_stock=low_stock, top_sold=top_sold)
