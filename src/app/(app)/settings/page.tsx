'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  User,
  LogOut,
  Save,
  Smartphone,
  Sparkles,
  LogIn,
  UserPlus,
  Radio,
  Languages,
  MonitorSmartphone,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { useBackgroundMode } from '@/store/backgroundMode';
import { useAutoplay } from '@/store/autoplay';
import { useMusicLanguages, ALL_LANGUAGES } from '@/store/musicLanguages';
import { useCrossDeviceSync } from '@/store/crossDeviceSync';
import { useSyncMode } from '@/store/syncMode';
import { YouTubeImportPanel } from '@/components/ui/YouTubeImportPanel';
import { ShareInvitePanel } from '@/components/ui/ShareInvitePanel';
import { AccountDangerZone } from '@/components/ui/AccountDangerZone';
import { McpConnectorPanel } from '@/components/ui/McpConnectorPanel';
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
  const speakerSyncEnabled = useSyncMode((s) => s.enabled);
  const speakerNudgeMs = useSyncMode((s) => s.nudgeMs);
  const hydrateSpeakerSync = useSyncMode((s) => s.hydrate);
  const toggleSpeakerSync = useSyncMode((s) => s.toggle);
  const setSpeakerNudge = useSyncMode((s) => s.setNudge);
  useEffect(() => { hydrateBg(); }, [hydrateBg]);
  useEffect(() => { hydrateAutoplay(); }, [hydrateAutoplay]);
  useEffect(() => { hydrateLanguages(); }, [hydrateLanguages]);
  useEffect(() => { hydrateSync(); }, [hydrateSync]);
  useEffect(() => { hydrateSpeakerSync(); }, [hydrateSpeakerSync]);

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

  const initial = (displayName || email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card-hover">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Settings</h1>
          <p className="text-xs text-muted-foreground">Manage playback, sync and your account</p>
        </div>
      </div>

      {/* Profile hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent-muted p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
        {isPublic ? (
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple-600 shadow-lg shadow-accent/30">
                <User className="h-7 w-7 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">Shared public library</h2>
                <p className="text-xs text-muted-foreground">
                  Browsing as guest — sign in for your own space
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Link
                href="/login?manual=1"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <LogIn className="h-4 w-4" /> Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card-hover"
              >
                <UserPlus className="h-4 w-4" /> Sign up
              </Link>
            </div>
          </div>
        ) : (
          <div className="relative flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple-600 text-2xl font-bold text-white shadow-lg shadow-accent/30">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{displayName || 'Your account'}</h2>
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </section>

      {/* Playback */}
      <SettingsGroup label="Playback">
        <ToggleRow
          gradient="from-accent to-purple-600"
          icon={<Smartphone className="h-5 w-5 text-white" />}
          title="Background play"
          description={
            <>
              YouTube tracks play audio-only through the extractor so they keep
              playing on a locked iPhone, on AirPods, and when you switch apps.
              Trade-off: the video doesn&apos;t show — you see the cover art instead.
            </>
          }
          footnote="On other devices this just shows YouTube's native player controls in the mini-player."
          checked={bgEnabled}
          onToggle={toggleBg}
        />
        <ToggleRow
          gradient="from-pink-500 to-orange-500"
          icon={<Sparkles className="h-5 w-5 text-white" />}
          title="Autoplay similar songs"
          description={
            <>
              When the queue runs short, pulls in 10 algorithmic picks from
              YouTube&apos;s &quot;Mix&quot; (the same engine behind &quot;Up
              Next&quot;). Like Spotify&apos;s Smart Shuffle — you never run out.
            </>
          }
          footnote="Needs the proxy running — same one used for background play."
          checked={autoplayEnabled}
          onToggle={toggleAutoplay}
        />
      </SettingsGroup>

      {/* Sync & speakers */}
      <SettingsGroup label="Sync & speakers">
        <ToggleRow
          gradient="from-indigo-500 to-blue-600"
          icon={<MonitorSmartphone className="h-5 w-5 text-white" />}
          title="Sync across devices"
          description="Keep the same song & position on every device signed in here. Pause on your phone, open your laptop, pick up where you left off. Turn on per device."
          checked={syncEnabled}
          onToggle={toggleSync}
        />
        <ToggleRow
          gradient="from-fuchsia-500 to-purple-600"
          icon={<Radio className="h-5 w-5 text-white" />}
          title="Speaker sync (Listen Along)"
          description="In a Listen-Along room, play tightly in sync across devices like one speaker (host controls; others just play). Uses precise Web-Audio timing."
          checked={speakerSyncEnabled}
          onToggle={toggleSpeakerSync}
        >
          {speakerSyncEnabled && (
            <div className="px-4 pb-4 pl-[3.75rem]">
              <label className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Audio delay nudge (for Bluetooth)</span>
                <span className="tabular-nums text-foreground">
                  {speakerNudgeMs > 0 ? '+' : ''}
                  {speakerNudgeMs} ms
                </span>
              </label>
              <input
                type="range"
                min={-500}
                max={500}
                step={10}
                value={speakerNudgeMs}
                onChange={(e) => setSpeakerNudge(Number(e.target.value))}
                className="mt-2 h-1 w-full"
                style={{
                  background: `linear-gradient(to right, var(--accent) ${((speakerNudgeMs + 500) / 1000) * 100}%, #27272a ${((speakerNudgeMs + 500) / 1000) * 100}%)`,
                }}
              />
              <p className="mt-1 text-[10px] text-muted">
                If this device lags behind the others, slide right (plays earlier) to line it up.
              </p>
            </div>
          )}
        </ToggleRow>
      </SettingsGroup>

      {/* Content */}
      <SettingsGroup label="Content">
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Languages className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold">Music languages</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick the languages you listen to. Home shows a &quot;Latest&quot; row of
                fresh songs for each. We start from your listening — adjust any time.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-[3rem]">
            {ALL_LANGUAGES.map((lang) => {
              const on = musicLanguages.includes(lang);
              return (
                <button
                  key={lang}
                  onClick={() => toggleLanguage(lang)}
                  aria-pressed={on}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    on
                      ? 'border-accent bg-accent text-white'
                      : 'border-border bg-card text-muted-foreground hover:bg-card-hover hover:text-foreground'
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>
      </SettingsGroup>

      {/* Connections */}
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
          Connections &amp; sharing
        </h2>
        <YouTubeImportPanel />
        <ShareInvitePanel />
      </section>

      {/* AI / MCP — only for private accounts (per-user tokens) */}
      {!isPublic && <McpConnectorPanel />}

      {/* Account (private accounts only) */}
      {!isPublic && (
        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            Account
          </h2>
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-accent" />
              Profile
            </h3>
            <Input
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Input label="Email" value={email} disabled />
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
              </Button>
            </div>
          </div>
          <AccountDangerZone />
        </section>
      )}

      {/* About */}
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">About</h2>
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
          <Logo size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium">EchoNest v1.0</p>
            <p className="text-xs text-muted-foreground">
              A shared library anyone can add to. Sign up for your own at any time.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsGroup({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      {label && (
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </h2>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

function ToggleRow({
  icon,
  gradient,
  title,
  description,
  footnote,
  checked,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  gradient: string;
  title: string;
  description: React.ReactNode;
  footnote?: string;
  checked: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg ${gradient}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          {footnote && <p className="mt-1.5 text-[10px] text-muted">{footnote}</p>}
        </div>
        <Switch checked={checked} onChange={onToggle} label={title} />
      </div>
      {children}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-accent' : 'bg-card-hover'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
