-- MCP (Model Context Protocol) personal access tokens — run ONCE in the
-- Supabase SQL editor. Safe to re-run; uses IF NOT EXISTS everywhere.
--
-- Each token lets one AI client (Claude Desktop, ChatGPT custom connector,
-- Cursor, Zed, etc.) act on behalf of the user via /api/mcp. We store only
-- the SHA-256 hash of the token so a leaked DB doesn't leak tokens; the
-- plaintext is shown to the user exactly once at creation time. Tokens are
-- revocable (set revoked_at), auto-expire after a year by default, and
-- EchoNest tracks last_used_at so the user can clean up dormant ones.

create table if not exists public.mcp_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  token_hash    text not null unique,
  token_prefix  text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '365 days'),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

-- Backfill expires_at for anyone who created the table BEFORE this column
-- was added (idempotent: only adds the column if missing).
alter table public.mcp_tokens
  add column if not exists expires_at timestamptz
  not null default (now() + interval '365 days');

create index if not exists mcp_tokens_user_id_idx on public.mcp_tokens(user_id);
create index if not exists mcp_tokens_token_hash_idx on public.mcp_tokens(token_hash);

alter table public.mcp_tokens enable row level security;

-- Users can list / create / revoke their own tokens.
drop policy if exists "own mcp_tokens" on public.mcp_tokens;
create policy "own mcp_tokens" on public.mcp_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The /api/mcp endpoint authenticates by token (Bearer header) rather than
-- by Supabase session, so it queries this table via the service role
-- (RLS-bypassing) to resolve token -> user_id. That's safe because the
-- token itself is the secret.
