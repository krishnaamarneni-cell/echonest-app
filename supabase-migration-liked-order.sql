-- Migration: let Liked Songs be rearranged by hand.
--
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- playlist_songs already carries a `position`, so playlists could always
-- have been reordered. likes could not: it only knew when you liked
-- something, which is an order you cannot change without un-liking and
-- re-liking. This adds the missing column.

alter table public.likes
  add column if not exists position int;

-- Backfill in the order the page currently shows, newest first, so
-- turning on "My order" starts from exactly what you were already
-- looking at rather than reshuffling everything.
with ranked as (
  select id,
         row_number() over (
           partition by user_id order by created_at desc
         ) - 1 as rn
  from public.likes
)
update public.likes l
set position = r.rn
from ranked r
where r.id = l.id
  and l.position is null;

-- Deliberately left NULLABLE. Every existing insert path writes a like
-- without a position, and a NOT NULL column would break all of them.
-- A null simply means "not placed yet"; the client orders nulls first so
-- a song you just liked appears at the top, which is where you would
-- look for it.
create index if not exists idx_likes_user_position
  on public.likes(user_id, position);
