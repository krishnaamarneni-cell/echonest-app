export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Song {
  id: string;
  user_id: string;
  title: string;
  artist_name: string;
  album_name: string | null;
  album_id: string | null;
  artist_id: string | null;
  duration: number;
  file_url: string;
  cover_url: string | null;
  genre: string | null;
  track_number: number | null;
  source: 'upload' | 'youtube_embed';
  youtube_id: string | null;
  youtube_kind: 'video' | 'playlist';
  content_type: 'music' | 'podcast' | 'artist' | 'album';
  created_at: string;
}

export interface Album {
  id: string;
  user_id: string;
  title: string;
  artist_name: string;
  artist_id: string | null;
  cover_url: string | null;
  year: number | null;
  created_at: string;
  songs?: Song[];
}

export interface Artist {
  id: string;
  user_id: string;
  name: string;
  image_url: string | null;
  created_at: string;
  song_count?: number;
  album_count?: number;
}

export interface Playlist {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  song_count?: number;
  songs?: PlaylistSong[];
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  added_at: string;
  song?: Song;
}

export interface Like {
  id: string;
  user_id: string;
  song_id: string;
  created_at: string;
  song?: Song;
}

export interface RecentlyPlayed {
  id: string;
  user_id: string;
  song_id: string;
  played_at: string;
  song?: Song;
}

export interface YouTubeImport {
  id: string;
  user_id: string;
  playlist_url: string;
  playlist_title: string;
  imported_at: string;
  items?: YouTubeImportItem[];
}

export interface YouTubeImportItem {
  id: string;
  import_id: string;
  youtube_title: string;
  youtube_video_id: string;
  youtube_channel: string | null;
  matched_song_id: string | null;
  status: 'matched' | 'unmatched' | 'pending';
  matched_song?: Song;
}

export interface QueueItem {
  id: string;
  song: Song;
  source: 'playlist' | 'album' | 'library' | 'queue';
}

export type RepeatMode = 'off' | 'all' | 'one';
