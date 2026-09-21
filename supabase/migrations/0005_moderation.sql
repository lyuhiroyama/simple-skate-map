-- Blocks, reports, and per-user hidden content for App Store 1.2.

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('message', 'spot', 'user')),
  content_id uuid,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index reports_target_user_id_idx on public.reports (target_user_id);
create index reports_created_at_idx on public.reports (created_at desc);

create table public.hidden_content (
  user_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('message', 'spot')),
  content_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, content_type, content_id)
);

alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;
alter table public.hidden_content enable row level security;

create policy "users manage their blocks"
  on public.user_blocks for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create policy "users insert their reports"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "users read their reports"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());

create policy "users manage their hidden content"
  on public.hidden_content for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant all on table public.user_blocks to postgres, service_role;
grant all on table public.reports to postgres, service_role;
grant all on table public.hidden_content to postgres, service_role;

grant select, insert, delete on table public.user_blocks to authenticated;
grant select, insert on table public.reports to authenticated;
grant select, insert, delete on table public.hidden_content to authenticated;

notify pgrst, 'reload schema';
