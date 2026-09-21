-- Chat messages can carry several photos/videos in one row (album).

alter table public.messages
  add column if not exists media jsonb not null default '[]'::jsonb;

alter table public.messages drop constraint if exists messages_has_content;

alter table public.messages add constraint messages_has_content check (
  char_length(trim(body)) > 0
  or storage_path is not null
  or jsonb_array_length(media) > 0
);

notify pgrst, 'reload schema';
