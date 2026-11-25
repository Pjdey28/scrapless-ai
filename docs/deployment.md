# Deployment guide

## Prerequisites

- A Supabase project (optional for demo; required for durable accounts/orders/history).
- A Vercel project connected to this repository.
- A Render web service or a supported Docker deployment.
- The API and frontend production origins.

## Supabase

1. Open the Supabase SQL editor or use the Supabase CLI linked to your project.
2. Apply `supabase/migrations/202611250001_initial_schema.sql`.
3. Verify RLS is enabled on `production_orders` and `optimization_runs`.
4. In Vercel, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` using the project's public URL and anon key.
5. Configure allowed redirect URLs for the deployed Vercel domain in Supabase Auth.

No service-role key is required by this application. Never put one in a `NEXT_PUBLIC_*` variable.

## Render backend

The included `render.yaml` sets `backend` as the root, installs `requirements.txt`, starts Uvicorn, and probes `/api/health`. Set `FRONTEND_ORIGIN` in the Render dashboard to the exact deployed frontend origin. The local equivalent is:

```powershell
Set-Location backend
python -m pip install -r requirements.txt
$env:FRONTEND_ORIGIN = "https://your-app.vercel.app"
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
4. Set the two Supabase public variables if durable auth and saved data are enabled.
5. Deploy and verify `/api/health` on Render, the Vercel landing page, and one complete order-to-optimization flow.

## Current limitation

This repository includes deployable configuration, but no accounts were linked and no live deployment was requested or verified during implementation. Without Supabase variables, the application deliberately runs in demo mode and does not claim durable history. Do not configure production user data against an unverified deployment.
