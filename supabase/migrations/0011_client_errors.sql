-- Client-side error log for diagnosing user reports. Service role only.
-- Do not grant anon/authenticated — the phone never queries this table.
-- Express inserts via service_role (POST /client-errors).
--
-- Oct 2026 Data API change: new public tables need an explicit GRANT
-- in the same migration. Existing tables keep their current grants.

create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null default '',
  name text not null default 'Error',
  message text not null default '',
  stack text,
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

create index client_errors_created_at_idx on public.client_errors (created_at desc);
create index client_errors_user_id_idx on public.client_errors (user_id);

alter table public.client_errors enable row level security;

grant all on table public.client_errors to postgres, service_role;

notify pgrst, 'reload schema';
