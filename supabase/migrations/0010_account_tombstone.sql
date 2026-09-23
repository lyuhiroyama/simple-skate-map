-- Keep chat and spots when someone deletes their account.
-- Profile stays as a tombstone; login (auth.users) is still removed.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

notify pgrst, 'reload schema';
