-- Migration: channels the user follows (news + podcasts)
-- Run this on your Supabase project SQL editor after the main schema.
--
-- Backs the "Add to News" / "Add to Podcasts" buttons. One row per channel
-- per user per category, so the same channel can sit in both lists if that's
-- what the user wants. Stores the YouTube metadata we already resolved at
-- follow time (title, artwork, uploads playlist) so listing a user's
-- channels costs zero YouTube quota — only opening one to read episodes
-- hits the API.

create table if not exists public.followed_channels (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  channel_id text not null,
  handle text not null,
  title text not null,
  thumbnail text,
  uploads_playlist_id text not null,
  category text not null default 'podcast',
  created_at timestamptz default now() not null
);

alter table public.followed_channels
  drop constraint if exists followed_channels_category_check;

alter table public.followed_channels
  add constraint followed_channels_category_check
    check (category in ('news', 'podcast'));

-- One entry per channel per category per user; the UI toggles follow state,
-- so re-adding must not create duplicates.
create unique index if not exists idx_followed_channels_unique
  on public.followed_channels(user_id, channel_id, category);

create index if not exists idx_followed_channels_lookup
  on public.followed_channels(user_id, category, created_at desc);

alter table public.followed_channels enable row level security;

drop policy if exists "Users can CRUD own followed channels" on public.followed_channels;

create policy "Users can CRUD own followed channels" on public.followed_channels
  for all using (auth.uid() = user_id);
