"""
Chrono24 API Wrapper Server
~~~~~~~~~~~~~~~~~~~~~~~~~~~
A lightweight FastAPI service that wraps the `irahorecka/chrono24` Python library
(https://github.com/irahorecka/chrono24) and exposes Chrono24 watch listings
as a JSON REST endpoint consumed by the Watch Intelligence Platform frontend.

Setup:
    pip install -r requirements.txt
    python server.py

Configure the frontend by setting the environment variable:
    VITE_CHRONO24_WRAPPER_BASE_URL=http://localhost:8000

Note: Chrono24 may apply Cloudflare anti-bot protection. If requests fail,
refer to https://github.com/FlareSolverr/FlareSolverr for a bypass solution.
"""

import re
import sys
import logging
from typing import Any

import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

try:
    import chrono24
    from chrono24.exceptions import NoListingsFoundException, RequestException
except ImportError:
    print("ERROR: chrono24 package not installed. Run: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Chrono24 API Wrapper",
    description="Wraps the irahorecka/chrono24 library as a JSON REST API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

# Regex to extract a numeric price from strings like "$16,553" or "16.553"
_RE_PRICE = re.compile(r"[\d,.]+")


def _parse_price_to_float(price_str: str) -> float | None:
    """Convert a price string like '$16,553' to a float (16553.0)."""
    if not price_str or price_str.lower() == "null":
        return None
    digits = _RE_PRICE.search(price_str.replace(",", ""))
    if digits:
        try:
            return float(digits.group())
        except ValueError:
            return None
    return None


def _normalize_listing(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize a raw chrono24 library listing dict into the field names
    expected by the TypeScript mapChrono24Listing() function.

    The TypeScript function already handles both camelCase and snake_case keys
    (e.g. 'manufacturer' maps to 'brand'), so most fields pass through unchanged.
    We only add a numeric 'price_number' key alongside the original string 'price'
    so the frontend can parse it with minimal effort.
    """
    price_str = raw.get("price", "")
    price_num = _parse_price_to_float(str(price_str)) if price_str else None

    return {
        # --- core identity ---
        "id": raw.get("id"),
        "url": raw.get("url"),
        # 'manufacturer' is picked as 'brand' by mapChrono24Listing
        "manufacturer": raw.get("manufacturer"),
        # 'title' is picked as 'model' by mapChrono24Listing
        "title": raw.get("title"),
        "description": raw.get("description"),
        # --- price (string kept for compatibility, numeric added) ---
        "price": price_num if price_num is not None else price_str,
        "shipping_price": raw.get("shipping_price"),
        # --- location / seller ---
        "location": raw.get("location"),
        # 'merchant_name' is picked as 'seller' by mapChrono24Listing
        "merchant_name": raw.get("merchant_name"),
        "badge": raw.get("badge"),
        "certification_status": raw.get("certification_status"),
        # --- images ('image_urls' array is picked by mapChrono24Listing) ---
        "image_urls": raw.get("image_urls") or [],
        # --- detailed search extras (present only when --detailed flag used) ---
        "reference_number": raw.get("reference_number"),
        "condition": raw.get("condition"),
        "year_of_production": raw.get("year_of_production"),
        "scope_of_delivery": raw.get("scope_of_delivery"),
        "merchant_rating": raw.get("merchant_rating"),
        "merchant_reviews": raw.get("merchant_reviews"),
        "case_material": raw.get("case_material"),
        "bracelet_material": raw.get("bracelet_material"),
        "case_diameter": raw.get("case_diameter"),
    }


@app.get("/search")
def search(
    query: str = Query(default="", description="Free-text search query (e.g. 'Rolex Submariner')"),
    brand: str = Query(default="", description="Brand filter (e.g. 'Rolex')"),
    model: str = Query(default="", description="Model filter (e.g. 'Submariner')"),
    limit: int = Query(default=24, ge=1, le=120, description="Max number of listings to return"),
    max_price: float | None = Query(default=None, description="Maximum price in USD"),
    page: int = Query(default=1, ge=1, description="Page number (unused – handled by limit)"),
) -> dict:
    """
    Search Chrono24 listings and return them as JSON.

    The response envelope ``{"listings": [...]}`` is recognised by the TypeScript
    ``getArrayPayload()`` helper in chrono24-client.ts.
    """
    # Build the search query string: prefer explicit query, then brand+model, then brand alone
    search_query = (
        query.strip()
        or " ".join(filter(None, [brand.strip(), model.strip()]))
        or "Rolex"
    )

    logger.info("Searching Chrono24: query=%r limit=%d max_price=%s", search_query, limit, max_price)

    try:
        raw_listings = list(chrono24.query(search_query).search(limit=limit))
    except NoListingsFoundException:
        logger.warning("No listings found for query=%r", search_query)
        return {"listings": [], "total": 0}
    except RequestException as exc:
        logger.error("Chrono24 request failed: %s", exc)
        return {"listings": [], "error": str(exc), "total": 0}
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected error for query=%r: %s", search_query, exc)
        return {"listings": [], "error": str(exc), "total": 0}

    normalized = [_normalize_listing(item) for item in raw_listings]

    # Apply optional price filter (price is now numeric after _normalize_listing)
    if max_price is not None:
        normalized = [
            item for item in normalized
            if isinstance(item.get("price"), (int, float)) and item["price"] <= max_price
        ]

    logger.info("Returning %d listings", len(normalized))
    return {"listings": normalized, "total": len(normalized)}


@app.get("/health")
def health() -> dict:
    """Simple liveness check."""
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
