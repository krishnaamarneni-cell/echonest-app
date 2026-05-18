'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

interface GoogleSignInButtonProps {
  /** Extra OAuth scopes — e.g. 'https://www.googleapis.com/auth/youtube.readonly'
   *  Phase 2 will pass this; Phase 1 sticks to bare email/profile. */
  scopes?: string;
  /** Where Supabase should send the user back after Google grants access. */
  redirectTo?: string;
  /** Custom label override. */
  label?: string;
}

export function GoogleSignInButton({
  scopes,
  redirectTo,
  label = 'Continue with Google',
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    const supabase = createClient();
    // Build the final callback target. Supabase will redirect the user back
    // to /auth/callback?code=... which we then exchange for a session, then
    // redirect to redirectTo.
    const next = redirectTo || '/dashboard';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes,
        // Ensure we get a refresh token so Phase 3 (background sync) can
        // re-fetch the user's playlists without prompting them again.
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) {
      console.error('Google sign-in failed:', error);
      setLoading(false);
    }
    // On success, Supabase has already navigated us to Google's consent
    // screen, so we won't get back to this component.
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      type="button"
      className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-white text-gray-900 font-medium text-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60 transition-colors border border-gray-200 shadow-sm"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        // Official Google "G" mark — used per their brand guidelines for
        // sign-in buttons. Inline SVG to avoid an extra fetch.
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            fill="#34A853"
          />
          <path
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            fill="#EA4335"
          />
        </svg>
      )}
      {label}
    </button>
  );
}
