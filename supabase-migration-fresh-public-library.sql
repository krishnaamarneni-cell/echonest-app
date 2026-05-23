-- Fresh open public library — run ONCE in the Supabase SQL editor.
--
-- Goal: make EchoNest open like YouTube Music for any visitor — a catalog of
-- songs already there to browse and play, with NO leftover listening history
-- and NO playlists. The songs themselves are kept (that's the content); only
-- history + playlists are cleared.
--
-- Scoped to the public account (avgk26@gmail.com). Playlist song-links cascade
-- automatically when the playlist is deleted; songs and recently_played for
-- songs stay intact (we only drop the history rows, not the songs).

-- 1) Clear all listening history.
delete from recently_played
where user_id = (select id from auth.users where email = 'avgk26@gmail.com');

-- 2) Delete all playlists (imported YouTube playlists, "Liked Videos
--    (YouTube)", everything). playlist_songs links cascade; songs are kept.
delete from playlists
where user_id = (select id from auth.users where email = 'avgk26@gmail.com');
