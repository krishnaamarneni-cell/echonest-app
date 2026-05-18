-- ============================================================
-- EchoNest: YouTube refresh-token storage for background sync
-- ============================================================
-- Each user gets one row holding their Google OAuth tokens so we can
-- run periodic library syncs without making them reauth every time.
-- Refresh token is the long-lived one Google issues with
-- access_type=offline — we exchange it for fresh access tokens
-- server-side (the client secret can't be in the browser bundle).
--
-- RLS: a user can only read/write their own row.
-- ============================================================

create table if not exists user_youtube_tokens (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  access_token       text not null,
  refresh_token      text not null,
  expires_at         timestamptz not null,
  scopes             text,
  last_synced_at     timestamptz,
  auto_sync_enabled  boolean not null default true,
  updated_at         timestamptz not null default now()
);

alter table user_youtube_tokens enable row level security;

drop policy if exists "user_owns_tokens_select" on user_youtube_tokens;
create policy "user_owns_tokens_select"
  on user_youtube_tokens for select using (auth.uid() = user_id);

drop policy if exists "user_owns_tokens_insert" on user_youtube_tokens;
create policy "user_owns_tokens_insert"
  on user_youtube_tokens for insert with check (auth.uid() = user_id);

drop policy if exists "user_owns_tokens_update" on user_youtube_tokens;
create policy "user_owns_tokens_update"
  on user_youtube_tokens for update using (auth.uid() = user_id);

drop policy if exists "user_owns_tokens_delete" on user_youtube_tokens;
create policy "user_owns_tokens_delete"
  on user_youtube_tokens for delete using (auth.uid() = user_id);
