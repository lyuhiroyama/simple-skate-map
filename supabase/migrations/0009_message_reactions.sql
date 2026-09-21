-- One emoji reaction per person per chat message.

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reactions_message_id_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

create policy "members can read reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_group_member(m.group_id)
    )
  );

create policy "members can react"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_group_member(m.group_id)
    )
  );

create policy "members can change their reaction"
  on public.message_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "members can remove their reaction"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

grant all on table public.message_reactions to postgres, service_role;
grant select, insert, update, delete on table public.message_reactions to authenticated;

notify pgrst, 'reload schema';
