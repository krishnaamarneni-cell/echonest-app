-- Migration: shared + public collections for EchoNest.
--
-- Run this in the Supabase SQL editor. Safe to run more than once.
-- It adds TWO independent ways for one user's music to reach another:
--
--   PART A  private share   - you name one person by email; both of you
--                             can add songs; nobody else can see it.
--   PART B  public profile  - you pick a username and flip your profile
--                             public; anyone can find it and browse it,
--                             read-only.
--
-- Nothing is ever copied. Both mechanisms grant SELECT on the owner's
-- existing rows, so a song added on Thursday is visible on Friday with no
-- sync job, no snapshot and nothing to reconcile. "Live" is just what a
-- permission does.
--
-- The work is that every table here is locked to `auth.uid() = user_id`,
-- and a visible playlist crosses FOUR of them: playlists, playlist_songs,
-- the songs themselves, and profiles. Open one and the viewer sees an
-- empty playlist. They have to widen together.
--
-- PRIVACY DEFAULT: profiles start PRIVATE. Nothing below exposes a single
-- row until a user opts in by setting a username and flipping the switch.


-- =====================================================================
-- PART A - private, collaborative shares
-- =====================================================================

create table if not exists public.collection_shares (
  id uuid default uuid_generate_v4() primary key,
  kind text not null,
  -- null for 'likes': a user has one Liked Songs collection, so owner_id
  -- is already the target.
  playlist_id uuid references public.playlists on delete cascade,
  owner_id uuid references auth.users on delete cascade not null,
  shared_with uuid references auth.users on delete cascade not null,
  can_edit boolean not null default true,
  created_at timestamptz default now() not null,

  constraint collection_shares_kind_check
    check (kind in ('playlist', 'likes')),
  constraint collection_shares_target_check
    check ((kind = 'playlist' and playlist_id is not null)
        or (kind = 'likes' and playlist_id is null)),
  constraint collection_shares_not_self
    check (owner_id <> shared_with)
);

-- Re-sharing with the same person updates rather than stacking rows.
-- Partial, because the uniqueness key differs per kind.
create unique index if not exists idx_collection_shares_playlist
  on public.collection_shares(playlist_id, shared_with) where kind = 'playlist';
create unique index if not exists idx_collection_shares_likes
  on public.collection_shares(owner_id, shared_with) where kind = 'likes';
create index if not exists idx_collection_shares_recipient
  on public.collection_shares(shared_with, kind);

alter table public.collection_shares enable row level security;

drop policy if exists "Owners manage their shares" on public.collection_shares;
create policy "Owners manage their shares" on public.collection_shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Recipients can see shares with them" on public.collection_shares;
create policy "Recipients can see shares with them" on public.collection_shares
  for select using (auth.uid() = shared_with);

-- Being shared with is not something you should have to ask to undo.
drop policy if exists "Recipients can leave a share" on public.collection_shares;
create policy "Recipients can leave a share" on public.collection_shares
  for delete using (auth.uid() = shared_with);


-- =====================================================================
-- PART B - usernames and public profiles
-- =====================================================================

alter table public.profiles
  add column if not exists username text,
  add column if not exists is_public boolean not null default false;

-- Case-insensitive uniqueness: @Krishna and @krishna are one person.
create unique index if not exists idx_profiles_username
  on public.profiles(lower(username)) where username is not null;

alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- playlists.is_public already existed but was written as false and never
-- read, so it is free to take its obvious meaning: "show this on my
-- public profile". Backfilled to true so that flipping a profile public
-- shows the playlists you already have, rather than an empty page.
update public.playlists set is_public = true where is_public is not true;
alter table public.playlists alter column is_public set default true;


-- =====================================================================
-- Lookup helpers
-- =====================================================================
--
-- All `security definer` on purpose. A policy on playlist_songs that
-- reaches through playlists, whose policy reaches back through the share
-- table, is how you get `infinite recursion detected in policy` at
-- runtime. Reading the source tables with RLS bypassed inside a function
-- breaks the cycle, and hands the planner a plain IN-list it can hash
-- instead of a correlated subquery per row.
--
-- Each is still scoped to auth.uid() or to explicitly-public rows, so a
-- signed-in user can only learn about their own shares and about people
-- who chose to be findable.

create or replace function public.shared_playlist_ids()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  select playlist_id from public.collection_shares
  where shared_with = auth.uid() and kind = 'playlist'
$fn$;

create or replace function public.editable_playlist_ids()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  select playlist_id from public.collection_shares
  where shared_with = auth.uid() and kind = 'playlist' and can_edit
$fn$;

create or replace function public.shared_likes_owners()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  select owner_id from public.collection_shares
  where shared_with = auth.uid() and kind = 'likes'
$fn$;

-- People you share with in either direction, so both sides see a name
-- rather than a bare UUID.
create or replace function public.share_counterpart_ids()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  select shared_with from public.collection_shares where owner_id = auth.uid()
  union
  select owner_id from public.collection_shares where shared_with = auth.uid()
$fn$;

-- Opted-in public profiles. A username is required: being public without
-- one would mean being exposed with no way to be found, which is the
-- worst of both.
create or replace function public.public_profile_ids()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  select id from public.profiles where is_public and username is not null
$fn$;

create or replace function public.public_playlist_ids()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  select pl.id from public.playlists pl
  join public.profiles pr on pr.id = pl.user_id
  where pr.is_public and pr.username is not null and pl.is_public
$fn$;

-- Song rows visible for a reason other than ownership.
--
-- The second branch is the one that is easy to miss: in a COLLABORATIVE
-- playlist the songs a guest adds are rows in the GUEST's songs table, so
-- without it an owner would invite someone in and then be unable to see
-- what they contributed.
create or replace function public.visible_song_ids()
returns setof uuid language sql security definer stable
set search_path = public as $fn$
  -- in a playlist shared with me
  select ps.song_id from public.playlist_songs ps
  where ps.playlist_id in (select playlist_id from public.collection_shares
                           where shared_with = auth.uid() and kind = 'playlist')
  union
  -- added by a collaborator to a playlist I own
  select ps.song_id from public.playlist_songs ps
  join public.playlists p on p.id = ps.playlist_id
  where p.user_id = auth.uid()
  union
  -- liked by someone who shared their Liked Songs with me
  select l.song_id from public.likes l
  where l.user_id in (select owner_id from public.collection_shares
                      where shared_with = auth.uid() and kind = 'likes')
  union
  -- on a public profile's playlist
  select ps.song_id from public.playlist_songs ps
  join public.playlists pl on pl.id = ps.playlist_id
  join public.profiles pr on pr.id = pl.user_id
  where pr.is_public and pr.username is not null and pl.is_public
  union
  -- liked by a public profile
  select l.song_id from public.likes l
  join public.profiles pr on pr.id = l.user_id
  where pr.is_public and pr.username is not null
$fn$;


-- =====================================================================
-- Widening the existing tables
-- =====================================================================
--
-- All additive. Every policy below is PERMISSIVE, so it ORs with the
-- existing "owner can do everything" policy. Nothing a user could do
-- before becomes harder, and nothing not named here becomes visible.

-- SELECT only, deliberately: editing a playlist's title, art or
-- description stays with its owner. Collaborative means the track list,
-- not the identity of the playlist.
drop policy if exists "Shared playlists are readable" on public.playlists;
create policy "Shared playlists are readable" on public.playlists
  for select using (
    id in (select public.shared_playlist_ids())
    or id in (select public.public_playlist_ids())
  );

drop policy if exists "Shared playlist songs are readable" on public.playlist_songs;
create policy "Shared playlist songs are readable" on public.playlist_songs
  for select using (
    playlist_id in (select public.shared_playlist_ids())
    or playlist_id in (select public.public_playlist_ids())
  );

-- Write access comes ONLY from a private share. A public profile is a
-- window, never a door.
drop policy if exists "Collaborators can add songs" on public.playlist_songs;
create policy "Collaborators can add songs" on public.playlist_songs
  for insert with check (playlist_id in (select public.editable_playlist_ids()));

drop policy if exists "Collaborators can remove songs" on public.playlist_songs;
create policy "Collaborators can remove songs" on public.playlist_songs
  for delete using (playlist_id in (select public.editable_playlist_ids()));

drop policy if exists "Shared songs are readable" on public.songs;
create policy "Shared songs are readable" on public.songs
  for select using (id in (select public.visible_song_ids()));

drop policy if exists "Shared likes are readable" on public.likes;
create policy "Shared likes are readable" on public.likes
  for select using (
    user_id in (select public.shared_likes_owners())
    or user_id in (select public.public_profile_ids())
  );

-- People you share with, plus anyone who opted in to being public. Not a
-- directory of everybody.
drop policy if exists "Share counterparts are readable" on public.profiles;
create policy "Share counterparts are readable" on public.profiles
  for select using (
    id in (select public.share_counterpart_ids())
    or id in (select public.public_profile_ids())
  );


-- =====================================================================
-- Keep "last updated" honest
-- =====================================================================
--
-- A collaborator can add songs but cannot UPDATE the playlist row, so
-- without this the Library would sort a busy shared playlist by when its
-- OWNER last touched it. security definer because the trigger writes a
-- row the collaborator has no update rights on.

create or replace function public.touch_playlist_updated_at()
returns trigger language plpgsql security definer
set search_path = public as $fn$
begin
  update public.playlists set updated_at = now()
  where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$fn$;

drop trigger if exists trg_touch_playlist_updated_at on public.playlist_songs;
create trigger trg_touch_playlist_updated_at
  after insert or delete on public.playlist_songs
  for each row execute function public.touch_playlist_updated_at();


-- =====================================================================
-- Sharing by email
-- =====================================================================
--
-- The lookup lives INSIDE the share, so no profile data is ever returned
-- for an address the caller did not successfully share with. A plain
-- "find user by email" endpoint would hand back a name and id for any
-- address anyone cared to guess; this returns them only as the receipt
-- for a share that just happened.
--
-- Exact match only, so the most it confirms is whether one specific
-- address, already typed in full, has an account - the same thing every
-- invite flow discloses.

create or replace function public.share_collection(
  p_kind text,
  p_playlist_id uuid,
  p_email text,
  p_can_edit boolean default true
)
returns table (
  share_id uuid,
  recipient_id uuid,
  recipient_email text,
  recipient_name text
)
language plpgsql security definer
set search_path = public as $fn$
declare
  v_id uuid; v_email text; v_name text; v_share uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_kind not in ('playlist', 'likes') then raise exception 'bad_kind'; end if;

  select p.id, p.email, p.display_name into v_id, v_email, v_name
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;

  if v_id is null then raise exception 'no_such_user'; end if;
  if v_id = auth.uid() then raise exception 'cannot_share_with_self'; end if;

  if p_kind = 'playlist' then
    if not exists (select 1 from public.playlists
                   where id = p_playlist_id and user_id = auth.uid()) then
      raise exception 'not_your_playlist';
    end if;
    insert into public.collection_shares
      (kind, playlist_id, owner_id, shared_with, can_edit)
    values ('playlist', p_playlist_id, auth.uid(), v_id, coalesce(p_can_edit, true))
    on conflict (playlist_id, shared_with) where kind = 'playlist'
      do update set can_edit = excluded.can_edit
    returning id into v_share;
  else
    -- Liked Songs is read-only by nature: there is no meaningful way for
    -- someone else to like a song on your behalf.
    insert into public.collection_shares
      (kind, playlist_id, owner_id, shared_with, can_edit)
    values ('likes', null, auth.uid(), v_id, false)
    on conflict (owner_id, shared_with) where kind = 'likes'
      do update set can_edit = false
    returning id into v_share;
  end if;

  return query select v_share, v_id, v_email, v_name;
end;
$fn$;


-- =====================================================================
-- Finding people by username
-- =====================================================================
--
-- Prefix match against opted-in public profiles only. A private user is
-- never returned, however exactly you spell their name.

create or replace function public.search_profiles(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql security definer stable
set search_path = public as $fn$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.is_public
    and p.username is not null
    and length(trim(coalesce(p_query, ''))) > 0
    and p.username like lower(trim(coalesce(p_query, ''))) || '%'
  order by p.username
  limit 20
$fn$;

-- Claim or change a username. Enforced here as well as by the index so
-- the app gets a clean error instead of a raw constraint violation.
create or replace function public.set_username(p_username text)
returns text language plpgsql security definer
set search_path = public as $fn$
declare
  v_name text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  v_name := lower(trim(p_username));
  if v_name !~ '^[a-z0-9_]{3,20}$' then raise exception 'bad_username'; end if;
  if exists (select 1 from public.profiles
             where lower(username) = v_name and id <> auth.uid()) then
    raise exception 'username_taken';
  end if;
  update public.profiles set username = v_name where id = auth.uid();
  return v_name;
end;
$fn$;
