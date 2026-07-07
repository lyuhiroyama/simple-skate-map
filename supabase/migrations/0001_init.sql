-- Skate spots app: initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

-- ============================================================
-- Tables
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 32),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 64),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.spots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  address text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

create index spots_group_id_idx on public.spots (group_id);

create table public.spot_media (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('photo', 'video')),
  created_at timestamptz not null default now()
);

create index spot_media_spot_id_idx on public.spot_media (spot_id);

-- ============================================================
-- Auto-create a profile row when a user signs up.
-- Username comes from the signup metadata (set by the app).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'username',
      'skater_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row Level Security
-- The Express API uses the service role key (bypasses RLS), but
-- RLS is enabled as defense-in-depth for direct client access.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.spots enable row level security;
alter table public.spot_media enable row level security;

-- Helper: is the current user a member of the given group?
-- SECURITY DEFINER so policies on group_members don't recurse.
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- profiles
create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "users can update own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups
create policy "members can read their groups"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "authenticated users can create groups"
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());

create policy "owners can delete groups"
  on public.groups for delete to authenticated
  using (
    exists (
      select 1 from public.group_members
      where group_id = id and user_id = auth.uid() and role = 'owner'
    )
  );

-- group_members
create policy "members can see membership of their groups"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "users can join groups"
  on public.group_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can leave groups"
  on public.group_members for delete to authenticated
  using (user_id = auth.uid());

-- spots
create policy "members can read group spots"
  on public.spots for select to authenticated
  using (public.is_group_member(group_id));

create policy "members can create spots"
  on public.spots for insert to authenticated
  with check (created_by = auth.uid() and public.is_group_member(group_id));

create policy "creators can update their spots"
  on public.spots for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "creators can delete their spots"
  on public.spots for delete to authenticated
  using (created_by = auth.uid());

-- spot_media
create policy "members can read spot media"
  on public.spot_media for select to authenticated
  using (
    exists (
      select 1 from public.spots s
      where s.id = spot_id and public.is_group_member(s.group_id)
    )
  );

create policy "members can add spot media"
  on public.spot_media for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.spots s
      where s.id = spot_id and public.is_group_member(s.group_id)
    )
  );

create policy "uploaders can delete their media"
  on public.spot_media for delete to authenticated
  using (uploaded_by = auth.uid());

-- ============================================================
-- Storage: private bucket for spot photos/videos.
-- The API hands out signed upload/download URLs, so no public
-- access is needed. Paths look like: <spot_id>/<media_id>.<ext>
-- ============================================================

insert into storage.buckets (id, name, public)
values ('spot-media', 'spot-media', false)
on conflict (id) do nothing;

create policy "members can read media objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'spot-media'
    and exists (
      select 1 from public.spots s
      where s.id::text = (storage.foldername(name))[1]
        and public.is_group_member(s.group_id)
    )
  );

create policy "members can upload media objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'spot-media'
    and exists (
      select 1 from public.spots s
      where s.id::text = (storage.foldername(name))[1]
        and public.is_group_member(s.group_id)
    )
  );
