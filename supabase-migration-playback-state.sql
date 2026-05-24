-- Cross-device playback sync — run ONCE in the Supabase SQL editor.
--
-- Stores one "now playing" snapshot per account so the same login on a
-- phone / laptop / iPad can pick up the same song at the same position.
-- One row per user; each device writes its current track + position and
-- reads the latest on open/focus.

create table if not exists public.playback_state (
  user_id     uuid references auth.users on delete cascade primary key,
  song        jsonb,
  position    double precision not null default 0,
  is_playing  boolean not null default false,
  device_id   text,
  updated_at  timestamptz not null default now()
);

alter table public.playback_state enable row level security;

-- Each user can only read/write their own snapshot.
drop policy if exists "own playback_state" on public.playback_state;
create policy "own playback_state" on public.playback_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
