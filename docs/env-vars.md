# Environment variables

## Application variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL used by the browser client (the app also accepts `NEXT_PUBLIC_SUPABASE_URL` as a fallback) |
| `VITE_SUPABASE_ANON_KEY` | Public Supabase anon key used by the browser client (the app also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key for GitHub Actions or Supabase server-side utilities; never expose it to the browser |
| `SUPABASE_URL` | Optional server-only Supabase URL override for GitHub Actions or other non-browser utilities |
| `SUPABASE_ANON_KEY` | Optional server-side anon key used by workflows that sync Supabase Edge Function runtime secrets |
| `SUPABASE_DB_URL` | Database connection string used by Supabase CLI backup jobs or other direct Postgres access outside the migration workflow |
| `SUPABASE_ACCESS_TOKEN` | Personal access token used by Supabase CLI GitHub Actions jobs that authenticate through the Supabase Management API |
| `SUPABASE_PROJECT_REF` | Supabase project reference used by GitHub Actions to link the CLI to the correct hosted project |
| `GITHUB_TOKEN` | Server-only GitHub personal access token used by `supabase/functions/github-models-proxy` to call GitHub Models |
| `MODELS_GITHUB_TOKEN` | GitHub Actions secret containing a PAT with `models:read`, used to populate the Edge Function `GITHUB_TOKEN` secret during deploy |
| `VITE_WATCHCHARTS_API_KEY` | API key for WatchCharts market value lookups |
| `VITE_WATCHCHARTS_BASE_URL` | Override for WatchCharts API base URL |
| `VITE_BASE_PATH` | Base path for GitHub Pages deployments (set automatically by the deploy workflow) |
| `RESEND_API_KEY` | Server-only API key used by scheduled workflows that send transactional email notifications |
| `RESEND_FROM_EMAIL` | Optional sender address override for Resend-powered workflow notifications |
| `CHRONO24_ACCESS_APPROVED` | Workflow control flag; set to `true` only when Chrono24 automated access is explicitly approved |
| `CHRONO24_UPSTREAM_FAILURE_THRESHOLD` | Consecutive upstream-unavailable Chrono24 sync runs surfaced in the sync observability output as a sustained upstream failure |
| `CHRONO24_STALE_AFTER_HOURS` | Freshness window (hours) used to mark synced Chrono24 listings as stale |
| `FLARESOLVERR_ENABLED` | Enables routing Chrono24 fetch requests through FlareSolverr in the sync workflow |
| `FLARESOLVERR_URL` | Base URL for the FlareSolverr service used by `scripts/fetch-chrono24.py` |
| `FLARESOLVERR_MAX_TIMEOUT_MS` | FlareSolverr request timeout in milliseconds for each Chrono24 upstream call |

## GitHub Actions secrets and variables

### Secrets

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL used at build time for static frontend workflows
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase anon key used at build time for static frontend workflows
- `SUPABASE_URL` — same Supabase project URL for GitHub Actions scripts and server-side utilities
- `SUPABASE_ANON_KEY` — public Supabase anon key used by the Supabase Edge Function deploy workflow (`github-models-proxy` and `ensure-admin-auth`)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key for server-side Actions scripts only; never expose it to the browser
- `SUPABASE_DB_URL` — database connection string used by backup workflows or other direct database connections
- `SUPABASE_ACCESS_TOKEN` — Supabase personal access token used by CLI workflows such as hosted migration runs
- `MODELS_GITHUB_TOKEN` — GitHub PAT with `models:read` used by the Supabase Edge Function deploy workflow (for `github-models-proxy`)
- `RESEND_API_KEY` — Resend API key for alert notification emails

### Variables or secrets

- `SUPABASE_PROJECT_REF` — Supabase project ref used by CLI workflows to link the hosted project before running migrations
- `CHRONO24_ACCESS_APPROVED` — set `true` only after confirming approved Chrono24 automated access
- `CHRONO24_UPSTREAM_FAILURE_THRESHOLD` — consecutive upstream failures surfaced in fetch observability output as sustained upstream failure
- `CHRONO24_STALE_AFTER_HOURS` — stale-data threshold used in Chrono24 sync metrics and frontend status
- `FLARESOLVERR_ENABLED` — set `true` to route Chrono24 requests through FlareSolverr
- `FLARESOLVERR_URL` — FlareSolverr URL consumed by the Chrono24 sync script
- `FLARESOLVERR_MAX_TIMEOUT_MS` — timeout budget per FlareSolverr request

### Variables

- `CLOUDFLARE_R2_ACCOUNT_ID` — Cloudflare account ID for the backup workflow
- `CLOUDFLARE_R2_BUCKET` — Cloudflare R2 bucket name for database backups
- `BACKUP_ALERT_EMAIL_TO` — recipient for backup failure notifications
- `BACKUP_ALERT_EMAIL_FROM` — optional sender address for backup failure notifications
