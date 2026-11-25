# ScrapLess AI architecture

## Application boundaries

```text
Browser (Next.js App Router)
  ├─ signed-in bearer token ───────── FastAPI
  │                                    ├─ Supabase Auth identity validation
  │                                    ├─ CSV validation, FFD / MaxRects
  │                                    ├─ independent geometry validator
  │                                    ├─ authoritative metrics and reports
  │                                    ├─ synthetic-data risk service
  │                                    └─ OpenCV image detection
  └─ Supabase Auth + anon key ─────── Supabase PostgreSQL (RLS)
                                       ├─ production_orders
                                       └─ optimization_runs
FastAPI ── same user token ──────────> Supabase PostgREST (RLS enforced)
```

The browser renders geometry and gathers inputs; it does not calculate packing or KPI metrics. The backend is the source of truth for layouts and measurements.

## Data flow

1. A user selects or validates an order.
2. FastAPI validates the order and stock constraints with Pydantic.
3. Both packing heuristics execute against the same physical constraints.
4. An independent validator reconciles every part instance and checks geometry and spacing.
5. Metrics are derived from physical placements; reserved spacing is not subtracted from part area.
6. The API returns results, estimated comparisons, and a separately labelled synthetic-model risk signal.
7. Authenticated browser sessions send their access token to FastAPI. FastAPI validates it with Supabase Auth, then writes the optimization result, comparison/risk metadata, input order, and report data through PostgREST using that same user token.
8. The `optimization_runs` RLS policy checks `auth.uid() = user_id` for backend reads/writes; run/report lookup also filters by the verified user ID. Browser order operations use the same user-scoped RLS model.
9. Without Supabase configuration, only a non-production development instance permits the explicitly labelled demo and keeps run data in bounded backend process memory.

## Trust and persistence

- Supabase service-role credentials are not used in the browser or committed.
- The backend requires only the Supabase project URL and public anon key. It verifies bearer tokens with the Auth user endpoint and never bypasses RLS with a service-role key.
- The existing initial migration enables RLS on `optimization_runs` and limits rows to the owning authenticated user; the backend persists snapshots in its existing `payload` and `report_payload` columns.
- Authenticated results and reports remain available after backend restarts through Supabase. Development demo history is in-process, capped at 200 run entries, and cleared by a restart.
- Per-process rate limits and concurrency caps bound normal request volume. Rate limiting is not distributed across workers/instances; use a shared limiter or edge protection before horizontal scaling.
- Risk prediction is synthetic-only and cannot change placements or validation.
- Vision output is pixel-space only and is not retained by the application.

## Deployment shape

- `frontend/`: Next.js application, deployed with Vercel using `frontend` as its root directory.
- `backend/`: FastAPI application, deployed to Render or run from the Dockerfile.
- `supabase/migrations/`: PostgreSQL schema and RLS policies applied to a Supabase project.
