-- Migration: add content_type column to categorize songs (music vs podcast)
-- Run this on your Supabase project SQL editor after the main schema.

alter table public.songs
  add column if not exists content_type text not null default 'music';

alter table public.songs
  drop constraint if exists songs_content_type_check;

alter table public.songs
  add constraint songs_content_type_check
    check (content_type in ('music', 'podcast'));

-- Index for faster filtering when the library tabs filter by content_type
create index if not exists idx_songs_content_type
  on public.songs(user_id, content_type);
