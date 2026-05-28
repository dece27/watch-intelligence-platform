# Supabase Database

This directory contains migrations, Edge Functions, tests, and utilities for the Watch Intelligence Platform's Supabase database.

## Directory layout

| Path | Purpose |
|---|---|
| `migrations/` | Sequential SQL migrations applied via the Supabase CLI |
| `functions/` | Deno Edge Functions deployed to Supabase |
| `tests/` | Database-level tests |
| `utils/` | Shared SQL utilities |

## Migration authoring guide

### Naming convention

Migrations follow the pattern `NNNN_short_description.sql` where `NNNN` is a zero-padded integer that increments by 1 (e.g. `0019_my_feature.sql`).

### Required: explicit GRANT after every CREATE TABLE

**As of migration `0018_explicit_table_grants.sql`**, this project opts into Supabase's new default-privilege behaviour ([changelog](https://github.com/orgs/supabase/discussions/45329)):

> New tables created in `public` are **not** automatically exposed to the Data API. Every `CREATE TABLE` must be followed by explicit `GRANT` statements.

**Without a `GRANT`, PostgREST returns `permission denied` and the table is invisible to `supabase-js`**, regardless of RLS policies. The error looks like:

```json
{ "code": "42501", "message": "permission denied for table your_table",
  "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.your_table TO anon;" }
```

#### Standard grant block

Add this block immediately after `CREATE TABLE`, `ENABLE ROW LEVEL SECURITY`, and `CREATE POLICY` in every new migration, adjusting privileges to match the RLS intent:

```sql
-- grant block (required after every CREATE TABLE)
grant select, insert, update, delete on public.<table> to authenticated;
grant all on public.<table> to service_role;
-- Add the line below ONLY when unauthenticated (anon) reads are explicitly required:
-- grant select on public.<table> to anon;
```

#### Per-role reference

| Role | When to grant | Typical privileges |
|---|---|---|
| `service_role` | **Always** — background workers and Edge Functions need unrestricted write access | `ALL` |
| `authenticated` | When logged-in users read or write the table via `supabase-js` | Match the RLS operations (e.g. `SELECT, INSERT, UPDATE, DELETE` for user-owned rows; `SELECT` for read-only shared data) |
| `anon` | Only when unauthenticated users explicitly need access (e.g. public deal listings, anonymous feedback) | Minimum required (usually `SELECT` or `INSERT`) |

#### Complete example

```sql
create table if not exists public.my_table (
  id      uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users (id) on delete cascade not null,
  data    text not null,
  created_at timestamptz default timezone('utc', now()) not null
);

alter table public.my_table enable row level security;

create policy "Users manage own rows"
  on public.my_table for all
  using (auth.uid() = user_id);

-- grant block (required)
grant select, insert, update, delete on public.my_table to authenticated;
grant all on public.my_table to service_role;
```

### RLS and grants are separate layers

| Layer | What it controls | Checked by |
|---|---|---|
| **Grant** | Whether a role can access the table at all | PostgreSQL / PostgREST (first) |
| **RLS policy** | Which rows a role can see or modify | PostgreSQL (after grant passes) |

Both layers must be present for a table to be accessible via the Data API. A grant without RLS exposes all rows; an RLS policy without a grant blocks all access.
