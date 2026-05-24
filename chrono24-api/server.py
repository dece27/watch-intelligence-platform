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
_RE_PRICE = re.compile(r"[-\d,.]+")


def _parse_price_to_float(price_str: str) -> float | None:
    """Convert mixed locale price strings to float (e.g. '$16,553' or '16.553')."""
    if not price_str or price_str.strip().lower() == "null":
        return None

    digits = _RE_PRICE.search(price_str)
    if not digits:
        return None

    normalized = digits.group().replace(" ", "")

    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        parts = normalized.split(",")
        if len(parts[-1]) in (1, 2):
            normalized = f'{"".join(parts[:-1])}.{parts[-1]}'
        else:
            normalized = "".join(parts)
    elif "." in normalized:
        parts = normalized.split(".")
        if len(parts[-1]) in (1, 2):
            normalized = f'{"".join(parts[:-1])}.{parts[-1]}'
        elif len(parts) > 1 and all(len(part) == 3 for part in parts[1:]):
            normalized = "".join(parts)

    try:
        return float(normalized)
    except ValueError:
        return None


def _parse_filters(filters: str) -> list[str] | str:
    entries = [entry.strip() for entry in filters.split(",") if entry.strip()]
    if len(entries) == 0:
        return ""
    if len(entries) == 1:
        return entries[0]
    return entries


def _apply_price_filters(
    listings: list[dict[str, Any]],
    min_price: float | None,
    max_price: float | None,
) -> list[dict[str, Any]]:
    if min_price is None and max_price is None:
        return listings

    filtered: list[dict[str, Any]] = []
    for item in listings:
        price = item.get("price")
        if not isinstance(price, (int, float)):
            continue
        if min_price is not None and price < min_price:
            continue
        if max_price is not None and price > max_price:
            continue
        filtered.append(item)
    return filtered


def _paginate_listings(listings: list[dict[str, Any]], page: int, limit: int) -> list[dict[str, Any]]:
    start = (page - 1) * limit
    end = start + limit
    return listings[start:end]


def _search_chrono24(
    query_text: str,
    limit: int,
    page: int,
    detailed: bool,
    filters: str,
    min_year: int | None,
    max_year: int | None,
) -> list[dict[str, Any]]:
    page_limit = limit * page
    parsed_filters = _parse_filters(filters)
    query_kwargs: dict[str, Any] = {}
    if parsed_filters:
        query_kwargs["filters"] = parsed_filters
    if min_year is not None:
        query_kwargs["min_year"] = min_year
    if max_year is not None:
        query_kwargs["max_year"] = max_year

    chrono_query = chrono24.query(query_text, **query_kwargs)
    iterator = chrono_query.detailed_search(limit=page_limit) if detailed else chrono_query.search(limit=page_limit)
    return list(iterator)


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
    detailed: bool = Query(default=False, description="Fetch detailed listing fields from listing pages"),
    filters: str = Query(default="", description="Chrono24 filter keys (comma-separated)"),
    min_year: int | None = Query(default=None, ge=1900, le=2100, description="Minimum production year filter"),
    max_year: int | None = Query(default=None, ge=1900, le=2100, description="Maximum production year filter"),
    min_price: float | None = Query(default=None, description="Minimum price in USD"),
    limit: int = Query(default=24, ge=1, le=120, description="Max number of listings to return"),
    max_price: float | None = Query(default=None, description="Maximum price in USD"),
    page: int = Query(default=1, ge=1, description="1-indexed page number"),
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

    if min_year is not None and max_year is not None and min_year > max_year:
        return {"listings": [], "error": "min_year cannot be greater than max_year.", "total": 0}

    logger.info(
        "Searching Chrono24: query=%r limit=%d page=%d min_price=%s max_price=%s detailed=%s filters=%r min_year=%s max_year=%s",
        search_query,
        limit,
        page,
        min_price,
        max_price,
        detailed,
        filters,
        min_year,
        max_year,
    )

    try:
        raw_listings = _search_chrono24(
            query_text=search_query,
            limit=limit,
            page=page,
            detailed=detailed,
            filters=filters,
            min_year=min_year,
            max_year=max_year,
        )
    except NoListingsFoundException:
        logger.warning("No listings found for query=%r", search_query)
        return {"listings": [], "total": 0}
    except ValueError as exc:
        logger.warning("Invalid Chrono24 filter input for query=%r: %s", search_query, exc)
        return {"listings": [], "error": str(exc), "total": 0}
    except RequestException as exc:
        logger.error("Chrono24 request failed: %s", exc)
        return {"listings": [], "error": str(exc), "total": 0}
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected error for query=%r: %s", search_query, exc)
        return {"listings": [], "error": str(exc), "total": 0}

    normalized = [_normalize_listing(item) for item in raw_listings]

    filtered = _apply_price_filters(normalized, min_price=min_price, max_price=max_price)
    paged = _paginate_listings(filtered, page=page, limit=limit)

    logger.info("Returning %d listings", len(paged))
    return {"listings": paged, "total": len(paged)}


@app.get("/health")
def health() -> dict:
    """Simple liveness check."""
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
