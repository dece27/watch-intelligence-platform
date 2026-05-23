# Watch Intelligence Platform (WatchVault)

Watch Intelligence Platform is a collector-focused web application for managing luxury watch portfolios, tracking market signals, and making data-informed buy/sell decisions with AI-assisted insights.

## Project Goal

The goal of this project is to provide a single operating system for watch collectors:

- Maintain a structured, searchable collection vault
- Monitor portfolio performance and valuation trends
- Track market sentiment, auction outcomes, and price movers
- Discover and score deals based on portfolio fit
- Generate appraisal-ready watch reports
- Use AI to identify watches, analyze signals, and suggest rebalancing actions
- Stay current with watch industry news from top editorial sources

## Main Features & Capabilities

### 1) Collection Vault
- Add, edit, remove, filter, and search watches
- Capture full watch metadata (brand, model, reference, serial, year, condition, movement, case material, accessories, notes)
- Import collection data via CSV
- Upload watch photos (file or camera) with safe data-URL handling; photos are persisted separately in KV storage
- Share read-only collection links via a public slug (works on GitHub Pages with hash routing)
- Multi-currency display: USD, EUR, GBP, JPY, CHF, CAD, AUD (static fallback rates; currency preference stored per user)

### 2) Portfolio Intelligence
- Portfolio health scoring and ROI tracking
- Brand and allocation visualization
- Hold-period analysis and performance breakdowns
- Live market value enrichment for owned watches (via WatchCharts API when configured)
- What-If Sell Calculator for scenario planning

### 3) Market Intelligence
- 12-month multi-brand sentiment line chart with per-brand visibility toggles
- Price alerts and top-mover monitoring
- Recent auction result aggregation and display
- Brand-level index snapshots for quick market context

### 4) AI Advisor
- AI Signal Engine for personalized market and portfolio signals
- Rebalancing recommendations (sell/buy guidance and strategic score)
- AI-assisted watch image identification with file upload/camera input
- Per-user signal and deal assessment cache keyed on a dependency hash (watches + preferences + vault metadata)

### 5) Deals Discovery
- Live deal sourcing via the Chrono24 wrapper API (when configured), with curated fallback data
- Match and deal scoring based on user preferences and owned brands
- Filtering by budget, condition, box/papers, preferred brands, and seller rating
- Deal detail views with contextual scoring signals
- AI-only top-pick filter

### 6) Appraisal Reporting
- Professional appraisal report generation for owned watches
- Market-value-backed valuation output when available
- Print-ready report experience

### 7) News Feed
- Live watch industry news aggregated from 17 RSS sources across three editorial tiers (Hodinkee, Fratello, Monochrome, and more)
- Articles deduplicated and cached in KV for 30 minutes
- Relevance scoring based on owned brands, reference numbers, recency, and source tier
- Sort by most recent or most relevant to your collection

### 8) Authentication, Admin, and Analytics
- Password-based login with PBKDF2-hashed credentials, account lockout, and Remember Me support
- Per-user isolated vault with persisted context (watches, preferences, shared links)
- Owner/admin-only dashboards for platform feedback and user analytics
- Admin controls for user-level cleanup and system resets; protected admin account cannot be deleted
- User index maintained via `all_user_ids` KV key; per-user AI usage tracked via `ai_usage_<userId>`

## Tech Stack

- **React 19 + TypeScript + Vite 6** — frontend framework and build tooling
- **Tailwind CSS v4 + Radix UI primitives** — styling and accessible UI components
- **Framer Motion** — animations and page transitions
- **TanStack React Query** — server-state and async data management
- **Recharts + D3** — charting and data visualization
- **Phosphor Icons + Heroicons + Lucide React** — icon sets
- **React Hook Form + Zod** — form handling and schema validation
- **date-fns** — date formatting and arithmetic
- **Spark KV** (`window.spark.kv`) — primary KV storage for persisted user and collection data
- **IndexedDB fallback** (`src/lib/sparkKV.ts`) — used automatically on GitHub Pages and other static deployments where the Spark runtime is not available
- **WatchCharts API client** (`src/lib/watchcharts-client.ts`) — optional live market value lookups
- **Chrono24 FastAPI wrapper** (`chrono24-api/`) — optional Python service for live deal sourcing

## Local Development

```bash
npm install
npm run dev
```

Available scripts:

- `npm run dev` — start development server
- `npm run lint` — run ESLint
- `npm run build` — run TypeScript build and Vite production build
- `npm run test` — run Vitest unit tests
- `npm run db:start` — start the local Supabase stack
- `npm run db:stop` — stop the local Supabase stack
- `npm run db:reset` — reset the local Supabase database
- `npm run db:migrate` — push local Supabase migrations
- `npm run db:types` — regenerate `src/lib/supabase/types.ts` from the local schema
- `npm run test:sql` — run SQL-level Supabase tests
- `npm run test:ts` — run Supabase TypeScript integration tests
- `npm run test:all` — run both Supabase SQL and TypeScript test suites
- `npm run preview` — preview production build

### Local Supabase workflow

After creating your local `.env.local`, you can use the built-in Supabase scripts
to manage the schema and test suite:

```bash
npm run db:start
npm run db:migrate
npm run db:types
npm run test:all
```

### Chrono24 live deals setup (optional)

Start the local wrapper API:

```bash
cd chrono24-api
pip install -r requirements.txt
python server.py
```

Then point the frontend to it. You can pass the variable inline or add it to a
gitignored `.env.local` file in the project root:

```bash
# inline
VITE_CHRONO24_WRAPPER_BASE_URL=http://localhost:8000 npm run dev

# .env.local
VITE_CHRONO24_WRAPPER_BASE_URL=http://localhost:8000
```

Alternative accepted variable names: `VITE_CHRONO24_API_HOST`,
`CHRONO24_WRAPPER_BASE_URL`, `CHRONO24_API_HOST`.

When running the frontend on localhost, it also auto-falls back to
`http://localhost:8000` if no Chrono24 base URL env is provided.

### WatchCharts live market values (optional)

Set `VITE_WATCHCHARTS_API_KEY` (and optionally `VITE_WATCHCHARTS_BASE_URL`) to
enable live market value lookups in the Portfolio and Market modules.

```bash
VITE_WATCHCHARTS_API_KEY=your_key npm run dev
```

### Environment variable reference

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by browser and server clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase anon key used by browser and server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key for admin/server operations; never expose it to the browser |
| `SUPABASE_DB_URL` | Direct database connection string used for CLI tasks such as backups |
| `VITE_CHRONO24_WRAPPER_BASE_URL` | Base URL for the Chrono24 wrapper API |
| `VITE_CHRONO24_API_HOST` | Alternative name for the Chrono24 wrapper base URL |
| `VITE_CHRONO24_WRAPPER_API_KEY` | API key for the Chrono24 wrapper (if required) |
| `VITE_WATCHCHARTS_API_KEY` | API key for WatchCharts market value lookups |
| `VITE_WATCHCHARTS_BASE_URL` | Override for WatchCharts API base URL |
| `VITE_BASE_PATH` | Base path for GitHub Pages deployments (set automatically by the deploy workflow) |

Create a local `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/.env.local`
file with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=
```

For Vercel, add the same four variables in the project settings. Mark
`SUPABASE_SERVICE_ROLE_KEY` as server-only and do not expose it to the browser
or any client-side bundle.

## Testing

Unit tests are written with Vitest and live in `src/**/__tests__/`.

```bash
npm run test
```

Supabase persistence also has dedicated SQL and TypeScript test suites:

```bash
npm run test:sql
npm run test:ts
npm run test:all
```

The Chrono24 wrapper also has its own test suite:

```bash
cd chrono24-api
pip install -r requirements.txt
python -m pytest -q
```

## GitHub Pages deployment

This repository can be deployed to GitHub Pages with the included workflow at
`.github/workflows/deploy-pages.yml`.

Before the first deployment:

1. Install the frontend dependencies with `npm install`
2. If you need the optional Chrono24 wrapper locally, install its packages with `pip install -r chrono24-api/requirements.txt`
3. In GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**

After that, every push to `main` will build the Vite app with the repository
base path and publish it to GitHub Pages automatically.

On GitHub Pages the Spark runtime is not available, so the app automatically
uses the IndexedDB-backed KV fallback (`src/lib/sparkKV.ts`). Shared collection
links use hash-based routing (`/#/shared/...`) so they resolve correctly under
any base path.

## Daily Supabase backup workflow

The repository includes a scheduled backup workflow at
`.github/workflows/db-backup.yml`. It runs daily at **02:00 UTC**, dumps the
Supabase database, compresses the dump, uploads it to Cloudflare R2, deletes
remote backups older than 30 days, and sends a Resend alert email if the job
fails.

Configure these GitHub **Actions secrets** before enabling it:

- `SUPABASE_DB_URL`
- `CLOUDFLARE_R2_ACCESS_KEY`
- `CLOUDFLARE_R2_SECRET_KEY`
- `RESEND_API_KEY`

Also configure these GitHub **Actions variables**:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_BUCKET`
- `BACKUP_ALERT_EMAIL_TO`
- `BACKUP_ALERT_EMAIL_FROM` (optional; defaults to `onboarding@resend.dev`)

## License

This repository is licensed under the MIT License.
