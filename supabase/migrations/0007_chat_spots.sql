-- Chat messages can carry a shared pin (spot snapshot).

alter table public.messages
  add column if not exists spot jsonb;

alter table public.messages drop constraint if exists messages_has_content;

alter table public.messages add constraint messages_has_content check (
  char_length(trim(body)) > 0
    or storage_path is not null
    or jsonb_array_length(media) > 0
    or spot is not null
);

notify pgrst, 'reload schema';
