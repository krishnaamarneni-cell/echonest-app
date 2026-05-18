/**
 * Admin model for EchoNest.
 *
 * The "public library" is a shared Supabase account anyone can use. We
 * want everyone to be able to ADD songs / playlists but only specific
 * people (the project operator + invited curators) to be able to REMOVE
 * them. Rather than ship a unlock-with-password UI, we just hard-code
 * a list of admin emails — the auth-state hook auto-sets owner-mode
 * when a session matches.
 *
 * To add more curators, append their Google account email to
 * NEXT_PUBLIC_ADMIN_EMAILS (comma-separated). Falls back to the hard-
 * coded default below if the env var isn't set.
 */

const DEFAULT_ADMINS = ['avgk26@gmail.com'];

let cachedList: string[] | null = null;

export function getAdminEmails(): string[] {
  if (cachedList) return cachedList;
  const envVar = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  if (envVar) {
    cachedList = envVar
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  } else {
    cachedList = DEFAULT_ADMINS.map((e) => e.toLowerCase());
  }
  return cachedList;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
