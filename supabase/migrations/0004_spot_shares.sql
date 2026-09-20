-- Pins are owned by a user. Sharing with groups is optional (many groups).

create table public.spot_shares (
  spot_id uuid not null references public.spots (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (spot_id, group_id)
);

create index spot_shares_group_id_idx on public.spot_shares (group_id);

insert into public.spot_shares (spot_id, group_id)
select id, group_id from public.spots
on conflict do nothing;

drop policy if exists "members can read group spots" on public.spots;
drop policy if exists "members can create spots" on public.spots;
drop policy if exists "members can read spot media" on public.spot_media;
drop policy if exists "members can add spot media" on public.spot_media;
drop policy if exists "members can read media objects" on storage.objects;
drop policy if exists "members can upload media objects" on storage.objects;

alter table public.spots drop column group_id;

create or replace function public.can_access_spot(sid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.spots s
    where s.id = sid
      and (
        s.created_by = auth.uid()
        or exists (
          select 1
          from public.spot_shares ss
          where ss.spot_id = s.id
            and public.is_group_member(ss.group_id)
        )
      )
  );
$$;

create policy "owners and shared group members can read spots"
  on public.spots for select to authenticated
  using (public.can_access_spot(id));

create policy "users can create their own spots"
  on public.spots for insert to authenticated
  with check (created_by = auth.uid());

create policy "members can read spot media"
  on public.spot_media for select to authenticated
  using (public.can_access_spot(spot_id));

create policy "members can add spot media"
  on public.spot_media for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_spot(spot_id));

alter table public.spot_shares enable row level security;

create policy "visible spots shares are readable"
  on public.spot_shares for select to authenticated
  using (public.can_access_spot(spot_id));

create policy "owners can share spots with their groups"
  on public.spot_shares for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and exists (
      select 1 from public.spots s
      where s.id = spot_id and s.created_by = auth.uid()
    )
  );

create policy "owners can unshare spots"
  on public.spot_shares for delete to authenticated
  using (
    exists (
      select 1 from public.spots s
      where s.id = spot_id and s.created_by = auth.uid()
    )
  );

create policy "members can read media objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'spot-media'
    and public.can_access_spot(((storage.foldername(name))[1])::uuid)
  );

create policy "members can upload media objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'spot-media'
    and public.can_access_spot(((storage.foldername(name))[1])::uuid)
  );

grant all on table public.spot_shares to postgres, service_role;
grant select, insert, delete on table public.spot_shares to authenticated;

notify pgrst, 'reload schema';
