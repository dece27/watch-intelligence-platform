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
- Live deal sourcing synced by GitHub Actions with the `irahorecka/chrono24` Python library and stored in Supabase
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
- **Supabase Edge Functions** — secure server-side proxying for GitHub Models API calls
- **WatchCharts API client** (`src/lib/watchcharts-client.ts`) — optional live market value lookups
- **Chrono24 sync workflow** (`.github/workflows/fetch-chrono24.yml`) — scheduled Python job that fetches listings with `irahorecka/chrono24` and upserts them into Supabase

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

### Chrono24 deal sync

Chrono24 data is fetched only by `scripts/fetch-chrono24.py` inside the
GitHub Actions workflow at `.github/workflows/fetch-chrono24.yml`.

The browser app never calls Chrono24 directly. It reads synced rows from the
Supabase `deal_listings` table instead.

To run the sync manually in GitHub Actions, use **Actions → Fetch Chrono24
Listings → Run workflow** after configuring these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended GitHub Environment variables for resilient sync behavior:

- `CHRONO24_ACCESS_APPROVED` — set to `true` only after you confirm an approved
  automated access path to Chrono24 (default: `false`, which safely skips sync)
- `CHRONO24_UPSTREAM_FAILURE_THRESHOLD` — number of consecutive upstream-unavailable
  runs surfaced in sync observability output as a sustained upstream failure
  (default: `4`)
- `CHRONO24_STALE_AFTER_HOURS` — cached listing freshness window used for stale
  status reporting (default: `48`)
- `FLARESOLVERR_ENABLED` — set to `true` to proxy Chrono24 requests through
  the FlareSolverr service container (default: `false`)
- `FLARESOLVERR_URL` — FlareSolverr base URL used by the sync script
  (default: `http://localhost:8191`)
- `FLARESOLVERR_MAX_TIMEOUT_MS` — per-request FlareSolverr timeout in
  milliseconds (default: `60000`)

### WatchCharts live market values (optional)

Set `VITE_WATCHCHARTS_API_KEY` (and optionally `VITE_WATCHCHARTS_BASE_URL`) to
enable live market value lookups in the Portfolio and Market modules.

```bash
VITE_WATCHCHARTS_API_KEY=your_key npm run dev
```

### Environment variable reference

See `docs/env-vars.md` for the full environment variable, GitHub Actions secret, and variable reference.

### GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add these repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL used at build time for static frontend workflows
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase anon key used at build time for static frontend workflows
- `SUPABASE_URL` — same Supabase project URL for GitHub Actions scripts and server-side utilities
- `SUPABASE_ANON_KEY` — public Supabase anon key used by the Supabase Edge Function deploy workflow to sync function secrets
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key for server-side Actions scripts only; never expose it to the browser
- `SUPABASE_DB_URL` — database connection string used by backup workflows or other direct database connections
- `SUPABASE_ACCESS_TOKEN` — Supabase personal access token used by CLI workflows such as hosted migration runs
- `MODELS_GITHUB_TOKEN` — GitHub PAT with `models:read` used to populate the Edge Function runtime `GITHUB_TOKEN` secret
- `RESEND_API_KEY` — Resend API key for alert notification emails

Also add this GitHub **Actions variable** (or secret):

- `SUPABASE_PROJECT_REF` — Supabase project reference used by the migration workflow to link the hosted project before running `supabase db push`

### Supabase Edge Function secrets

Set these in Supabase with `npx supabase secrets set KEY=value`:

- `GITHUB_TOKEN` — PAT with `models:read` scope only
- `SUPABASE_URL` — Supabase project URL (used by function-side auth and caching clients)
- `SUPABASE_ANON_KEY` — Supabase anon key (used to call `record_ai_usage` with user auth context)
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for Edge Function admin operations
- `RESEND_API_KEY` — Resend API key for alert emails sent from Edge Functions

### Supabase Edge Function deployment

This repository includes `.github/workflows/deploy-supabase-functions.yml`, which:

- links to your hosted Supabase project using `SUPABASE_PROJECT_REF`
- syncs required Edge Function secrets (`GITHUB_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- deploys `github-models-proxy` and `ensure-admin-auth`

The workflow runs on pushes to `main` that modify `supabase/functions/**`, and can also be run manually from Actions.

### AI operational checks

After deployment, verify:

1. The frontend can invoke `github-models-proxy` without Edge Function errors.
2. `market_data_cache` entries are created/read for cache-backed AI calls.
3. `record_ai_usage` writes rows in `ai_usage_logs` for authenticated users.
4. AI flows work end-to-end for `signal`, `chat`, `deal_ranking`, `deal_assessment`, `rebalancing`, `what_if`, and `identify`.
5. Administrator login can invoke `ensure-admin-auth` and establish a Supabase session without Edge Function transport errors.

### Local development

Create a local `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/.env.local`
file with:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

The frontend accepts both `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. GitHub Actions in
this repository use the `NEXT_PUBLIC_` names for frontend builds, while
server-side scripts and utilities use `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and
never place it in client code.

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

## GitHub Pages deployment

This repository can be deployed to GitHub Pages with the included workflow at
`.github/workflows/deploy.yml`.

Before the first deployment:

1. Install the frontend dependencies with `npm install`
2. In GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**

After that, every push to `main` will build the Vite app with the repository
base path and publish it to GitHub Pages automatically.

On GitHub Pages the Spark runtime is not available, so the app automatically
uses the IndexedDB-backed KV fallback (`src/lib/sparkKV.ts`). Shared collection
links use hash-based routing (`/#/shared/...`) so they resolve correctly under
any base path.

The workflow copies the Vite `dist/` output into `out/` and publishes
`.nojekyll`, which prevents GitHub Pages from running Jekyll processing over
generated asset paths.

## Scheduled automation workflows

The repository also includes GitHub Actions workflows for recurring operational
tasks:

- `.github/workflows/refresh-news.yml` — refreshes the RSS-backed `news_cache`
  hourly via `node scripts/refresh-news.mjs`
- `.github/workflows/portfolio-snapshots.yml` — records daily portfolio
  snapshots for users with active watches via `node scripts/portfolio-snapshots.mjs`
- `.github/workflows/check-price-alerts.yml` — checks active price alerts every
  six hours and sends Resend notifications via `node scripts/check-alerts.mjs`
- `.github/workflows/fetch-chrono24.yml` — fetches live Chrono24 listings with
  the `irahorecka/chrono24` Python library and upserts them into Supabase via
  `python scripts/fetch-chrono24.py`
- `.github/workflows/run-supabase-migrations.yml` — applies SQL migrations from
  `supabase/migrations` to Supabase on push to `main` (when migration files
  change) or manual dispatch

## Dependency and security automation

The repository also includes:

- `.github/dependabot.yml` — weekly npm dependency updates and monthly GitHub
  Actions updates
- `.github/workflows/codeql.yml` — scheduled and PR-triggered CodeQL security
  analysis for JavaScript/TypeScript
- `.github/workflows/quality.yml` — CI checks for type checking, linting,
  static-export compatibility, build, and unit tests
- `.husky/pre-commit` with `.secretlintrc.json` — local pre-commit checks for
  Secretlint and `tsc --noEmit`

## Daily Supabase backup workflow

The repository includes a scheduled backup workflow at
`.github/workflows/db-backup.yml`. It runs daily at **02:00 UTC**, dumps the
Supabase database, compresses the dump, uploads it to Cloudflare R2, deletes
remote backups older than 30 days, and sends a Resend alert email if the job
fails.

Configure these GitHub **Actions secrets** before enabling it:

- `SUPABASE_DB_URL` (prefer the Supabase session pooler or another IPv4-capable endpoint for GitHub Actions)
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
