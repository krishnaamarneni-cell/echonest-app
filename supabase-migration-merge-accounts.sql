-- EchoNest account merge — run ONCE in the Supabase SQL editor.
--
-- Moves everything from the amarnenigopal account (SRC) into the avgk26
-- account (DST), so avgk26 ends up with its own history/library PLUS the
-- YouTube playlists that were imported under amarnenigopal.
--
--   SRC (amarnenigopal@gmail.com) = ea8b6b5b-bec2-4ef9-855b-77367ff7947a
--   DST (avgk26@gmail.com)        = 836a7d45-8b74-45ac-880c-784529d71b6c
--
-- Dedups by youtube_id (songs) and source_youtube_id (playlists) so nothing
-- is doubled. Everything runs in ONE transaction — if any step errors, the
-- whole thing rolls back and nothing changes. Songs are never deleted except
-- exact youtube_id duplicates that already exist under DST.

begin;

-- ========================= SONGS =========================
-- A) SRC songs whose youtube_id already exists under DST are duplicates.
--    Repoint their playlist links to DST's copy (skip if already linked),
--    then delete the SRC duplicate (leftover links cascade away).
with dup as (
  select s_src.id as src_id, s_dst.id as dst_id
  from songs s_src
  join songs s_dst
    on s_dst.user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
   and s_dst.youtube_id = s_src.youtube_id
  where s_src.user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a'
    and s_src.youtube_id is not null
)
update playlist_songs ps
set song_id = dup.dst_id
from dup
where ps.song_id = dup.src_id
  and not exists (
    select 1 from playlist_songs x
    where x.playlist_id = ps.playlist_id and x.song_id = dup.dst_id
  );

delete from songs s_src
using songs s_dst
where s_src.user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a'
  and s_dst.user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
  and s_src.youtube_id is not null
  and s_dst.youtube_id = s_src.youtube_id;

-- B) Remaining SRC songs (no DST twin) move over to DST.
update songs
set user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
where user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a';

-- ======================= PLAYLISTS =======================
-- C) SRC playlists whose source_youtube_id already exists under DST are
--    duplicates. Merge their songs into DST's playlist (skip already-linked),
--    then delete the SRC playlist (leftover links cascade away).
with conflict as (
  select p_src.id as src_id, p_dst.id as dst_id
  from playlists p_src
  join playlists p_dst
    on p_dst.user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
   and p_dst.source_youtube_id = p_src.source_youtube_id
  where p_src.user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a'
    and p_src.source_youtube_id is not null
)
update playlist_songs ps
set playlist_id = conflict.dst_id
from conflict
where ps.playlist_id = conflict.src_id
  and not exists (
    select 1 from playlist_songs x
    where x.playlist_id = conflict.dst_id and x.song_id = ps.song_id
  );

delete from playlists p_src
using playlists p_dst
where p_src.user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a'
  and p_dst.user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
  and p_src.source_youtube_id is not null
  and p_dst.source_youtube_id = p_src.source_youtube_id;

-- D) Remaining SRC playlists (no DST twin, incl. user-made/null-source) move.
update playlists
set user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
where user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a';

-- ==================== LIKES / HISTORY ====================
-- SRC has ~0 of these, but handle generally. Likes have a unique
-- (user_id, song_id), so move only non-colliding rows then drop the rest.
update likes
set user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
where user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a'
  and not exists (
    select 1 from likes d
    where d.user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
      and d.song_id = likes.song_id
  );
delete from likes where user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a';

update recently_played
set user_id = '836a7d45-8b74-45ac-880c-784529d71b6c'
where user_id = 'ea8b6b5b-bec2-4ef9-855b-77367ff7947a';

commit;
