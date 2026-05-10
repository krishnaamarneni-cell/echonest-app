-- Migration: Add YouTube embed support to songs
-- Run this if you already created the schema before this update

alter table public.songs
  alter column file_url set default '',
  add column if not exists source text not null default 'upload',
  add column if not exists youtube_id text,
  add column if not exists youtube_kind text not null default 'video';

alter table public.songs
  drop constraint if exists songs_source_check;
alter table public.songs
  add constraint songs_source_check check (source in ('upload', 'youtube_embed'));

alter table public.songs
  drop constraint if exists songs_youtube_kind_check;
alter table public.songs
  add constraint songs_youtube_kind_check check (youtube_kind in ('video', 'playlist'));
