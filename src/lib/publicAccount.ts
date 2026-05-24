// Identifies the shared "public library" account. Everyone who opens
// EchoNest without signing in is auto-logged into this one shared account,
// so its Settings must NOT expose a personal profile, email, or
// account-deletion controls — instead we offer Sign in / Sign up.
//
// The public account's email is configured server-side as PUBLIC_USER_EMAIL.
// Expose the same value to the client via NEXT_PUBLIC_PUBLIC_ACCOUNT_EMAIL,
// falling back to the project default.
const DEFAULT_PUBLIC_EMAIL = 'avgk26@gmail.com';

export function getPublicAccountEmail(): string {
  return (process.env.NEXT_PUBLIC_PUBLIC_ACCOUNT_EMAIL || DEFAULT_PUBLIC_EMAIL).toLowerCase();
}

export function isPublicAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === getPublicAccountEmail();
}
