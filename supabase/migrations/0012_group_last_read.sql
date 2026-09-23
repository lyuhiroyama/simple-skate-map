-- Per-member last-read time so group chat can show unread dots.
-- Existing members default to now() so old messages do not all light up.

alter table public.group_members
  add column if not exists last_read_at timestamptz not null default now();

notify pgrst, 'reload schema';
