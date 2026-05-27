#!/usr/bin/env python3
"""
WatchVault — Chrono24 live data fetcher.
Uses Playwright (headless Chromium) to render Chrono24 search pages and extract listings.
Fetches real listings and writes them to Supabase (deal_listings table).

Usage:
  python scripts/fetch-chrono24.py

Environment variables required:
  SUPABASE_URL              — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (server-side only)
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from supabase import Client, create_client


SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SOURCE_NAME = "chrono24"
CHRONO24_ACCESS_APPROVED = os.environ.get("CHRONO24_ACCESS_APPROVED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
CHRONO24_SYNC_METRICS_PATH = os.environ.get("CHRONO24_SYNC_METRICS_PATH")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
    sys.exit(1)


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        print(f"Warning: invalid integer for {name}={raw!r}; using default {default}")
        return default


CHRONO24_UPSTREAM_FAILURE_THRESHOLD = env_int("CHRONO24_UPSTREAM_FAILURE_THRESHOLD", 4)
CHRONO24_STALE_AFTER_HOURS = env_int("CHRONO24_STALE_AFTER_HOURS", 48)
PLAYWRIGHT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = 60_000
PLAYWRIGHT_WAIT_FOR_LISTINGS_MS = 20_000
PLAYWRIGHT_DEBUG_ARTIFACTS_DIR = os.environ.get("CHRONO24_PLAYWRIGHT_DEBUG_DIR", "/tmp")

# CSS selector string used by wait_for_selector and the JS extractor
_CARD_SELECTORS_CSS = (
    "article.article-item,"
    "[data-article-id],"
    ".js-article-item"
)

# JavaScript evaluated inside the browser page to extract raw listing dicts
_JS_EXTRACT_LISTINGS = """
(limit) => {
    const CARD_SELECTORS = [
        'article.article-item',
        '[data-article-id]',
        '.js-article-item',
        '[class*="article-item"]',
        '[class*="ArticleItem"]',
    ];
    let cards = [];
    for (const sel of CARD_SELECTORS) {
        cards = Array.from(document.querySelectorAll(sel));
        if (cards.length > 0) break;
    }
    if (!cards.length) return [];

    function first(root, sels) {
        for (const s of sels) {
            const el = root.querySelector(s);
            if (el && el.textContent.trim()) return el.textContent.trim();
        }
        return '';
    }

    const results = [];
    for (const card of cards.slice(0, limit)) {
        const anchor = card.tagName === 'A' ? card
            : card.querySelector('a[href*=".htm"]') || card.querySelector('a[href]');
        const url = anchor ? anchor.href : '';
        if (!url || !url.includes('chrono24.com')) continue;

        const img = card.querySelector('img[src]:not([src=""])') || card.querySelector('img[data-src]');
        const imageUrl = img ? (img.src || img.getAttribute('data-src') || null) : null;

        results.push({
            url,
            price: first(card, ['[class*="js-format-price"]', '[class*="price"]', '[data-price]']),
            title: first(card, ['h2', 'h3', '[class*="article-title"]', '[class*="title"]', '[class*="name"]']),
            reference: first(card, ['[class*="reference"]', '[data-reference]']),
            condition: first(card, ['[class*="condition"]', '[class*="used"]', '[data-condition]']),
            location: first(card, ['[class*="location"]', '[class*="seller"]', '[data-location]']),
            year: first(card, ['[class*="year"]', '[data-year]']),
            manufacturer: first(card, ['[class*="brand"]', '[class*="manufacturer"]', '[data-brand]']),
            imageUrl: imageUrl || null,
        });
    }
    return results;
}
"""


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


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_timestamp(timestamp: str | None) -> datetime | None:
    if not timestamp:
        return None

    normalized = timestamp.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def compute_listing_staleness(latest_timestamp: str | None) -> tuple[bool, float | None]:
    parsed = parse_timestamp(latest_timestamp)
    if parsed is None:
        return True, None

    age_hours = round((datetime.now(timezone.utc) - parsed).total_seconds() / 3600, 2)
    return age_hours >= CHRONO24_STALE_AFTER_HOURS, age_hours


def truncate_text(value: Any, *, limit: int = 280) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else f"{text[: limit - 3]}..."


class ListingsNotFoundError(Exception):
    """Raised when the search page renders but contains no listing cards."""


class UpstreamFetchError(Exception):
    """Raised when the browser request fails (navigation timeout or bot-detection)."""


def _dismiss_cookie_banner(page: Any) -> None:
    """Attempt to close a cookie-consent overlay if one is present."""
    consent_selectors = [
        "#onetrust-accept-btn-handler",
        "button[id*='accept']",
        "button[class*='accept']",
        "[data-testid*='accept']",
        ".js-consent-accept",
    ]
    for sel in consent_selectors:
        try:
            btn = page.query_selector(sel)
            if btn and btn.is_visible():
                btn.click()
                page.wait_for_timeout(500)
                return
        except Exception:
            continue


def _save_debug_screenshot(page: Any, query: str) -> None:
    """Save a PNG screenshot to RUNNER_TEMP for workflow artifact upload."""
    try:
        safe = "".join(c if c.isalnum() else "_" for c in query)[:40]
        path = os.path.join(PLAYWRIGHT_DEBUG_ARTIFACTS_DIR, f"chrono24_debug_{safe}.png")
        page.screenshot(path=path)
        print(f"  Debug screenshot saved: {path}")
    except Exception as exc:
        print(f"  Warning: could not save debug screenshot: {exc}")


def search_listings_playwright(query: str, limit: int) -> list[dict[str, Any]]:
    """
    Fetch up to ``limit`` Chrono24 listings for ``query`` using a headless Chromium browser.

    Returns a list of raw listing dicts compatible with :func:`to_deal_listing`.
    Raises :class:`UpstreamFetchError` on navigation timeout or bot-detection pages.
    Raises :class:`ListingsNotFoundError` when the page renders with no listing cards.
    """
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright

    limit = max(1, int(limit))

    search_url = (
        "https://www.chrono24.com/search/index.htm?"
        + urlencode({"query": query, "resultview": "list", "dosearch": "true"})
    )
    print(f"  Playwright: {search_url}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = browser.new_context(
            user_agent=PLAYWRIGHT_USER_AGENT,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            timezone_id="America/New_York",
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = context.new_page()

        try:
            page.goto(
                search_url,
                wait_until="domcontentloaded",
                timeout=PLAYWRIGHT_NAVIGATION_TIMEOUT_MS,
            )
        except PlaywrightTimeoutError as exc:
            _save_debug_screenshot(page, query)
            browser.close()
            raise UpstreamFetchError(f"Navigation timeout for '{query}'") from exc

        _dismiss_cookie_banner(page)

        try:
            page.wait_for_selector(_CARD_SELECTORS_CSS, timeout=PLAYWRIGHT_WAIT_FOR_LISTINGS_MS)
        except PlaywrightTimeoutError:
            html_lower = page.content().lower()
            _save_debug_screenshot(page, query)
            browser.close()
            if "just a moment" in html_lower or "cf-browser-verification" in html_lower:
                raise UpstreamFetchError(
                    f"Bot-detection page detected for '{query}'; Cloudflare may be blocking the request."
                )
            raise ListingsNotFoundError(f"No listing cards found for '{query}'")

        raw: list[dict[str, Any]] = page.evaluate(_JS_EXTRACT_LISTINGS, limit)
        browser.close()

    if not raw:
        raise ListingsNotFoundError(f"No listings extracted for '{query}'")

    print(f"  Playwright: extracted {len(raw)} raw listings")
    return raw


def fetch_previous_health(supabase: Client) -> dict[str, Any]:
    try:
        response = (
            supabase.table("sync_health")
            .select("*")
            .eq("source", SOURCE_NAME)
            .limit(1)
            .execute()
        )
        rows = getattr(response, "data", None) or []
        return rows[0] if rows else {}
    except Exception as exc:
        print(
            f"  Warning: unable to read sync_health (non-fatal): {type(exc).__name__}: {exc}"
        )
        return {}


def fetch_latest_listing_timestamp(supabase: Client) -> str | None:
    try:
        response = (
            supabase.table("deal_listings")
            .select("updated_at")
            .eq("source", SOURCE_NAME)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = getattr(response, "data", None) or []
        if not rows:
            return None
        return rows[0].get("updated_at")
    except Exception as exc:
        print(
            f"  Warning: unable to inspect cached deal_listings staleness (non-fatal): "
            f"{type(exc).__name__}: {exc}"
        )
        return None


def write_sync_metrics(metrics: dict[str, Any]) -> None:
    print(f"SYNC_METRICS_JSON={json.dumps(metrics, sort_keys=True)}")
    if not CHRONO24_SYNC_METRICS_PATH:
        return

    try:
        with open(CHRONO24_SYNC_METRICS_PATH, "w", encoding="utf-8") as metrics_file:
            json.dump(metrics, metrics_file, indent=2, sort_keys=True)
    except Exception as exc:
        print(f"  Warning: unable to write sync metrics file (non-fatal): {type(exc).__name__}: {exc}")


def persist_observability(
    supabase: Client,
    *,
    status: str,
    summary: str,
    metrics: dict[str, Any],
    consecutive_upstream_failures: int,
    previous_last_success_at: str | None = None,
) -> None:
    payload = {
        "source": SOURCE_NAME,
        "status": status,
        "summary": summary,
        "metrics": metrics,
        "consecutive_upstream_failures": consecutive_upstream_failures,
        "last_attempt_at": metrics["attempted_at"],
        "last_success_at": metrics["attempted_at"] if status == "success" else previous_last_success_at,
        "updated_at": metrics["attempted_at"],
    }

    try:
        supabase.table("sync_runs").insert(
            {
                "source": SOURCE_NAME,
                "status": status,
                "summary": summary,
                "metrics": metrics,
                "created_at": metrics["attempted_at"],
            }
        ).execute()
    except Exception as exc:
        print(
            f"  Warning: unable to insert sync_runs observability row (non-fatal): "
            f"{type(exc).__name__}: {exc}"
        )

    try:
        supabase.table("sync_health").upsert(payload, on_conflict="source").execute()
    except Exception as exc:
        print(
            f"  Warning: unable to update sync_health observability row (non-fatal): "
            f"{type(exc).__name__}: {exc}"
        )


def to_deal_listing(listing: dict[str, Any]) -> dict[str, Any] | None:
    """
    Convert a Playwright-extracted listing dict to the WatchVault deal_listings
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
    attempted_at = utc_now_iso()
    previous_health = fetch_previous_health(supabase)
    previous_consecutive_failures = int(previous_health.get("consecutive_upstream_failures") or 0)
    previous_last_success_at = previous_health.get("last_success_at")

    if not CHRONO24_ACCESS_APPROVED:
        latest_cached = fetch_latest_listing_timestamp(supabase)
        is_stale, age_hours = compute_listing_staleness(latest_cached)
        summary = (
            "Chrono24 sync skipped because CHRONO24_ACCESS_APPROVED is not true. "
            "Configure an approved data-access path first."
        )
        metrics = {
            "source": SOURCE_NAME,
            "status": "skipped_unapproved_access",
            "attempted_at": attempted_at,
            "upserted": 0,
            "retrieved": 0,
            "request_errors": 0,
            "upsert_errors": 0,
            "query_count": len(QUERIES),
            "request_error_rate": 0,
            "cached_listing_last_updated_at": latest_cached,
            "cached_listing_age_hours": age_hours,
            "cached_listing_is_stale": is_stale,
            "stale_after_hours": CHRONO24_STALE_AFTER_HOURS,
            "consecutive_upstream_failures": 0,
            "sustained_upstream_failure": False,
            "failed": False,
        }
        print(summary)
        print(
            "::warning::Chrono24 sync skipped because CHRONO24_ACCESS_APPROVED is not true. "
            "This run is non-fatal and preserves existing cached listings."
        )
        write_sync_metrics(metrics)
        persist_observability(
            supabase,
            status="skipped_unapproved_access",
            summary=summary,
            metrics=metrics,
            consecutive_upstream_failures=0,
            previous_last_success_at=previous_last_success_at,
        )
        return

    total_upserted = 0
    total_skipped = 0
    total_request_errors = 0
    total_retrieved = 0
    total_upsert_errors = 0

    for query_str in QUERIES:
        print(f"\nFetching: {query_str}")
        try:
            listings = search_listings_playwright(query_str, LISTINGS_PER_QUERY)
            total_retrieved += len(listings)
            print(f"  Retrieved {len(listings)} listings")
        except ListingsNotFoundError:
            print(f"  No listings found for '{query_str}' — skipping")
            continue
        except UpstreamFetchError as exc:
            total_request_errors += 1
            print(f"  Fetch error for '{query_str}': {type(exc).__name__}: {exc!r} — skipping")
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

        try:
            response = supabase.table("deal_listings").upsert(rows, on_conflict="id").execute()
            response_error = getattr(response, "error", None)
            if response_error:
                total_upsert_errors += 1
                print(f"  Supabase upsert error: {response_error}")
                continue
        except Exception as exc:  # defensive: supabase-py error surface varies by version
            total_upsert_errors += 1
            print(f"  Supabase upsert exception: {type(exc).__name__}: {exc}")
            continue

        total_upserted += len(rows)
        print(f"  Upserted {len(rows)} rows")

    request_error_rate = round(total_request_errors / len(QUERIES), 4) if QUERIES else 0

    if total_upsert_errors > 0:
        status = "failed_upsert"
        summary = "One or more Supabase upserts failed."
    elif total_upserted > 0:
        status = "success"
        summary = "Chrono24 sync completed successfully."
    elif total_request_errors > 0 or total_retrieved == 0:
        status = "upstream_unavailable"
        summary = "Chrono24 upstream unavailable or blocked; preserving cached listings."
    else:
        status = "mapping_empty"
        summary = (
            "Listings were retrieved but none were valid for upsert. "
            "Verify mapping in scripts/fetch-chrono24.py."
        )

    consecutive_upstream_failures = (
        previous_consecutive_failures + 1 if status == "upstream_unavailable" else 0
    )
    sustained_upstream_failure = (
        status == "upstream_unavailable"
        and consecutive_upstream_failures >= CHRONO24_UPSTREAM_FAILURE_THRESHOLD
    )

    latest_cached = fetch_latest_listing_timestamp(supabase)
    is_stale, age_hours = compute_listing_staleness(latest_cached)
    no_cached_listings = latest_cached is None
    hard_upstream_failure = status == "upstream_unavailable" and sustained_upstream_failure

    metrics = {
        "source": SOURCE_NAME,
        "status": status,
        "attempted_at": attempted_at,
        "upserted": total_upserted,
        "skipped": total_skipped,
        "retrieved": total_retrieved,
        "request_errors": total_request_errors,
        "upsert_errors": total_upsert_errors,
        "query_count": len(QUERIES),
        "request_error_rate": request_error_rate,
        "cached_listing_last_updated_at": latest_cached,
        "cached_listing_age_hours": age_hours,
        "cached_listing_is_stale": is_stale,
        "stale_after_hours": CHRONO24_STALE_AFTER_HOURS,
        "consecutive_upstream_failures": consecutive_upstream_failures,
        "sustained_upstream_failure": sustained_upstream_failure,
        "no_cached_listings": no_cached_listings,
        "hard_upstream_failure": hard_upstream_failure,
        "upstream_failure_threshold": CHRONO24_UPSTREAM_FAILURE_THRESHOLD,
        "failed": status in {"failed_upsert", "mapping_empty"} or hard_upstream_failure,
    }

    print(
        f"\nDone. Upserted: {total_upserted}  Skipped: {total_skipped}  "
        f"Retrieved: {total_retrieved}  RequestErrors: {total_request_errors}  "
        f"UpsertErrors: {total_upsert_errors}  Status: {status}  "
        f"ConsecutiveUpstreamFailures: {consecutive_upstream_failures}"
    )

    if status == "upstream_unavailable" and not hard_upstream_failure:
        cached_state_note = (
            " No cached listings are currently available; retrying until the configured failure "
            "threshold is reached."
            if no_cached_listings
            else " Cached listings were preserved."
        )
        print(
            f"::warning::Chrono24 upstream unavailable on this run;{cached_state_note} "
            f"Consecutive upstream failures: {consecutive_upstream_failures}/"
            f"{CHRONO24_UPSTREAM_FAILURE_THRESHOLD}."
        )

    write_sync_metrics(metrics)
    persist_observability(
        supabase,
        status=status,
        summary=summary,
        metrics=metrics,
        consecutive_upstream_failures=consecutive_upstream_failures,
        previous_last_success_at=previous_last_success_at,
    )

    if status == "failed_upsert":
        print("ERROR: One or more Supabase upserts failed.", file=sys.stderr)
        sys.exit(1)

    if status == "mapping_empty":
        print(
            "ERROR: Listings were retrieved but none were valid for upsert. "
            "Verify field mapping in scripts/fetch-chrono24.py.",
            file=sys.stderr,
        )
        sys.exit(1)

    if hard_upstream_failure:
        if no_cached_listings:
            print(
                "ERROR: Chrono24 upstream unavailable and no cached listings are available. "
                "Investigate upstream access and Playwright browser scraping.",
                file=sys.stderr,
            )
        else:
            print(
                "ERROR: Chrono24 upstream has been unavailable for too many consecutive runs. "
                "Investigate upstream access and sync pipeline health.",
                file=sys.stderr,
            )
        sys.exit(1)


if __name__ == "__main__":
    main()
