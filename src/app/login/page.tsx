'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSigningIn, setAutoSigningIn] = useState(true);
  const router = useRouter();

  // PWA cold-launches sometimes land here (last-visited URL persisted by
  // iOS). If a public account is configured server-side, sign in as it
  // automatically so the user never sees the empty form. Set
  // ?manual=1 in the URL to force the form (Settings → "Make it yours"
  // already does this when a visitor explicitly wants to sign in/up).
  useEffect(() => {
    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
    if (params?.get('manual') === '1') {
      setAutoSigningIn(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          router.replace('/dashboard');
          return;
        }
        const res = await fetch('/api/public-session', { method: 'POST' });
        if (cancelled) return;
        if (res.ok) {
          window.location.href = '/dashboard';
          return;
        }
      } catch {}
      if (!cancelled) setAutoSigningIn(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Signing in manually with credentials = you're the owner. Enable owner
    // mode so delete buttons are visible right away.
    if (typeof window !== 'undefined') {
      localStorage.setItem('echonest-owner-mode', '1');
    }

    router.push('/dashboard');
    router.refresh();
  };

  if (autoSigningIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <Logo size="lg" />
          <p className="text-sm text-muted-foreground">Opening your library…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 animate-fade-in">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <Logo size="lg" />
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sign in to your music library
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-muted-foreground">Password</label>
              <Link href="/forgot-password" className="text-xs text-accent hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-lg">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
