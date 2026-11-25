alter table public.production_orders
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists demo_dataset_id text;

alter table public.optimization_runs
  add column if not exists demo_dataset_id text;

create index if not exists production_orders_user_demo_dataset_idx
  on public.production_orders (user_id, demo_dataset_id)
  where demo_dataset_id is not null;

create index if not exists optimization_runs_user_demo_dataset_idx
  on public.optimization_runs (user_id, demo_dataset_id)
  where demo_dataset_id is not null;
