-- Limit username changes to once per 24 hours after the first chosen name.

alter table public.profiles
  add column if not exists username_changed_at timestamptz;

notify pgrst, 'reload schema';
