-- Collaborative listen-along rooms.
-- Each row = an active room. The `current_song` is stored as JSON so any
-- member can play it without it being in their personal library.

create table if not exists listening_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  current_song jsonb,
  position_seconds float not null default 0,
  is_playing boolean not null default false,
  last_action_by uuid references auth.users(id),
  last_action_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists listening_rooms_code_idx
  on listening_rooms (code);

create index if not exists listening_rooms_expires_idx
  on listening_rooms (expires_at);

-- Anyone signed in can read + update + insert. We don't expose row deletion
-- to clients — let the expires_at index drive cleanup separately.
alter table listening_rooms enable row level security;

drop policy if exists "listening_rooms read"  on listening_rooms;
drop policy if exists "listening_rooms write" on listening_rooms;
drop policy if exists "listening_rooms insert" on listening_rooms;

create policy "listening_rooms read"
  on listening_rooms for select
  using (true);

create policy "listening_rooms write"
  on listening_rooms for update
  using (true);

create policy "listening_rooms insert"
  on listening_rooms for insert
  with check (true);

-- Make Supabase Realtime broadcast row changes for this table
alter publication supabase_realtime add table listening_rooms;
