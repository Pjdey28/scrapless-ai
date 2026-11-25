# Deployment guide

## Prerequisites

- A Supabase project (optional for demo; required for durable accounts/orders/history).
- A Vercel project connected to this repository.
- A Render web service or a supported Docker deployment.
- The API and frontend production origins.

## Supabase

1. If it has not already been applied, manually execute `supabase/migrations/202611250001_initial_schema.sql` in the Supabase SQL editor (or apply it with the Supabase CLI). It already creates the required `optimization_runs` columns, indexes, and owner-only RLS policy. No new migration is needed. Do not execute it again if already applied.
2. Verify RLS is enabled on `production_orders` and `optimization_runs`, and verify the `Users manage their own optimization runs` policy is present.
3. Configure Supabase Auth email/password and allowed redirect URLs for the deployed Vercel domain.
4. Configure Vercel `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the project URL and public anon key.
5. Configure Render `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the same project values.

No service-role key is required by this application. Never put one in a `NEXT_PUBLIC_*` variable.

## Render backend

The included `render.yaml` sets `backend` as the root, installs `requirements.txt`, starts Uvicorn, and probes `/api/health`. In Render, set `ENVIRONMENT=production`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `FRONTEND_ORIGIN` to the exact deployed frontend origin. Production startup and health checks fail closed if Supabase auth/persistence settings are missing. The local development equivalent is:

```powershell
Set-Location backend
python -m pip install -r requirements.txt
$env:FRONTEND_ORIGIN = "https://your-app.vercel.app"
$env:ENVIRONMENT = "production"
$env:SUPABASE_URL = "https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY = "your-project-anon-key"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

For Docker:

```powershell
docker build -t scrapless-ai-api .\backend
docker run --rm -p 8000:8000 -e FRONTEND_ORIGIN=http://localhost:3000 scrapless-ai-api
```

## Vercel frontend

1. Set the Vercel project root directory to `frontend`.
2. Keep the standard Next.js build command (`npm run build`).
3. Set `NEXT_PUBLIC_API_URL` to the public Render URL, without a trailing slash.
4. Set the two Supabase public variables; the matching backend variables are required for API-side authentication and durable saved data.
5. Deploy and verify `/api/health` on Render, the Vercel landing page, and one complete order-to-optimization flow.

## Current limitation

This repository includes deployable configuration, but no accounts were linked and no live deployment was requested or verified during implementation. The backend verifies each bearer token with Supabase Auth and uses the same token for RLS-protected PostgREST access; it does not use or require a service-role key. Development demo mode remains unauthenticated and is not suitable for public exposure. The built-in per-process rate limiter does not coordinate across multiple Render instances, so add a shared limiter or edge/WAF before horizontally scaling. Supabase token validation, RLS policy execution, and production persistence still require verification against the user's live project after manual configuration.
