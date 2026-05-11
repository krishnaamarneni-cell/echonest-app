-- Migration: link EchoNest playlists back to the YouTube playlist they were
-- imported from, so we can sync new videos in or out later.

alter table public.playlists
  add column if not exists source_youtube_id text,
  add column if not exists last_synced_at timestamptz;

create index if not exists idx_playlists_source_yt
  on public.playlists(user_id, source_youtube_id)
  where source_youtube_id is not null;
