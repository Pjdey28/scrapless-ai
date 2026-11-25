# API reference

FastAPI generates the complete OpenAPI schema and interactive docs at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health and authentication/persistence readiness mode |
| GET | `/api/v1/demo/sample-order` | Built-in sample production order |
| POST | `/api/v1/orders/validate` | (Auth) Validate CSV, returning accepted rows and row-specific errors |
| POST | `/api/v1/optimize` | (Auth) Run FFD and MaxRects, validate, calculate and persist account-owned results |
| GET | `/api/v1/optimize/{run_id}` | (Auth) Retrieve an owned, persisted result |
| GET | `/api/v1/optimize/{run_id}/metrics` | (Auth) Retrieve owned run metrics |
| GET | `/api/v1/optimize/{run_id}/placements` | (Auth) Retrieve owned placements |
| GET | `/api/v1/history` | (Auth) List persisted results belonging to the caller |
| GET | `/api/v1/analytics/overview` | (Auth) Aggregate the caller's persisted results |
| GET | `/api/v1/analytics/trends` | (Auth) Trend rows from the caller's persisted results |
| POST | `/api/v1/ml/predict-risk` | (Auth) Synthetic-trained scrap-risk estimate |
| GET | `/api/v1/ml/evaluation` | Fixed-seed synthetic train/test evaluation (public, rate-limited) |
| POST | `/api/v1/vision/detect` | (Auth) OpenCV contour detection for a real uploaded image |
| GET | `/api/v1/reports/{run_id}/json` | (Auth) Download the caller's complete JSON report |
| GET | `/api/v1/reports/{run_id}/placements.csv` | (Auth) Download the caller's placement CSV |

Except for `/api/health` and the built-in demo sample-order endpoint, user-data endpoints require `Authorization: Bearer <Supabase access token>` whenever Supabase is configured. FastAPI verifies that token against the configured project's `/auth/v1/user`; PostgREST receives the same token and the database RLS policy independently enforces row ownership. An unconfigured local development instance permits unauthenticated demo requests; production refuses to start without `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

JSON optimization requests contain `order` and `sheet_config`. Part materials must match the selected stock material, case-insensitively; missing part materials are treated as the explicitly selected stock material. CSV upload requires `part_id,length,width,quantity`; `priority,material,description` are optional. Limits: 1 MiB JSON request, 1 MiB CSV file and 250 CSV rows, 250 part types, 500 total part instances, 200 sheets, 5 MiB vision images and 4 megapixels. Rate limits per IP per minute are 6 optimization, 15 CSV validation, 5 vision, 20 risk prediction, 10 model evaluation, and 60 for history/analytics/run/report reads. Optimization and vision work allow at most two concurrent operations per process. Rate limiting is process-local; use an edge/WAF or shared limiter before scaling to multiple backend instances.

Run locally:

```powershell
Set-Location backend
python -m uvicorn app.main:app --reload --port 8000
```
