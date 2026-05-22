"""
Tests for the Chrono24 API Wrapper server.

Run with: pytest test_server.py
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from server import _normalize_listing, _parse_price_to_float, app

client = TestClient(app)


# ---------------------------------------------------------------------------
# _parse_price_to_float
# ---------------------------------------------------------------------------

class TestParsePriceToFloat:
    def test_dollar_with_commas(self):
        assert _parse_price_to_float("$16,553") == 16553.0

    def test_dollar_with_cents(self):
        assert _parse_price_to_float("$16,553.50") == 16553.50

    def test_plain_number_string(self):
        assert _parse_price_to_float("9500") == 9500.0

    def test_float_string(self):
        assert _parse_price_to_float("9500.99") == 9500.99

    def test_null_string_returns_none(self):
        assert _parse_price_to_float("null") is None

    def test_empty_string_returns_none(self):
        assert _parse_price_to_float("") is None

    def test_whitespace_returns_none(self):
        # Blank string after strip is falsy; _parse_price_to_float receives
        # the raw value from the library which may be " " in edge cases.
        # The function checks `not price_str`, so " " is truthy – the regex
        # finds no digits and returns None.
        assert _parse_price_to_float("   ") is None

    def test_price_with_currency_symbol_no_comma(self):
        assert _parse_price_to_float("€8500") == 8500.0

    def test_large_price(self):
        assert _parse_price_to_float("$250,000") == 250000.0


# ---------------------------------------------------------------------------
# _normalize_listing
# ---------------------------------------------------------------------------

class TestNormalizeListing:
    """Verify that _normalize_listing maps raw chrono24 library dicts to the
    field names expected by the TypeScript mapChrono24Listing() function."""

    def _make_raw(self, **overrides):
        base = {
            "id": "32322343",
            "url": "https://chrono24.com/rolex/datejust--id32322343.htm",
            "manufacturer": "Rolex",
            "certification_status": "Basic",
            "title": "Rolex Datejust 41",
            "description": "41mm Blue Diamond Dial 2022",
            "price": "$16,553",
            "shipping_price": "$396",
            "location": "Düsseldorf, Germany.",
            "merchant_name": "Chrono24 Dealer",
            "badge": "Professional",
            "image_urls": [
                "https://cdn2.chrono24.com/images/uhren/32322343-img1.jpg",
                "https://cdn2.chrono24.com/images/uhren/32322343-img2.jpg",
            ],
        }
        base.update(overrides)
        return base

    def test_price_converted_to_float(self):
        result = _normalize_listing(self._make_raw())
        assert result["price"] == 16553.0

    def test_id_preserved(self):
        result = _normalize_listing(self._make_raw())
        assert result["id"] == "32322343"

    def test_url_preserved(self):
        result = _normalize_listing(self._make_raw())
        assert result["url"] == "https://chrono24.com/rolex/datejust--id32322343.htm"

    def test_manufacturer_preserved(self):
        # TypeScript mapChrono24Listing picks "manufacturer" as "brand"
        result = _normalize_listing(self._make_raw())
        assert result["manufacturer"] == "Rolex"

    def test_title_preserved(self):
        # TypeScript mapChrono24Listing picks "title" as "model"
        result = _normalize_listing(self._make_raw())
        assert result["title"] == "Rolex Datejust 41"

    def test_image_urls_preserved(self):
        result = _normalize_listing(self._make_raw())
        assert isinstance(result["image_urls"], list)
        assert len(result["image_urls"]) == 2

    def test_location_preserved(self):
        result = _normalize_listing(self._make_raw())
        assert result["location"] == "Düsseldorf, Germany."

    def test_merchant_name_preserved(self):
        # TypeScript mapChrono24Listing picks "merchant_name" as "seller"
        result = _normalize_listing(self._make_raw())
        assert result["merchant_name"] == "Chrono24 Dealer"

    def test_null_price_falls_back_to_string(self):
        result = _normalize_listing(self._make_raw(price="null"))
        # "null" string cannot be converted; falls back to the raw "null" string
        # so the TypeScript client filters it out (price <= 0 or null).
        assert result["price"] == "null"

    def test_missing_price_falls_back_to_empty_string(self):
        raw = self._make_raw()
        del raw["price"]
        result = _normalize_listing(raw)
        assert result["price"] == ""

    def test_missing_image_urls_defaults_to_empty_list(self):
        raw = self._make_raw()
        del raw["image_urls"]
        result = _normalize_listing(raw)
        assert result["image_urls"] == []

    def test_detailed_fields_present_when_provided(self):
        raw = self._make_raw(
            reference_number="126334",
            condition="Very good",
            year_of_production="2022",
            scope_of_delivery="Original box, original papers",
            merchant_rating="4.4",
            merchant_reviews="196",
            case_material="Steel",
            bracelet_material="Steel",
            case_diameter="41 mm",
        )
        result = _normalize_listing(raw)
        assert result["reference_number"] == "126334"
        assert result["condition"] == "Very good"
        assert result["year_of_production"] == "2022"
        assert result["scope_of_delivery"] == "Original box, original papers"
        assert result["merchant_rating"] == "4.4"
        assert result["merchant_reviews"] == "196"
        assert result["case_material"] == "Steel"
        assert result["bracelet_material"] == "Steel"
        assert result["case_diameter"] == "41 mm"

    def test_detailed_fields_none_when_absent(self):
        result = _normalize_listing(self._make_raw())
        assert result["reference_number"] is None
        assert result["condition"] is None
        assert result["year_of_production"] is None


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_returns_ok_status(self):
        response = client.get("/health")
        assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# GET /search
# ---------------------------------------------------------------------------

def _make_library_listing(**overrides):
    """Build a dict that mimics what the chrono24 library's .search() yields."""
    base = {
        "id": "32322343",
        "url": "https://chrono24.com/rolex/datejust--id32322343.htm",
        "manufacturer": "Rolex",
        "certification_status": "Basic",
        "title": "Rolex Datejust 41",
        "description": "41mm Blue Diamond Dial 2022",
        "price": "$16,553",
        "shipping_price": "$396",
        "location": "Düsseldorf, Germany.",
        "merchant_name": "Chrono24 Dealer",
        "badge": "Professional",
        "image_urls": ["https://cdn2.chrono24.com/images/uhren/32322343-img1.jpg"],
    }
    base.update(overrides)
    return base


class TestSearchEndpoint:
    def _patch_chrono24(self, listings):
        """Return a context manager that patches chrono24.query to yield `listings`."""
        mock_instance = MagicMock()
        mock_instance.search.return_value = iter(listings)

        patcher = patch("server.chrono24.query", return_value=mock_instance)
        return patcher

    def test_happy_path_returns_listings(self):
        library_items = [_make_library_listing(), _make_library_listing(id="99999999", price="$8,000")]
        with self._patch_chrono24(library_items):
            response = client.get("/search?brand=Rolex&limit=10")

        assert response.status_code == 200
        body = response.json()
        assert "listings" in body
        assert body["total"] == 2
        assert len(body["listings"]) == 2

    def test_listing_price_is_numeric(self):
        with self._patch_chrono24([_make_library_listing()]):
            response = client.get("/search?brand=Rolex")

        listing = response.json()["listings"][0]
        assert isinstance(listing["price"], float)
        assert listing["price"] == 16553.0

    def test_listing_manufacturer_is_preserved(self):
        with self._patch_chrono24([_make_library_listing()]):
            response = client.get("/search?brand=Rolex")

        listing = response.json()["listings"][0]
        assert listing["manufacturer"] == "Rolex"

    def test_listing_image_urls_is_list(self):
        with self._patch_chrono24([_make_library_listing()]):
            response = client.get("/search?brand=Rolex")

        listing = response.json()["listings"][0]
        assert isinstance(listing["image_urls"], list)
        assert len(listing["image_urls"]) > 0

    def test_max_price_filter_removes_expensive_listings(self):
        items = [
            _make_library_listing(id="cheap", price="$5,000"),
            _make_library_listing(id="expensive", price="$30,000"),
        ]
        with self._patch_chrono24(items):
            response = client.get("/search?brand=Rolex&max_price=10000")

        body = response.json()
        assert body["total"] == 1
        assert body["listings"][0]["price"] == 5000.0

    def test_max_price_filter_keeps_all_when_none(self):
        items = [
            _make_library_listing(id="a", price="$5,000"),
            _make_library_listing(id="b", price="$30,000"),
        ]
        with self._patch_chrono24(items):
            response = client.get("/search?brand=Rolex")

        assert response.json()["total"] == 2

    def test_no_listings_found_exception_returns_empty(self):
        from chrono24.exceptions import NoListingsFoundException

        with patch("server.chrono24.query", side_effect=NoListingsFoundException("No listings")):
            response = client.get("/search?query=NonExistentWatchXYZ")

        assert response.status_code == 200
        body = response.json()
        assert body["listings"] == []
        assert body["total"] == 0

    def test_request_exception_returns_empty_with_error(self):
        from chrono24.exceptions import RequestException

        with patch("server.chrono24.query", side_effect=RequestException("Cloudflare blocked")):
            response = client.get("/search?query=Rolex")

        assert response.status_code == 200
        body = response.json()
        assert body["listings"] == []
        assert "error" in body

    def test_unexpected_exception_returns_empty_with_error(self):
        with patch("server.chrono24.query", side_effect=RuntimeError("unexpected")):
            response = client.get("/search?query=Rolex")

        assert response.status_code == 200
        body = response.json()
        assert body["listings"] == []
        assert "error" in body

    def test_default_query_falls_back_to_rolex(self):
        """When neither query nor brand/model is provided, the server falls back to 'Rolex'."""
        mock_instance = MagicMock()
        mock_instance.search.return_value = iter([])

        with patch("server.chrono24.query", return_value=mock_instance) as mock_query:
            client.get("/search")

        mock_query.assert_called_once_with("Rolex")

    def test_query_param_takes_precedence(self):
        mock_instance = MagicMock()
        mock_instance.search.return_value = iter([])

        with patch("server.chrono24.query", return_value=mock_instance) as mock_query:
            client.get("/search?query=Omega+Seamaster")

        mock_query.assert_called_once_with("Omega Seamaster")

    def test_brand_model_combined_when_no_query(self):
        mock_instance = MagicMock()
        mock_instance.search.return_value = iter([])

        with patch("server.chrono24.query", return_value=mock_instance) as mock_query:
            client.get("/search?brand=Omega&model=Seamaster")

        mock_query.assert_called_once_with("Omega Seamaster")

    def test_limit_is_passed_to_library(self):
        mock_instance = MagicMock()
        mock_instance.search.return_value = iter([])

        with patch("server.chrono24.query", return_value=mock_instance):
            client.get("/search?brand=Rolex&limit=5")

        mock_instance.search.assert_called_once_with(limit=5)

    def test_response_envelope_has_listings_key(self):
        """The TypeScript getArrayPayload() helper looks for a 'listings' key."""
        with self._patch_chrono24([_make_library_listing()]):
            response = client.get("/search?brand=Rolex")

        assert "listings" in response.json()
