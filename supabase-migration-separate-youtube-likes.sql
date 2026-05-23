-- EchoNest cleanup — run ONCE in the Supabase SQL editor (Dashboard → SQL Editor).
--
-- Fixes two things for every account:
--   1. De-duplicates YouTube-sourced playlists (e.g. multiple "Liked Videos
--      (YouTube)" rows created by clicking Sync repeatedly): keeps the oldest,
--      merges its songs, deletes the extras.
--   2. Moves YouTube "Liked Videos" out of EchoNest's Liked Songs (the `likes`
--      table) into the dedicated "Liked Videos (YouTube)" playlist, so the two
--      stop being clubbed together.
--   3. Adds a unique index so duplicate playlists can't be created again.
--
-- Safe to re-run: every step is guarded, and it all runs in one transaction —
-- if anything errors, nothing is changed (just run ROLLBACK; if the editor
-- leaves the session in an aborted state, then re-run).

begin;

-- 1) De-duplicate playlists that share (user_id, source_youtube_id).
--    A row is a "duplicate" if an older row exists with the same key.
--    First, re-point its song links to the oldest (keeper), skipping any the
--    keeper already has.
update playlist_songs ps
set playlist_id = keep.id
from playlists dup
join lateral (
  select o.id
  from playlists o
  where o.user_id = dup.user_id
    and o.source_youtube_id = dup.source_youtube_id
  order by o.created_at asc, o.id asc
  limit 1
) keep on true
where dup.source_youtube_id is not null
  and ps.playlist_id = dup.id
  and dup.id <> keep.id
  and not exists (
    select 1 from playlist_songs k
    where k.playlist_id = keep.id and k.song_id = ps.song_id
  );

-- Remove leftover links still pointing at duplicates (keeper already had them).
delete from playlist_songs ps
using playlists dup
where dup.source_youtube_id is not null
  and ps.playlist_id = dup.id
  and exists (
    select 1 from playlists o
    where o.user_id = dup.user_id
      and o.source_youtube_id = dup.source_youtube_id
      and (o.created_at < dup.created_at
           or (o.created_at = dup.created_at and o.id < dup.id))
  );

-- Delete the duplicate playlist rows themselves.
delete from playlists dup
where dup.source_youtube_id is not null
  and exists (
    select 1 from playlists o
    where o.user_id = dup.user_id
      and o.source_youtube_id = dup.source_youtube_id
      and (o.created_at < dup.created_at
           or (o.created_at = dup.created_at and o.id < dup.id))
  );

-- 2) Ensure every user with YouTube-video likes has a "Liked Videos (YouTube)"
--    playlist to hold them.
insert into playlists (user_id, title, description, source_youtube_id, content_type, is_public)
select distinct l.user_id,
       'Liked Videos (YouTube)',
       'Your liked videos, synced from YouTube',
       'LL', 'music', false
from likes l
join songs s on s.id = l.song_id
where s.source = 'youtube_embed' and s.youtube_kind = 'video'
  and not exists (
    select 1 from playlists p
    where p.user_id = l.user_id and p.source_youtube_id = 'LL'
  );

-- 3) Link each YouTube-video liked song into that user's LL playlist, appending
--    after any songs already there and skipping ones already linked.
insert into playlist_songs (playlist_id, song_id, position)
select ll.id,
       s.id,
       ll.base + row_number() over (partition by ll.id order by l.created_at)
from likes l
join songs s on s.id = l.song_id
join (
  select p.id, p.user_id,
         coalesce((select max(ps.position) from playlist_songs ps where ps.playlist_id = p.id), -1) as base
  from playlists p
  where p.source_youtube_id = 'LL'
) ll on ll.user_id = l.user_id
where s.source = 'youtube_embed' and s.youtube_kind = 'video'
  and not exists (
    select 1 from playlist_songs ps2
    where ps2.playlist_id = ll.id and ps2.song_id = s.id
  );

-- 4) Remove those YouTube-video likes from Liked Songs (the songs themselves
--    stay; only the like reference goes).
delete from likes l
using songs s
where l.song_id = s.id
  and s.source = 'youtube_embed'
  and s.youtube_kind = 'video';

-- 5) Prevent future duplicates. NULL source_youtube_id (user-made playlists)
--    is exempt — Postgres treats NULLs as distinct, so normal playlists are
--    unaffected.
create unique index if not exists playlists_user_source_yt_uniq
  on playlists (user_id, source_youtube_id);

commit;
