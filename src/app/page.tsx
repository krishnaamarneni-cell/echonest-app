'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import {
  Music,
  Upload,
  ListMusic,
  Search,
  Link2,
  Heart,
  Headphones,
  Sparkles,
  Loader2,
  Play,
  Mic,
  Disc,
  ArrowRight,
  Smartphone,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LandingPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [entering, setEntering] = useState(false);
  const [enterError, setEnterError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session);
    });
  }, []);

  const enterApp = async () => {
    if (entering) return;
    setEntering(true);
    setEnterError(null);
    if (signedIn) {
      router.push('/dashboard');
      return;
    }
    try {
      const res = await fetch('/api/public-session', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/dashboard';
        return;
      }
      // Surface the real reason rather than silently dumping users on /signup.
      const data = await res.json().catch(() => null);
      setEnterError(
        data?.error ||
          `Couldn't open the shared library (${res.status}). Try Sign up to make your own.`,
      );
    } catch {
      setEnterError('Network error. Please try again.');
    }
    setEntering(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* === HEADER === */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="md" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {signedIn ? (
              <>
                <Link
                  href="/signup"
                  className="hidden sm:block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  title="Create a separate private library"
                >
                  Sign up
                </Link>
                <Link
                  href="/dashboard"
                  className="px-4 sm:px-5 py-2 text-sm font-semibold bg-foreground text-background rounded-full hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  Open library
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden sm:block px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="px-4 sm:px-5 py-2 text-sm font-semibold bg-foreground text-background rounded-full hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* === HERO === */}
      <section className="relative overflow-hidden pt-12 sm:pt-20 pb-16 sm:pb-32">
        {/* Decorative gradient blobs */}
        <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] rounded-full bg-accent/30 blur-[120px] pointer-events-none" />
        <div className="absolute top-1/4 -right-32 w-[400px] h-[400px] rounded-full bg-pink-500/20 blur-[120px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-foreground/5 border border-border backdrop-blur-sm mb-8 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-medium tracking-wide">Free • No signup needed</span>
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] mb-6 animate-fade-in">
            Music meets{' '}
            <span className="bg-gradient-to-br from-accent via-pink-400 to-orange-400 bg-clip-text text-transparent">
              clarity
            </span>
            <br />
            in one click.
          </h1>

          <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10 animate-fade-in">
            A shared music library that opens instantly. Drop in a YouTube link
            or an audio file — every song, podcast, playlist, and album lives
            in one place.{' '}
            <span className="text-foreground font-medium">No account. No setup. Just play.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6 animate-fade-in">
            <button
              onClick={enterApp}
              disabled={entering || signedIn === null}
              className="group relative overflow-hidden px-8 py-4 bg-foreground text-background rounded-full text-base font-bold hover:scale-[1.03] active:scale-[0.98] transition-transform disabled:opacity-60 inline-flex items-center gap-2 shadow-2xl shadow-foreground/20"
            >
              {entering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Opening…
                </>
              ) : signedIn ? (
                <>
                  <Headphones className="w-5 h-5" />
                  Open library
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Start listening
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
            {!signedIn && (
              <Link
                href="/signup"
                className="px-6 py-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                or make your own library →
              </Link>
            )}
          </div>

          <p className="text-xs text-muted">
            ✨ Click and you&apos;re in. Instant access to the shared library.
          </p>

          {enterError && (
            <div className="mt-4 mx-auto max-w-md bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl px-4 py-3 animate-fade-in">
              {enterError}
            </div>
          )}

          {/* Mock player visualization */}
          <div className="mt-16 sm:mt-24 max-w-4xl mx-auto animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-pink-500/10 to-orange-500/10 blur-3xl" />
              <div className="relative bg-card/80 backdrop-blur-xl border border-border rounded-3xl p-4 sm:p-6 shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-accent via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-2xl">
                    <Music className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Now Playing
                    </p>
                    <p className="text-lg sm:text-2xl font-bold truncate">Your favorite track</p>
                    <p className="text-sm text-muted-foreground truncate">EchoNest Library</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1 bg-foreground/10 rounded-full flex-1 overflow-hidden">
                        <div className="h-full w-2/5 bg-foreground rounded-full" />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted">1:23</span>
                    </div>
                  </div>
                  <button className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-foreground text-background flex items-center justify-center flex-shrink-0 shadow-lg hover:scale-105 transition-transform">
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === HOW IT WORKS === */}
      <section className="relative py-16 sm:py-24 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold mb-3">
              How it works
            </p>
            <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
              Three steps. No setup.
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
              Built so anyone can listen — your kid, your dad, you. No tutorials needed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {[
              {
                num: '01',
                icon: Headphones,
                title: 'Open & listen',
                desc: "Tap 'Start listening' on the landing page. You're inside the shared library in 2 seconds.",
                gradient: 'from-accent/20 to-pink-500/20',
              },
              {
                num: '02',
                icon: Link2,
                title: 'Paste & save',
                desc: 'Drop in a YouTube video or playlist URL. Every track lands in your library with its title and cover.',
                gradient: 'from-orange-500/20 to-pink-500/20',
              },
              {
                num: '03',
                icon: Sparkles,
                title: 'Play & explore',
                desc: 'Like songs, build playlists, queue up favorites. The library plays through everything seamlessly.',
                gradient: 'from-cyan-500/20 to-blue-500/20',
              },
            ].map((step, i) => (
              <div
                key={step.num}
                className={`relative group bg-gradient-to-br ${step.gradient} border border-border rounded-3xl p-6 sm:p-8 overflow-hidden hover:scale-[1.02] transition-transform duration-300`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-foreground/5 blur-2xl" />
                <div className="relative">
                  <span className="block text-5xl sm:text-6xl font-bold text-foreground/10 mb-4 tracking-tighter">
                    {step.num}
                  </span>
                  <div className="w-12 h-12 rounded-2xl bg-foreground/10 backdrop-blur-sm flex items-center justify-center mb-4">
                    <step.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === FEATURE SHOWCASE === */}
      <section className="relative py-16 sm:py-24 border-t border-border/40 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-accent/5 blur-[150px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold mb-3">
              Everything you need
            </p>
            <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
              Built for music lovers.
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
              Not just a player — a complete listening experience.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { icon: Link2, title: 'YouTube import', color: 'from-red-500/20 to-rose-500/20' },
              { icon: Upload, title: 'Upload audio', color: 'from-purple-500/20 to-pink-500/20' },
              { icon: ListMusic, title: 'Playlists', color: 'from-blue-500/20 to-cyan-500/20' },
              { icon: Heart, title: 'Like songs', color: 'from-pink-500/20 to-red-500/20' },
              { icon: Search, title: 'Smart search', color: 'from-amber-500/20 to-orange-500/20' },
              { icon: Mic, title: 'Podcasts', color: 'from-amber-500/20 to-yellow-500/20' },
              { icon: Disc, title: 'Albums & artists', color: 'from-emerald-500/20 to-teal-500/20' },
              { icon: Sparkles, title: 'Auto-queue', color: 'from-violet-500/20 to-purple-500/20' },
              { icon: Headphones, title: 'Lock screen', color: 'from-cyan-500/20 to-blue-500/20' },
              { icon: Smartphone, title: 'Install as PWA', color: 'from-rose-500/20 to-pink-500/20' },
              { icon: Music, title: 'Speed control', color: 'from-fuchsia-500/20 to-pink-500/20' },
              { icon: Sparkles, title: 'Auto-sync', color: 'from-indigo-500/20 to-purple-500/20' },
            ].map((f) => (
              <div
                key={f.title}
                className={`group bg-gradient-to-br ${f.color} border border-border rounded-2xl p-4 hover:scale-[1.03] hover:border-foreground/20 transition-all duration-200`}
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/10 backdrop-blur-sm flex items-center justify-center mb-3">
                  <f.icon className="w-5 h-5 text-foreground" />
                </div>
                <p className="text-sm font-semibold">{f.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === TWO WAYS === */}
      <section className="relative py-16 sm:py-24 border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-xs uppercase tracking-[0.2em] text-accent font-semibold mb-3">
              Your choice
            </p>
            <h2 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
              Two ways in.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="relative group p-8 rounded-3xl bg-gradient-to-br from-accent/20 via-pink-500/10 to-orange-500/10 border-2 border-accent/30 overflow-hidden">
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-accent text-white text-xs font-bold uppercase tracking-wider">
                Quick
              </div>
              <Headphones className="w-10 h-10 text-foreground mb-4" />
              <h3 className="text-2xl font-bold mb-3">Just listen</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                One click. No email, no password. You join the shared library
                with everyone else and can play anything, add new tracks, and
                make playlists.
              </p>
              <button
                onClick={enterApp}
                disabled={entering || signedIn === null}
                className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-full text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {entering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                Start now
              </button>
            </div>

            <div className="relative group p-8 rounded-3xl bg-card border border-border overflow-hidden">
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-card-hover border border-border text-xs font-bold uppercase tracking-wider">
                Private
              </div>
              <Music className="w-10 h-10 text-foreground mb-4" />
              <h3 className="text-2xl font-bold mb-3">Make your own</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Sign up with an email and get a separate, private library.
                Your playlists, your uploads, your liked songs — only you see them.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 bg-card-hover border border-border text-foreground rounded-full text-sm font-bold hover:bg-card transition-colors"
              >
                Create account
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* === HONEST NOTES === */}
      <section className="relative py-16 sm:py-20 border-t border-border/40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-3 text-center">
            Honest notes
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8 text-center">
            What to know.
          </h2>
          <div className="space-y-4">
            {[
              {
                title: 'YouTube tracks stream from YouTube',
                desc: "We don't download or rehost their videos. Some music videos block embedding — you'll get an 'open on YouTube' link for those.",
              },
              {
                title: 'Background play works for your uploads',
                desc: "Uploaded songs play in the background and on your lock screen. For YouTube embeds, that's a YouTube policy — only YouTube Premium or Brave browser get full background.",
              },
              {
                title: 'Install it like an app',
                desc: 'Open this site on your phone → browser share button → "Add to Home Screen". You get a real app icon and lock-screen controls.',
              },
            ].map((note) => (
              <div
                key={note.title}
                className="p-5 sm:p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border"
              >
                <h4 className="font-bold text-base mb-1.5">{note.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{note.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* === FINAL CTA === */}
      <section className="relative py-20 sm:py-32 border-t border-border/40 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/30 blur-[120px] pointer-events-none" />
          <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-pink-500/20 blur-[100px] pointer-events-none" />
          <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-orange-500/20 blur-[100px] pointer-events-none" />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] mb-6">
            Press play.
          </h2>
          <p className="text-base sm:text-xl text-muted-foreground max-w-xl mx-auto mb-10">
            No signup. No payment. Just music — the way you want it.
          </p>
          <button
            onClick={enterApp}
            disabled={entering || signedIn === null}
            className="group relative overflow-hidden px-10 py-5 bg-foreground text-background rounded-full text-base sm:text-lg font-bold hover:scale-[1.05] active:scale-[0.98] transition-transform disabled:opacity-60 inline-flex items-center gap-3 shadow-2xl shadow-accent/30"
          >
            {entering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Opening…
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                {signedIn ? 'Open library' : 'Start listening — free'}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="border-t border-border/40 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <span>
              &copy; {new Date().getFullYear()} EchoNest · Built for music lovers
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
