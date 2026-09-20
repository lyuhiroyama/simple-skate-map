-- Group chat messages and private storage for chat photos.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  storage_path text,
  created_at timestamptz not null default now(),
  constraint messages_has_content check (char_length(trim(body)) > 0 or storage_path is not null)
);

create index messages_group_id_created_at_idx on public.messages (group_id, created_at);

alter table public.messages enable row level security;

create policy "members can read group messages"
  on public.messages for select to authenticated
  using (public.is_group_member(group_id));

create policy "members can send group messages"
  on public.messages for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

create policy "members can read chat media objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(name))[1]
        and public.is_group_member(g.id)
    )
  );

create policy "members can upload chat media objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.groups g
      where g.id::text = (storage.foldername(name))[1]
        and public.is_group_member(g.id)
    )
  );
