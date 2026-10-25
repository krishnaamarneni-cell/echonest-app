-- Migration: give news its own content_type, and reclassify the news
-- clips already stored as podcasts.
--
-- News videos and podcast episodes were both tagged 'podcast', because
-- that was the only non-music value the check constraint allowed. The
-- result was that every news clip you played turned up under Home →
-- Podcasts. This adds 'news' as a value in its own right.
--
-- Run this in the Supabase SQL editor. Safe to run more than once.

-- 1. Allow the new value ------------------------------------------------

alter table public.songs
  drop constraint if exists songs_content_type_check;

alter table public.songs
  add constraint songs_content_type_check
    check (content_type in ('music', 'podcast', 'news', 'artist', 'album'));

alter table public.playlists
  drop constraint if exists playlists_content_type_check;

alter table public.playlists
  add constraint playlists_content_type_check
    check (content_type in ('music', 'podcast', 'news', 'artist', 'album'));

-- 2. Backfill the rows already written ----------------------------------
--
-- A song stored as a podcast whose artist_name is a channel you follow
-- under News is really a news clip. Driven off followed_channels rather
-- than a hardcoded list of broadcasters, so it reclassifies exactly the
-- channels you actually added — and nothing else.
--
-- Channels followed under BOTH categories are left as podcasts: there's
-- no way to tell from the row which list it was played from, and leaving
-- it put is the change that can't be wrong.

update public.songs s
set content_type = 'news'
where s.content_type = 'podcast'
  and exists (
    select 1 from public.followed_channels fc
    where fc.user_id = s.user_id
      and fc.category = 'news'
      and fc.title = s.artist_name
  )
  and not exists (
    select 1 from public.followed_channels fc
    where fc.user_id = s.user_id
      and fc.category = 'podcast'
      and fc.title = s.artist_name
  );
