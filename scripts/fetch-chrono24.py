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
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

import chrono24
import requests
from chrono24 import session as chrono24_session
from chrono24.exceptions import NoListingsFoundException, RequestException
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
FLARESOLVERR_ENABLED = os.environ.get("FLARESOLVERR_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
FLARESOLVERR_URL = os.environ.get("FLARESOLVERR_URL", "http://localhost:8191").rstrip("/")
FLARESOLVERR_MAX_TIMEOUT_MS = env_int("FLARESOLVERR_MAX_TIMEOUT_MS", 60000)


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


def resolve_cloudflare_credentials() -> tuple[dict[str, str], str]:
    endpoint = f"{FLARESOLVERR_URL}/v1"
    payload = {
        "cmd": "request.get",
        "url": "https://www.chrono24.com/",
        "maxTimeout": FLARESOLVERR_MAX_TIMEOUT_MS,
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=90)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(
            f"Failed to reach FlareSolverr at {endpoint}: {type(exc).__name__}: {exc}"
        ) from exc

    try:
        body = response.json()
    except ValueError as exc:
        raise RuntimeError("FlareSolverr returned a non-JSON response.") from exc

    if body.get("status") != "ok":
        message = body.get("message") or "unknown FlareSolverr error"
        raise RuntimeError(f"FlareSolverr request failed: {message}")

    solution = body.get("solution")
    if not isinstance(solution, dict):
        raise RuntimeError("FlareSolverr response missing solution payload.")

    raw_cookies = solution.get("cookies")
    if not isinstance(raw_cookies, list):
        raise RuntimeError("FlareSolverr response missing cookies list in solution payload.")

    user_agent = solution.get("userAgent")
    if not isinstance(user_agent, str) or not user_agent.strip():
        raise RuntimeError("FlareSolverr response missing solution.userAgent.")

    cookies: dict[str, str] = {}
    for cookie in raw_cookies:
        if not isinstance(cookie, dict):
            continue
        name = cookie.get("name")
        value = cookie.get("value")
        if isinstance(name, str) and name and isinstance(value, str):
            cookies[name] = value

    if not cookies:
        raise RuntimeError("FlareSolverr did not return usable cookies.")

    return cookies, user_agent


def patch_chrono24_session(cookies: dict[str, str], user_agent: str) -> None:
    if getattr(chrono24_session._get_tenacity_wrapped_response, "_watchvault_flaresolverr_patch", False):
        return

    original_get_response = chrono24_session._get_tenacity_wrapped_response

    def patched_get_response(*args: Any, max_attempts: int = 8, **kwargs: Any) -> Any:
        input_headers = kwargs.get("headers", {}) or {}
        headers = dict(input_headers)
        headers["user-agent"] = user_agent
        headers["User-Agent"] = user_agent

        input_cookies = kwargs.get("cookies", {}) or {}
        merged_cookies = {**dict(input_cookies), **cookies}
        kwargs["headers"] = headers
        kwargs["cookies"] = merged_cookies

        return original_get_response(*args, max_attempts=max_attempts, **kwargs)

    patched_get_response._watchvault_flaresolverr_patch = True  # type: ignore[attr-defined]
    chrono24_session._get_tenacity_wrapped_response = patched_get_response


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
    attempted_at = utc_now_iso()
    previous_health = fetch_previous_health(supabase)
    previous_consecutive_failures = int(previous_health.get("consecutive_upstream_failures") or 0)
    previous_last_success_at = previous_health.get("last_success_at")
    flaresolverr_resolved: bool | None = None

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
            "flaresolverr_enabled": FLARESOLVERR_ENABLED,
            "flaresolverr_resolved": flaresolverr_resolved,
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

    if FLARESOLVERR_ENABLED:
        print(f"FlareSolverr enabled. Initializing via {FLARESOLVERR_URL}/v1")
        try:
            cookies, user_agent = resolve_cloudflare_credentials()
            patch_chrono24_session(cookies, user_agent)
            flaresolverr_resolved = True
            print(
                "FlareSolverr initialized successfully and Chrono24 session patch applied."
            )
        except Exception as exc:
            flaresolverr_resolved = False
            summary = (
                "FlareSolverr initialization failed; treating run as upstream unavailable and "
                "preserving cached listings."
            )
            print(f"  FlareSolverr initialization error: {type(exc).__name__}: {exc}")
            print(
                "::warning::FlareSolverr initialization failed; preserving cached listings for this run."
            )

            consecutive_upstream_failures = previous_consecutive_failures + 1
            sustained_upstream_failure = (
                consecutive_upstream_failures >= CHRONO24_UPSTREAM_FAILURE_THRESHOLD
            )
            latest_cached = fetch_latest_listing_timestamp(supabase)
            is_stale, age_hours = compute_listing_staleness(latest_cached)
            metrics = {
                "source": SOURCE_NAME,
                "status": "upstream_unavailable",
                "attempted_at": attempted_at,
                "upserted": 0,
                "skipped": 0,
                "retrieved": 0,
                "request_errors": 0,
                "upsert_errors": 0,
                "query_count": len(QUERIES),
                "request_error_rate": 0,
                "cached_listing_last_updated_at": latest_cached,
                "cached_listing_age_hours": age_hours,
                "cached_listing_is_stale": is_stale,
                "stale_after_hours": CHRONO24_STALE_AFTER_HOURS,
                "consecutive_upstream_failures": consecutive_upstream_failures,
                "sustained_upstream_failure": sustained_upstream_failure,
                "upstream_failure_threshold": CHRONO24_UPSTREAM_FAILURE_THRESHOLD,
                "failed": sustained_upstream_failure,
                "flaresolverr_enabled": FLARESOLVERR_ENABLED,
                "flaresolverr_resolved": flaresolverr_resolved,
            }
            write_sync_metrics(metrics)
            persist_observability(
                supabase,
                status="upstream_unavailable",
                summary=summary,
                metrics=metrics,
                consecutive_upstream_failures=consecutive_upstream_failures,
                previous_last_success_at=previous_last_success_at,
            )

            if sustained_upstream_failure:
                print(
                    "ERROR: FlareSolverr failed and Chrono24 upstream has been unavailable for too many "
                    "consecutive runs.",
                    file=sys.stderr,
                )
                sys.exit(1)

            return
    else:
        print("FlareSolverr disabled; using direct Chrono24 requests.")

    total_upserted = 0
    total_skipped = 0
    total_request_errors = 0
    total_retrieved = 0
    total_upsert_errors = 0

    for query_str in QUERIES:
        print(f"\nFetching: {query_str}")
        try:
            results = chrono24.query(query_str)
            listings = list(results.search(limit=LISTINGS_PER_QUERY))
            total_retrieved += len(listings)
            print(f"  Retrieved {len(listings)} listings")
        except NoListingsFoundException:
            print(f"  No listings found for '{query_str}' — skipping")
            continue
        except RequestException as exc:
            total_request_errors += 1
            print(f"  Request error for '{query_str}': {type(exc).__name__}: {exc!r} — skipping")
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
        "upstream_failure_threshold": CHRONO24_UPSTREAM_FAILURE_THRESHOLD,
        "failed": status in {"failed_upsert", "mapping_empty"} or sustained_upstream_failure,
        "flaresolverr_enabled": FLARESOLVERR_ENABLED,
        "flaresolverr_resolved": flaresolverr_resolved,
    }

    print(
        f"\nDone. Upserted: {total_upserted}  Skipped: {total_skipped}  "
        f"Retrieved: {total_retrieved}  RequestErrors: {total_request_errors}  "
        f"UpsertErrors: {total_upsert_errors}  Status: {status}  "
        f"ConsecutiveUpstreamFailures: {consecutive_upstream_failures}"
    )

    if status == "upstream_unavailable" and not sustained_upstream_failure:
        print(
            "::warning::Chrono24 upstream unavailable on this run; cached listings were preserved. "
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

    if sustained_upstream_failure:
        print(
            "ERROR: Chrono24 upstream has been unavailable for too many consecutive runs. "
            "Investigate upstream access and sync pipeline health.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
