# Chrono24 API Wrapper

A lightweight [FastAPI](https://fastapi.tiangolo.com/) server that wraps the
[irahorecka/chrono24](https://github.com/irahorecka/chrono24) Python library and exposes
Chrono24 watch listings as a JSON REST API for the Watch Intelligence Platform frontend.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the server (default port 8000)
python server.py
```

## Configure the Frontend

Set the environment variable before starting the React dev server:

```bash
VITE_CHRONO24_WRAPPER_BASE_URL=http://localhost:8000 npm run dev
```

Alternative supported names:

```bash
VITE_CHRONO24_API_HOST=http://localhost:8000 npm run dev
# or (when exposed via Vite envPrefix)
CHRONO24_WRAPPER_BASE_URL=http://localhost:8000 npm run dev
```

Or add it to a `.env.local` file in the project root:

```
VITE_CHRONO24_WRAPPER_BASE_URL=http://localhost:8000
```

If no Chrono24 base URL env is set, the frontend falls back to the Supabase
`chrono24-proxy` function URL derived from `VITE_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_URL` when available.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/search` | Search Chrono24 listings |
| `GET` | `/health` | Liveness check |

### `GET /search`

Query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | `""` | Free-text search (e.g. `Rolex Submariner`) |
| `brand` | string | `""` | Brand filter |
| `model` | string | `""` | Model filter |
| `limit` | int | `24` | Max listings to return (1–120) |
| `max_price` | float | `null` | Maximum price in USD |

**Example:**

```
GET http://localhost:8000/search?brand=Rolex&limit=10
```

**Response:**

```json
{
  "listings": [
    {
      "id": "32322343",
      "url": "https://chrono24.com/...",
      "manufacturer": "Rolex",
      "title": "Rolex Datejust 41",
      "description": "41mm Blue Diamond Dial 2022 - 126334",
      "price": 16553.0,
      "location": "Düsseldorf, Germany",
      "merchant_name": "Dealer",
      "image_urls": ["https://cdn2.chrono24.com/images/..."]
    }
  ],
  "total": 1
}
```

## Cloudflare Restrictions

Chrono24 uses Cloudflare anti-bot protection. If you see empty results or `RequestException`
errors, set up [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr) and route
requests through it as described in the
[chrono24 library README](https://github.com/irahorecka/chrono24#dealing-with-cloudflare-restrictions).

## Production Deployment

Deploy this server to any Python-compatible hosting platform
(e.g. [Railway](https://railway.app/), [Render](https://render.com/), Heroku) and set
`VITE_CHRONO24_WRAPPER_BASE_URL` to the public URL at build time.
