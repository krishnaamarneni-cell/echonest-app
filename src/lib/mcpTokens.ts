// MCP token utilities — generate, hash, and validate personal access
// tokens for the /api/mcp endpoint. We never store the plaintext token;
// only its SHA-256 hash lives in the DB, so a database leak doesn't
// leak tokens. The plaintext is shown to the user exactly once at
// creation time and they paste it into their AI client's config.

import { randomBytes, createHash } from 'crypto';

const TOKEN_PREFIX = 'mcp_'; // visible marker so a stray token in a log is recognizable

export interface NewToken {
  /** Plaintext token — show to user once, then forget. */
  token: string;
  /** SHA-256 hash of the plaintext — store this. */
  hash: string;
  /** First 8 chars after the `mcp_` prefix, safe to display alongside the token row. */
  prefix: string;
}

export function generateToken(): NewToken {
  // 32 bytes -> 43 base64url chars. Plenty of entropy, fits in a URL.
  const random = randomBytes(32).toString('base64url');
  const token = `${TOKEN_PREFIX}${random}`;
  return {
    token,
    hash: hashToken(token),
    prefix: random.slice(0, 8),
  };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cheap pre-check: does this string look like one of our tokens at all? */
export function looksLikeToken(s: string | null | undefined): s is string {
  if (!s) return false;
  return s.startsWith(TOKEN_PREFIX) && s.length >= TOKEN_PREFIX.length + 30;
}
