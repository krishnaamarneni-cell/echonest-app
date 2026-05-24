'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { User, LogOut, Save, Smartphone, Sparkles, LogIn, UserPlus } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useBackgroundMode } from '@/store/backgroundMode';
import { useAutoplay } from '@/store/autoplay';
import { useMusicLanguages, ALL_LANGUAGES } from '@/store/musicLanguages';
import { useCrossDeviceSync } from '@/store/crossDeviceSync';
import { Smartphone as DevicesIcon } from 'lucide-react';
import { YouTubeImportPanel } from '@/components/ui/YouTubeImportPanel';
import { ShareInvitePanel } from '@/components/ui/ShareInvitePanel';
import { AccountDangerZone } from '@/components/ui/AccountDangerZone';
import { isPublicAccountEmail } from '@/lib/publicAccount';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { enabled: bgEnabled, hydrate: hydrateBg, toggle: toggleBg } = useBackgroundMode();
  const { enabled: autoplayEnabled, hydrate: hydrateAutoplay, toggle: toggleAutoplay } = useAutoplay();
  const musicLanguages = useMusicLanguages((s) => s.languages);
  const hydrateLanguages = useMusicLanguages((s) => s.hydrate);
  const toggleLanguage = useMusicLanguages((s) => s.toggle);
  const syncEnabled = useCrossDeviceSync((s) => s.enabled);
  const hydrateSync = useCrossDeviceSync((s) => s.hydrate);
  const toggleSync = useCrossDeviceSync((s) => s.toggle);
  useEffect(() => { hydrateBg(); }, [hydrateBg]);
  useEffect(() => { hydrateAutoplay(); }, [hydrateAutoplay]);
  useEffect(() => { hydrateLanguages(); }, [hydrateLanguages]);
  useEffect(() => { hydrateSync(); }, [hydrateSync]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email || '');
        setIsPublic(isPublicAccountEmail(user.email));
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

      <section className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
            <DevicesIcon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">Sync across devices</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Keep the same song &amp; position on every device signed in here.
              Pause on your phone, open your laptop, and pick up right where you
              left off. Turn this on for each device you want kept in sync.
            </p>
          </div>
          <button
            onClick={toggleSync}
            role="switch"
            aria-checked={syncEnabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              syncEnabled ? 'bg-accent' : 'bg-card-hover'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                syncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      <section className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold">Music languages</h2>
        <p className="text-xs text-muted-foreground">
          Pick the languages you listen to. Home shows a &quot;Latest&quot; row
          of fresh songs for each. We start with a guess from your listening —
          adjust any time.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {ALL_LANGUAGES.map((lang) => {
            const on = musicLanguages.includes(lang);
            return (
              <button
                key={lang}
                onClick={() => toggleLanguage(lang)}
                aria-pressed={on}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  on
                    ? 'bg-accent text-white border-accent'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-card-hover'
                }`}
              >
                {lang}
              </button>
            );
          })}
        </div>
      </section>

      <YouTubeImportPanel />
      <ShareInvitePanel />

      {isPublic ? (
        // Shared public account: don't expose a personal profile, email, or
        // account-deletion. Offer Sign in / Sign up instead.
        <section className="space-y-4">
          <div className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <User className="w-5 h-5 text-accent" />
              Your account
            </h2>
            <p className="text-xs text-muted-foreground">
              You&apos;re browsing the shared public library. Sign in or create
              an account to get your own.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href="/login?manual=1"
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-full text-sm font-semibold hover:bg-accent-hover transition-colors"
              >
                <LogIn className="w-4 h-4" /> Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-full text-sm font-medium hover:bg-card-hover transition-colors"
              >
                <UserPlus className="w-4 h-4" /> Sign up
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
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
        </>
      )}

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

      {!isPublic && (
        <section className="pt-4 border-t border-border">
          <Button variant="danger" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </section>
      )}
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
