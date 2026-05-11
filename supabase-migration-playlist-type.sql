-- Migration: tag playlists with a content type so the Library can
-- separate podcast playlists from music playlists.

alter table public.playlists
  add column if not exists content_type text not null default 'music';

alter table public.playlists
  drop constraint if exists playlists_content_type_check;

alter table public.playlists
  add constraint playlists_content_type_check
    check (content_type in ('music', 'podcast', 'artist', 'album'));

create index if not exists idx_playlists_content_type
  on public.playlists(user_id, content_type);
