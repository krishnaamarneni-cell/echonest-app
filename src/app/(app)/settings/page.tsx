'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User, LogOut, Save, Lock, Unlock, UserPlus, Smartphone, Sparkles } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useOwnerMode } from '@/store/ownerMode';
import { useBackgroundMode } from '@/store/backgroundMode';
import { useAutoplay } from '@/store/autoplay';
import { YouTubeImportPanel } from '@/components/ui/YouTubeImportPanel';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const { isOwner, hydrate, unlock, lock } = useOwnerMode();
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const { enabled: bgEnabled, hydrate: hydrateBg, toggle: toggleBg } = useBackgroundMode();
  const { enabled: autoplayEnabled, hydrate: hydrateAutoplay, toggle: toggleAutoplay } = useAutoplay();
  useEffect(() => { hydrateBg(); }, [hydrateBg]);
  useEffect(() => { hydrateAutoplay(); }, [hydrateAutoplay]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email || '');
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data?.display_name) setDisplayName(data.display_name);
          });
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id);
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    try { await supabase.auth.signOut(); } catch {}
    // Also clear server-side cookies — client signOut alone doesn't always
    // remove the SSR auth cookies, so middleware keeps the user "logged in"
    // on next request.
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {}
    // Flag so AppLayout's and /login's auto-public-signin don't immediately
    // sign the user back in. Cleared when they sign in manually again.
    if (typeof window !== 'undefined') {
      localStorage.setItem('echonest-explicit-signout', '1');
      localStorage.removeItem('echonest-owner-mode');
    }
    // Hard redirect so middleware/AppLayout re-evaluate against the new state
    window.location.href = '/login?manual=1';
  };

  // Sign out the auto-signed-in public account first, then hard-redirect
  // to /login or /signup. Without this, the public-account session causes
  // middleware to bounce auth pages back to /dashboard.
  const handleGoToAuth = async (path: '/login' | '/signup') => {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — we navigate either way
    }
    // ?manual=1 tells the auth page the user explicitly wants the form,
    // bypassing the public-account auto-signin we added on /login.
    window.location.href = `${path}?manual=1`;
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerPassword) return;
    setOwnerError('');
    setOwnerLoading(true);
    const ok = await unlock(ownerPassword);
    setOwnerLoading(false);
    if (ok) {
      setOwnerPassword('');
    } else {
      setOwnerError('Wrong password');
    }
  };

  // Public visitors (not unlocked into owner mode) see a different view —
  // sign-up/sign-in CTAs first, then the owner-mode unlock form, no profile
  // editing for someone else's account.
  if (!isOwner) {
    return (
      <div className="p-6 lg:p-8 max-w-lg mx-auto space-y-8 animate-fade-in">
        <h1 className="text-3xl font-bold">Make it yours</h1>

        <section className="relative overflow-hidden bg-gradient-to-br from-accent/20 via-purple-500/10 to-pink-500/10 border border-accent/30 rounded-2xl p-6 space-y-4">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
          <div className="relative space-y-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-accent" />
              Create your own EchoNest
            </h2>
            <p className="text-sm text-muted-foreground">
              You&apos;re using the shared public library right now. Sign up for a
              free account and you get your own playlists, your own uploads,
              your own YouTube imports — none of it mixes with anyone else&apos;s.
            </p>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleGoToAuth('/signup')}
              className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-full hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
            >
              <span className="inline-flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Sign up — free
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleGoToAuth('/login')}
              className="px-5 py-2.5 bg-card border border-border text-sm font-medium rounded-full hover:bg-card-hover transition-colors"
            >
              I already have an account
            </button>
          </div>
        </section>

        <BackgroundModeToggle enabled={bgEnabled} onToggle={toggleBg} />
        <AutoplayToggle enabled={autoplayEnabled} onToggle={toggleAutoplay} />
        <YouTubeImportPanel />

        <section className="space-y-3 pt-2">
          <h2 className="text-base font-semibold text-muted-foreground">About</h2>
          {/* Discreet owner-unlock — hidden until tapped, so public visitors
              don't see a password prompt. Owner knows to click it. */}
          {!showOwnerForm ? (
            <button
              type="button"
              onClick={() => setShowOwnerForm(true)}
              className="text-[10px] text-muted hover:text-muted-foreground transition-colors"
            >
              ·
            </button>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-2 bg-card border border-border rounded-xl p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3 h-3" /> Owner unlock
              </p>
              <Input
                type="password"
                placeholder="Owner password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                autoFocus
              />
              {ownerError && <p className="text-xs text-destructive">{ownerError}</p>}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={ownerLoading || !ownerPassword} variant="secondary">
                  <Unlock className="w-4 h-4" />
                  {ownerLoading ? 'Checking…' : 'Unlock'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setShowOwnerForm(false); setOwnerError(''); setOwnerPassword(''); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <Logo size="sm" />
            <div>
              <p className="text-sm font-medium">EchoNest v1.0</p>
              <p className="text-xs text-muted-foreground">
                Your personal music streaming app
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* Background mode toggle — controls YouTube player so iOS PiP works */}
      <BackgroundModeToggle enabled={bgEnabled} onToggle={toggleBg} />
      <AutoplayToggle enabled={autoplayEnabled} onToggle={toggleAutoplay} />
      <YouTubeImportPanel />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5 text-accent" />
          Profile
        </h2>
        <Input
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input label="Email" value={email} disabled />
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </Button>
        </div>
      </section>

      {/* Owner mode */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {isOwner ? (
            <Unlock className="w-5 h-5 text-success" />
          ) : (
            <Lock className="w-5 h-5 text-muted" />
          )}
          Owner mode
        </h2>

        {isOwner ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Owner mode is <span className="text-success font-medium">enabled</span>.
              Delete buttons are visible across the app.
            </p>
            <Button variant="secondary" onClick={lock}>
              <Lock className="w-4 h-4" />
              Disable owner mode
            </Button>
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the owner password to enable delete options across the app.
              Visitors will only be able to add and play music.
            </p>
            <Input
              type="password"
              placeholder="Owner password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
            />
            {ownerError && (
              <p className="text-sm text-destructive">{ownerError}</p>
            )}
            <Button type="submit" disabled={ownerLoading || !ownerPassword}>
              <Unlock className="w-4 h-4" />
              {ownerLoading ? 'Checking...' : 'Enable owner mode'}
            </Button>
          </form>
        )}
      </section>

      {/* Make your own account */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-accent" />
          Want your own library?
        </h2>
        <p className="text-sm text-muted-foreground">
          Sign up for a separate account where you control everything.
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/signup"
            className="px-4 py-2 bg-card border border-border text-sm rounded-full hover:bg-card-hover transition-colors"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">About</h2>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <Logo size="sm" />
          <div>
            <p className="text-sm font-medium">EchoNest v1.0</p>
            <p className="text-xs text-muted-foreground">
              Your personal music streaming app
            </p>
          </div>
        </div>
      </section>

      <section className="pt-4 border-t border-border">
        <Button variant="danger" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          Sign out
        </Button>
      </section>
    </div>
  );
}

function BackgroundModeToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-accent/20">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">Background play</h2>
          <p className="text-xs text-muted-foreground mt-1">
            YouTube tracks play as audio-only through the extractor so they
            keep playing on a locked iPhone, on AirPods, and when you switch
            apps. Trade-off: the video doesn&apos;t show — you see the cover
            art instead.
          </p>
        </div>
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={enabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            enabled ? 'bg-accent' : 'bg-card-hover'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
      <p className="text-[10px] text-muted">
        On other devices this just shows YouTube&apos;s native player controls in
        the mini-player.
      </p>
    </section>
  );
}

function AutoplayToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-pink-500/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">Autoplay similar songs</h2>
          <p className="text-xs text-muted-foreground mt-1">
            When you listen to a YouTube song and the queue is running short,
            pulls in 10 algorithmic picks from YouTube&apos;s &quot;Mix&quot;
            (the same engine that decides &quot;Up Next&quot; on youtube.com).
            Like Spotify&apos;s Smart Shuffle — you never run out of music.
          </p>
        </div>
        <button
          onClick={onToggle}
          role="switch"
          aria-checked={enabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            enabled ? 'bg-accent' : 'bg-card-hover'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
      <p className="text-[10px] text-muted">
        Needs the proxy running — same one used for background play.
      </p>
    </section>
  );
}
