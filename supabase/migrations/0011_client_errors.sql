-- Client-side error log for diagnosing user reports. Service role only.

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
