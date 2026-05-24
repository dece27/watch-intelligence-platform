| Feature | File | Real call? | Failure point | Fix needed |
|---------|------|-----------|---------------|------------|
| Buy/Hold/Sell Signal Engine | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/components/modules/AIAdvisorModule.tsx` | Yes (`callAI` at line 319) | Working correctly | Keep real call path; improve observability with dev debug overlay |
| AI Chat (Watch Advisor) | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/components/modules/AIAdvisorModule.tsx` | Yes (`callAI` at line 372) | Working correctly | Keep real call path; improve observability with dev debug overlay |
| Watch Identifier (photo → watch ID) | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/components/modules/AIAdvisorModule.tsx` | Yes (`callAI` at line 500) | Working correctly | Keep real call path; improve observability with dev debug overlay |
| AI Deal Assessment (deal detail modal) | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/components/DealDetailModal.tsx` | Yes (`callAI` at line 69) | callAI called but error silently swallowed | Preserve real call attempt, improve caller/edge error propagation, keep explicit fallback messaging |
| Deal of the Day (AI Advisor page top card) | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/components/modules/AIAdvisorModule.tsx` | Yes (`callAI` at line 607) | Cache hit blocking all real calls | Keep real call and expose per-call debug state; allow visibility when cached responses are returned |
| Portfolio Rebalancing | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/components/modules/AIAdvisorModule.tsx` | Yes (`callAI` at line 688) | Working correctly | Keep real call path; improve observability with dev debug overlay |
| News Relevance Scoring | `/home/runner/work/watch-intelligence-platform/watch-intelligence-platform/src/lib/news-feeds.ts` | No AI call (heuristic `scoreArticle()` only at line 212) | callAI not called (mock data returned directly) | Add AI-backed relevance scoring path if this feature is intended to be AI-powered |

## Edge Function check (`supabase/functions/github-models-proxy/index.ts`)

- `GITHUB_TOKEN` is read from `Deno.env`.
- Endpoint is `https://models.inference.ai.azure.com/chat/completions`.
- Authorization header uses `Bearer ${GITHUB_TOKEN}` for upstream call.
- Manual Supabase JWT validation was missing before fix; now enforced in function.
- CORS `OPTIONS` handler is present.
- Upstream/API errors are handled and surfaced as JSON errors.
- Deployment status could not be verified in this environment because `npx supabase functions list` failed without `SUPABASE_ACCESS_TOKEN`.

## Caller utility check (`src/lib/ai/caller.ts`)

- `callAI()` exists and is exported.
- Caller now requires a Supabase session before invoking the Edge Function.
- Caller now uses `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/github-models-proxy` (with Vite fallback support).
- Caller now sends `Authorization: Bearer ${session.access_token}`.
- Caller throws `DailyLimitError` on 429 / `daily_limit_exhausted`.
- Caller does not silently return an empty string on failure.
