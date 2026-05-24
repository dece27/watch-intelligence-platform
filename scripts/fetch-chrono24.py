#!/usr/bin/env python3
"""
WatchVault — Chrono24 live data fetcher.
Uses the irahorecka/chrono24 library: https://github.com/irahorecka/chrono24
Fetches real listings and writes them to Supabase (deal_listings table).

Usage:
  python scripts/fetch-chrono24.py

Environment variables required:
  SUPABASE_URL              — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (server-side only)
"""

from __future__ import annotations

import hashlib
import os
import sys
import uuid
from datetime import datetime
from typing import Any

import chrono24
from chrono24.exceptions import NoListingsFoundException, RequestException
from supabase import Client, create_client


SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
    sys.exit(1)


QUERIES = [
    "Rolex Submariner",
    "Rolex Daytona",
    "Rolex GMT-Master II",
    "Patek Philippe Nautilus",
    "Patek Philippe Aquanaut",
    "Audemars Piguet Royal Oak",
    "Grand Seiko SLGH005",
    "Omega Speedmaster",
    "IWC Portugieser",
    "Cartier Santos",
]

LISTINGS_PER_QUERY = 24

WATCH_CONDITIONS = {
    "new": "Unworn",
    "unworn": "Unworn",
    "mint": "Mint",
    "excellent": "Excellent",
    "very good": "Very Good",
    "good": "Good",
    "fair": "Fair",
}


def listing_id(url: str) -> str:
    """Stable UUID for a listing URL."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, url))


def parse_price(price_str: Any) -> float | None:
    """Parse a price string like '$12,500' or '12500 USD' to float."""
    if not price_str:
        return None

    cleaned = str(price_str).replace(",", "").replace("$", "").replace("€", "").strip()
    numeric = "".join(char for char in cleaned if char.isdigit() or char == ".")
    if not numeric:
        return None

    try:
        return float(numeric)
    except ValueError:
        return None


def parse_year(year_str: Any) -> int | None:
    """Parse year string to int."""
    if not year_str:
        return None

    try:
        year = int(str(year_str).strip())
        current_year = datetime.now().year
        return year if 1900 <= year <= current_year + 1 else None
    except ValueError:
        return None


def normalize_condition(raw_condition: Any) -> str | None:
    if not raw_condition:
        return None

    normalized = str(raw_condition).strip().lower()
    for key, value in WATCH_CONDITIONS.items():
        if key in normalized:
            return value
    return None


def pick_photo_url(listing: dict[str, Any]) -> str | None:
    image_urls = listing.get("imageUrls")
    if isinstance(image_urls, list) and image_urls:
        return image_urls[0]

    image_url = listing.get("imageUrl")
    return str(image_url) if image_url else None


def fallback_reference(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def to_deal_listing(listing: dict[str, Any]) -> dict[str, Any] | None:
    """
    Convert a chrono24 library listing dict to the WatchVault deal_listings
    table schema. Returns None if required fields are missing.
    """
    url = listing.get("url") or listing.get("detailPageUrl") or ""
    if not url:
        return None

    asking_price = parse_price(listing.get("price") or listing.get("priceWithCurrencySymbol"))
    if asking_price is None or asking_price <= 0:
        return None

    brand = str(listing.get("manufacturer") or listing.get("brand") or "").strip()
    model = str(listing.get("title") or listing.get("name") or "").strip()
    reference = str(listing.get("referenceNumber") or listing.get("reference") or "").strip()

    if not brand and not model:
        return None

    return {
        "id": listing_id(url),
        "brand": brand or (model.split()[0] if model else "Unknown"),
        "model": model or None,
        "reference": reference or fallback_reference(url),
        "year": parse_year(listing.get("productionYear") or listing.get("year")),
        "condition": normalize_condition(listing.get("condition")),
        "asking_price": asking_price,
        "fair_value": asking_price,
        "currency": listing.get("currency") or "USD",
        "seller_rating": None,
        "days_listed": 0,
        "location": listing.get("location") or listing.get("countryName") or None,
        "has_box": None,
        "has_papers": None,
        "source": "chrono24",
        "external_url": url,
        "photo_url": pick_photo_url(listing),
        "is_active": True,
    }


def main() -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    total_upserted = 0
    total_skipped = 0

    for query_str in QUERIES:
        print(f"\nFetching: {query_str}")
        try:
            results = chrono24.query(query_str)
            listings = list(results.search(limit=LISTINGS_PER_QUERY))
            print(f"  Retrieved {len(listings)} listings")
        except NoListingsFoundException:
            print(f"  No listings found for '{query_str}' — skipping")
            continue
        except RequestException as exc:
            print(f"  Request error for '{query_str}': {exc} — skipping")
            continue

        rows: list[dict[str, Any]] = []
        for raw in listings:
            row = to_deal_listing(raw)
            if row is None:
                total_skipped += 1
                continue
            rows.append(row)

        if not rows:
            print(f"  No valid rows to upsert for '{query_str}'")
            continue

        response = supabase.table("deal_listings").upsert(rows, on_conflict="id").execute()

        if hasattr(response, "error") and response.error:
            print(f"  Supabase upsert error: {response.error}")
        else:
            total_upserted += len(rows)
            print(f"  Upserted {len(rows)} rows")

    print(f"\nDone. Upserted: {total_upserted}  Skipped: {total_skipped}")


if __name__ == "__main__":
    main()
