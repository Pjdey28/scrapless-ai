# ScrapLess AI

**Predict Waste. Optimize Cutting. Make Every Sheet Count.**

ScrapLess AI is a manufacturing-planning application for rectangular 2D sheet cutting. It takes production-order parts and stock constraints, runs two real packing heuristics in a Python service, independently validates both layouts, calculates material KPIs, and makes the placements available for inspection and export.

> **Scope and limitations:** FFD and MaxRects are deterministic heuristics, not global optimizers. MaxRects does not establish guillotine-cut feasibility. Unused area is a geometric proxy, not a judgment about whether offcuts can be reused. Scrap-risk ML is trained and evaluated only on reproducible synthetic data. Computer-vision dimensions are pixels unless an external calibration is supplied.

## Features

- Next.js dashboard for orders, optimization, analytics, risk signals, vision, history, and settings.
- FastAPI validation, CSV import, optimization, reporting, synthetic ML, and OpenCV endpoints.
- Deterministic First Fit Decreasing shelf baseline and MaxRects Best Short Side Fit.
- Independent geometry/quantity/spacing validation before results are labelled valid.
- Physical area, stock area, utilization, unused-area proxy, sheet cost, runtime, and unplaced-part metrics.
- Supabase Auth validated by FastAPI, with user-owned order/run records protected by RLS policies.
- Durable optimization results and report data stored in the existing RLS-protected Supabase table.
- Clearly labelled development-only demo mode with bounded, non-durable in-memory analysis history.
- Vercel, Render, Docker, and CI configuration.

## Architecture

```text
frontend/ (Next.js App Router, React, TypeScript, Tailwind)
  ├─ typed REST client ──> backend/ (FastAPI, Pydantic)
  │                         ├─ FFD + MaxRects
  │                         ├─ geometry validator + metrics
  │                         ├─ synthetic scikit-learn risk model
  │                         ├─ OpenCV image detection
  │                         └─ JSON / CSV reports
  ├─ Supabase browser client (anon key + RLS)
  └─ bearer token ──> FastAPI ──> Supabase Auth user validation + PostgREST (same user token)
                              └─ Supabase PostgreSQL / Auth
```

See [docs/architecture.md](docs/architecture.md), [docs/algorithm-design.md](docs/algorithm-design.md), [docs/api.md](docs/api.md), and [docs/deployment.md](docs/deployment.md).

## Repository

```text
backend/                 FastAPI service, optimization, ML, vision, tests
frontend/                Next.js dashboard, API client, UI tests, Playwright flow
supabase/migrations/     PostgreSQL schema and RLS policies
docs/                    Architecture, algorithms, API, deployment
.github/workflows/       Backend/frontend CI, build, and E2E checks
render.yaml              Render backend definition
```

## Requirements

- Python 3.11 or 3.12 for the supported backend runtime.
- Node.js 22 LTS (Node 20.9+ is required by this Next.js line).
- Docker is optional for local execution and required only for the container build check.
- Supabase credentials are optional in demo mode.

Implementation checks were run with the machine's Python 3.14 interpreter as well as a local isolated virtual environment. Production and CI target Python 3.12; rerun the documented tests on that runtime before release.

## Local setup (Windows PowerShell)

From the repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r .\backend\requirements.txt
python -m ruff check .\backend
python -m pytest .\backend\tests -q
```

Start the backend in one PowerShell window:

```powershell
Set-Location .\backend
python -m uvicorn app.main:app --reload --port 8000
```

In another PowerShell window:

```powershell
Set-Location .\frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Interactive backend docs are at [http://localhost:8000/docs](http://localhost:8000/docs). The optimizer loads its sample order from the backend API, so keep the backend running.

### macOS/Linux alternative

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m ruff check backend
python -m pytest backend/tests -q
```

Then run `python -m uvicorn app.main:app --reload --port 8000` from `backend/`, and `npm ci && npm run dev` from `frontend/`.

## Environment configuration

`frontend/.env.example` contains public frontend values:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Backend settings are in `backend/.env.example`:

```dotenv
ENVIRONMENT=development
FRONTEND_ORIGIN=http://localhost:3000
LOG_LEVEL=INFO
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

In development only, leave both Supabase backend settings empty to use the local demo. Demo endpoints are unauthenticated, run history is capped in process memory, and it is not suitable for exposing as a production service. A partial Supabase configuration fails closed. Production startup requires `ENVIRONMENT=production`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`; the health endpoint reports unavailable if configuration is incomplete.

When Supabase is configured, the frontend sends the signed-in access token to user-specific FastAPI routes. FastAPI validates it with Supabase Auth's `/auth/v1/user` endpoint and forwards that same user token (never a service-role key) to Supabase PostgREST. The `optimization_runs` table's RLS policy enforces `auth.uid() = user_id`. The backend anon key is a public project key, not a service-role credential. **Never use a service-role key in the frontend or Render API configuration.**

Set backend variables in the backend process:

```powershell
$env:FRONTEND_ORIGIN = "http://localhost:3000"
$env:ENVIRONMENT = "development"
$env:LOG_LEVEL = "INFO"
# For authenticated local use, set SUPABASE_URL and SUPABASE_ANON_KEY to your project values.
```

## Supabase setup

1. Create a Supabase project and configure email/password Auth.
2. If the initial schema has not already been applied, manually execute [supabase/migrations/202611250001_initial_schema.sql](supabase/migrations/202611250001_initial_schema.sql) in the SQL editor or apply that migration with the Supabase CLI. It already creates `optimization_runs` with `payload`, `report_payload`, `user_id`, and owner-only RLS; no new migration is needed for this change. Do not execute it again if it was already applied.
3. Configure the Supabase Auth redirect URLs for local and deployed frontend origins.
4. Put the same project URL and anon key in `frontend/.env.local` and the backend environment (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
5. For Render set `ENVIRONMENT=production`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the exact `FRONTEND_ORIGIN`. Set the frontend's `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
6. Restart local services after changing environment variables.

The migration creates `production_orders` and `optimization_runs`, enables RLS, and checks `auth.uid() = user_id`. No mock data is seeded.

## Algorithms and metrics

- **FFD:** expand quantities, sort instances deterministically by descending area, place onto shelves, then open a new shelf/sheet when required.
- **MaxRects BSSF:** search free rectangles and allowed orientations, score by best short-side fit, split residual free rectangles, prune contained regions, and open sheets as necessary.
- **Validator:** independently checks requested-instance reconciliation, uniqueness, part identity, rotation, positive dimensions, boundaries, and reserved spacing.
- **Utilization:** physical placed-part area ÷ stock-sheet area × 100.
- **Estimated unused area:** stock area − physical placed-part area.
- **Estimated material cost:** sheets used × configured cost per sheet.

Spacing uses a documented positive-x/positive-y reserve convention. It constrains packing but is not subtracted again from physical area. See [docs/algorithm-design.md](docs/algorithm-design.md).

## ML and vision

The RandomForest model uses a fixed-seed synthetic training dataset with held-out evaluation metrics and feature importance. Its class/score are advisory, are not a calibrated real-world probability, and cannot override packing or validation.

The OpenCV workflow accepts real PNG, JPEG, WEBP, or BMP images up to 5 MiB and 4 megapixels, returns contour bounding boxes in pixels, and displays the annotated image. Detection is experimental; lighting, reflections, touching pieces, shadows, and perspective can affect candidates. Millimetre dimensions require calibration.

## API security and resource limits

- Production user-specific API routes require a bearer access token verified by Supabase Auth. Optimization runs, history, analytics, risk prediction, CSV validation, vision detection, run retrieval, and report downloads are account-scoped; the `optimization_runs` RLS policy remains the database authorization boundary.
- The public health endpoint and built-in sample order do not expose user data. The synthetic-model evaluation endpoint is public and rate-limited.
- POST request bodies are limited to 1 MiB JSON, 1 MiB CSV files (multipart overhead is separately bounded), or 5 MiB vision images. CSV supports at most 250 rows. Orders accept at most 250 part types and 500 total instances; sheet plans are capped at 200 sheets.
- Process-local rate limits are 6 optimization, 15 CSV validation, 5 vision, and 20 risk requests per IP per minute. Optimization and vision work each have two concurrent slots. The rate limiter is process-local, not distributed: multi-instance deployments need an edge/WAF or shared rate-limit service before scaling.
- Development demo mode deliberately omits backend authentication only when no Supabase settings are present and `ENVIRONMENT` is not production. Do not expose it to untrusted networks.
- API logs do not include request bodies, bearer tokens, Supabase response bodies, or order identifiers. A Supabase or network outage causes the API to fail the authenticated operation rather than return an unsaved success response.

## Tests and quality checks

Backend:

```powershell
.\.venv\Scripts\python.exe -m ruff check .\backend
.\.venv\Scripts\python.exe -m pytest .\backend\tests -q
```

Frontend:

```powershell
Set-Location .\frontend
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The Playwright flow starts the FastAPI development demo service and Next.js, loads the sample order, runs both algorithms, checks validation/layouts, downloads a placement report, and inspects history. Supabase token validation, RLS isolation, and live account workflows require a separately configured project and are not represented as live-service verified.

CI is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Deployment

- **Vercel:** set project root to `frontend`; set `NEXT_PUBLIC_API_URL` to the Render API origin; set Supabase public values when enabling accounts.
- **Render:** use the included [`render.yaml`](render.yaml), set `FRONTEND_ORIGIN`, and check `/api/health`.
- **Supabase:** apply the migration and set Auth redirect URLs.

No hosted account was linked and no live service was deployed or verified as part of this change. Follow [docs/deployment.md](docs/deployment.md) for the manual steps.
