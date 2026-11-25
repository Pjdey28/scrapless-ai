create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id text not null check (char_length(order_id) between 1 and 100),
  name text not null check (char_length(name) between 1 and 200),
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, order_id)
);

create table if not exists public.optimization_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id text not null,
  order_name text not null,
  algorithm text not null check (algorithm in ('first_fit_decreasing', 'maxrects_bssf')),
  validation_status text not null check (validation_status in ('valid', 'invalid')),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  sheet_config jsonb not null check (jsonb_typeof(sheet_config) = 'object'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  report_payload jsonb not null check (jsonb_typeof(report_payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, run_id)
);

create index if not exists production_orders_user_created_idx
  on public.production_orders (user_id, created_at desc);
create index if not exists optimization_runs_user_created_idx
  on public.optimization_runs (user_id, created_at desc);
create index if not exists optimization_runs_user_order_idx
  on public.optimization_runs (user_id, order_id);

alter table public.production_orders enable row level security;
alter table public.optimization_runs enable row level security;

create policy "Users manage their own production orders"
  on public.production_orders
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own optimization runs"
  on public.optimization_runs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
