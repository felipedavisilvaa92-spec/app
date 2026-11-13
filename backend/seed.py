"""Seed the fixed 108-variant catalog (quantities start at 0). Idempotent — safe to run again.

    cd /app/backend && python seed.py
"""

import asyncio
import uuid
from datetime import datetime, timezone

from lib.catalog import PRODUCTS, SIZES
from lib.db import db, ensure_indexes


async def seed() -> None:
    now = datetime.now(timezone.utc)
    created = 0
    for product in PRODUCTS:
        for color in product["colors"]:
            for size in SIZES:
                exists = await db.stock_items.find_one(
                    {"product_type": product["id"], "color": color, "size": size}
                )
                if exists:
                    continue
                await db.stock_items.insert_one(
                    {
                        "id": str(uuid.uuid4()),
                        "product_type": product["id"],
                        "color": color,
                        "size": size,
                        "quantity": 0,
                        "created_at": now,
                        "updated_at": None,
                    }
                )
                created += 1
    await ensure_indexes()
    total = sum(len(product["colors"]) for product in PRODUCTS) * len(SIZES)
    print(f"Seed ok: {created} variantes criadas. Catalogo fixo: {len(PRODUCTS)} produtos, {total} variantes.")


if __name__ == "__main__":
    asyncio.run(seed())
