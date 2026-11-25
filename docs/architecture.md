# ScrapLess AI architecture

## Application boundaries

```text
Browser (Next.js App Router)
  ├─ typed API client ─────────────── FastAPI
  │                                    ├─ CSV validation
  │                                    ├─ FFD / MaxRects
  │                                    ├─ independent geometry validator
  │                                    ├─ authoritative metrics and reports
  │                                    ├─ synthetic-data risk service
  │                                    └─ OpenCV image detection
  └─ Supabase Auth + anon key ─────── Supabase PostgreSQL (RLS)
                                       ├─ production_orders
                                       └─ optimization_runs
```

The browser renders geometry and gathers inputs; it does not calculate packing or KPI metrics. The backend is the source of truth for layouts and measurements.

## Data flow

1. A user selects or validates an order.
2. FastAPI validates the order and stock constraints with Pydantic.
3. Both packing heuristics execute against the same physical constraints.
4. An independent validator reconciles every part instance and checks geometry and spacing.
5. Metrics are derived from physical placements; reserved spacing is not subtracted from part area.
6. The API returns results, estimated comparisons, and a separately labelled synthetic-model risk signal.
7. Authenticated browser sessions write orders and result snapshots through the Supabase anon key. RLS checks `auth.uid()` for every row.
8. Without Supabase configuration, the explicitly labelled demo keeps order/run data in page or backend process memory only.

## Trust and persistence

- Supabase service-role credentials are not used in the browser or committed.
- The database migration enables RLS and limits rows to the owning authenticated user.
- Demo backend history is in-process and is cleared by a restart; it is not a substitute for configured persistence.
- Risk prediction is synthetic-only and cannot change placements or validation.
- Vision output is pixel-space only and is not retained by the application.

## Deployment shape

- `frontend/`: Next.js application, deployed with Vercel using `frontend` as its root directory.
- `backend/`: FastAPI application, deployed to Render or run from the Dockerfile.
- `supabase/migrations/`: PostgreSQL schema and RLS policies applied to a Supabase project.
