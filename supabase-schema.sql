-- EchoNest Database Schema for Supabase

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users profile (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Artists
create table public.artists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  image_url text,
  created_at timestamptz default now() not null
);

alter table public.artists enable row level security;

create policy "Users can CRUD own artists" on public.artists
  for all using (auth.uid() = user_id);

-- Albums
create table public.albums (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  artist_name text not null default 'Unknown Artist',
  artist_id uuid references public.artists on delete set null,
  cover_url text,
  year int,
  created_at timestamptz default now() not null
);

alter table public.albums enable row level security;

create policy "Users can CRUD own albums" on public.albums
  for all using (auth.uid() = user_id);

-- Songs
create table public.songs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  artist_name text not null default 'Unknown Artist',
  album_name text,
  album_id uuid references public.albums on delete set null,
  artist_id uuid references public.artists on delete set null,
  duration float not null default 0,
  file_url text not null default '',
  cover_url text,
  genre text,
  track_number int,
  source text not null default 'upload' check (source in ('upload', 'youtube_embed')),
  youtube_id text,
  youtube_kind text not null default 'video' check (youtube_kind in ('video', 'playlist')),
  created_at timestamptz default now() not null
);

alter table public.songs enable row level security;

create policy "Users can CRUD own songs" on public.songs
  for all using (auth.uid() = user_id);

-- Playlists
create table public.playlists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  cover_url text,
  is_public boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.playlists enable row level security;

create policy "Users can CRUD own playlists" on public.playlists
  for all using (auth.uid() = user_id);

-- Playlist songs (junction table)
create table public.playlist_songs (
  id uuid default uuid_generate_v4() primary key,
  playlist_id uuid references public.playlists on delete cascade not null,
  song_id uuid references public.songs on delete cascade not null,
  position int not null default 0,
  added_at timestamptz default now() not null
);

alter table public.playlist_songs enable row level security;

create policy "Users can CRUD own playlist songs" on public.playlist_songs
  for all using (
    exists (
      select 1 from public.playlists
      where id = playlist_songs.playlist_id
      and user_id = auth.uid()
    )
  );

-- Likes
create table public.likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  song_id uuid references public.songs on delete cascade not null,
  created_at timestamptz default now() not null,
  unique(user_id, song_id)
);

alter table public.likes enable row level security;

create policy "Users can CRUD own likes" on public.likes
  for all using (auth.uid() = user_id);

-- Recently played
create table public.recently_played (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  song_id uuid references public.songs on delete cascade not null,
  played_at timestamptz default now() not null
);

alter table public.recently_played enable row level security;

create policy "Users can CRUD own recently played" on public.recently_played
  for all using (auth.uid() = user_id);

-- YouTube imports
create table public.youtube_imports (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  playlist_url text not null,
  playlist_title text not null,
  imported_at timestamptz default now() not null
);

alter table public.youtube_imports enable row level security;

create policy "Users can CRUD own imports" on public.youtube_imports
  for all using (auth.uid() = user_id);

-- YouTube import items
create table public.youtube_import_items (
  id uuid default uuid_generate_v4() primary key,
  import_id uuid references public.youtube_imports on delete cascade not null,
  youtube_title text not null,
  youtube_video_id text not null,
  youtube_channel text,
  matched_song_id uuid references public.songs on delete set null,
  status text not null default 'pending' check (status in ('matched', 'unmatched', 'pending'))
);

alter table public.youtube_import_items enable row level security;

create policy "Users can CRUD own import items" on public.youtube_import_items
  for all using (
    exists (
      select 1 from public.youtube_imports
      where id = youtube_import_items.import_id
      and user_id = auth.uid()
    )
  );

-- Storage bucket for audio files
insert into storage.buckets (id, name, public) values ('audio', 'audio', true);
insert into storage.buckets (id, name, public) values ('covers', 'covers', true);

-- Storage policies
create policy "Users can upload audio" on storage.objects
  for insert with check (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read audio" on storage.objects
  for select using (bucket_id = 'audio');

create policy "Users can delete own audio" on storage.objects
  for delete using (bucket_id = 'audio' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can upload covers" on storage.objects
  for insert with check (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can read covers" on storage.objects
  for select using (bucket_id = 'covers');

create policy "Users can delete own covers" on storage.objects
  for delete using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes
create index idx_songs_user on public.songs(user_id);
create index idx_songs_artist on public.songs(artist_id);
create index idx_songs_album on public.songs(album_id);
create index idx_albums_user on public.albums(user_id);
create index idx_artists_user on public.artists(user_id);
create index idx_playlists_user on public.playlists(user_id);
create index idx_likes_user on public.likes(user_id);
create index idx_recently_played_user on public.recently_played(user_id, played_at desc);
create index idx_playlist_songs_playlist on public.playlist_songs(playlist_id, position);
