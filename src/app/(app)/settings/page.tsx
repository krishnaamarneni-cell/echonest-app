'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User, LogOut, Save, Smartphone, Sparkles } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useOwnerMode } from '@/store/ownerMode';
import { useBackgroundMode } from '@/store/backgroundMode';
import { useAutoplay } from '@/store/autoplay';
import { YouTubeImportPanel } from '@/components/ui/YouTubeImportPanel';
import { ShareInvitePanel } from '@/components/ui/ShareInvitePanel';
import { AccountDangerZone } from '@/components/ui/AccountDangerZone';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Hydrate owner mode from localStorage so any code that depends on
  // `isOwner` (delete buttons across the app) sees the correct state.
  // The flag itself is set by AppLayout based on the signed-in email,
  // not by any UI on this page — admin is auto-detected, not unlocked.
  const hydrateOwner = useOwnerMode((s) => s.hydrate);
  const { enabled: bgEnabled, hydrate: hydrateBg, toggle: toggleBg } = useBackgroundMode();
  const { enabled: autoplayEnabled, hydrate: hydrateAutoplay, toggle: toggleAutoplay } = useAutoplay();
  useEffect(() => { hydrateBg(); }, [hydrateBg]);
  useEffect(() => { hydrateAutoplay(); }, [hydrateAutoplay]);
  useEffect(() => { hydrateOwner(); }, [hydrateOwner]);

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

  return (
    <div className="p-6 lg:p-8 max-w-lg mx-auto space-y-8 animate-fade-in">
      <h1 className="text-3xl font-bold">Settings</h1>

      <BackgroundModeToggle enabled={bgEnabled} onToggle={toggleBg} />
      <AutoplayToggle enabled={autoplayEnabled} onToggle={toggleAutoplay} />
      <YouTubeImportPanel />
      <ShareInvitePanel />

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

      <AccountDangerZone />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">About</h2>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <Logo size="sm" />
          <div>
            <p className="text-sm font-medium">EchoNest v1.0</p>
            <p className="text-xs text-muted-foreground">
              A shared library anyone can add to. Sign up for your own at
              any time.
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
