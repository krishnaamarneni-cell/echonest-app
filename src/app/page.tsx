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
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LandingPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session);
    });
  }, []);

  const enterApp = async () => {
    if (entering) return;
    setEntering(true);
    if (signedIn) {
      router.push('/dashboard');
      return;
    }
    // Try the public-account auto-signin
    try {
      const res = await fetch('/api/public-session', { method: 'POST' });
      if (res.ok) {
        // Reload as /dashboard so cookies apply
        window.location.href = '/dashboard';
        return;
      }
    } catch {}
    // No public account configured → send to signup
    router.push('/signup');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 lg:px-12">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <div className="flex items-center gap-3">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="px-5 py-2 text-sm bg-accent text-white rounded-full hover:bg-accent-hover transition-colors"
            >
              Open library
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="px-5 py-2 text-sm bg-accent text-white rounded-full hover:bg-accent-hover transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-12 lg:py-20 text-center max-w-3xl mx-auto animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-muted text-accent text-sm font-medium mb-6">
            <Music className="w-4 h-4" />
            A music library — the way you want it
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
            Listen.{' '}
            <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              Add. Play.
            </span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mt-6">
            A shared music library that opens with one click. Click the button
            below — you&apos;re instantly inside the library, no email, no
            password, no signup. Start playing in 3 seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <button
              onClick={enterApp}
              disabled={entering || signedIn === null}
              className="px-8 py-3 bg-accent text-white rounded-full text-sm font-semibold hover:bg-accent-hover transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 inline-flex items-center gap-2 shadow-lg shadow-accent/30"
            >
              {entering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Opening library…
                </>
              ) : signedIn ? (
                <>
                  <Headphones className="w-4 h-4" />
                  Open library
                </>
              ) : (
                <>
                  <Headphones className="w-4 h-4" />
                  Start listening — no login
                </>
              )}
            </button>
            {!signedIn && (
              <Link
                href="/signup"
                className="px-8 py-3 border border-border text-foreground rounded-full text-sm font-medium hover:bg-card transition-colors"
              >
                Make your own private library
              </Link>
            )}
          </div>

          <p className="text-xs text-muted mt-4">
            ✨ Click and you&apos;re in. We sign you in to the shared library
            automatically.
          </p>
        </section>

        {/* How it works */}
        <section className="px-6 py-12 lg:py-16 bg-card/30 border-y border-border">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
              How it works
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-12 max-w-xl mx-auto">
              Three steps. No setup, no app store, just open and listen.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  num: 1,
                  icon: Headphones,
                  title: 'Open and listen',
                  desc: 'Click "Start listening" — you\'re in. Browse the library, hit play, swipe between songs.',
                },
                {
                  num: 2,
                  icon: Link2,
                  title: 'Add anything',
                  desc: 'Paste a YouTube video or playlist URL. We pull every track\'s title and cover, then save them as individual songs in the library.',
                },
                {
                  num: 3,
                  icon: ListMusic,
                  title: 'Build your vibe',
                  desc: 'Like songs, create playlists, queue up your favorites. The library plays through every playlist back-to-back.',
                },
              ].map((step) => (
                <div
                  key={step.num}
                  className="p-6 rounded-2xl bg-card border border-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
                      <step.icon className="w-5 h-5 text-accent" />
                    </div>
                    <span className="text-3xl font-bold text-muted/30">
                      {step.num}
                    </span>
                  </div>
                  <h3 className="font-semibold text-base">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-12 lg:py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
              What you can do
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { icon: Link2, title: 'YouTube', desc: 'Paste links, listen instantly' },
                { icon: Upload, title: 'Upload', desc: 'Add your own MP3/WAV files' },
                { icon: ListMusic, title: 'Playlists', desc: 'Organize by mood or vibe' },
                { icon: Heart, title: 'Like songs', desc: 'Save favorites in one tap' },
                { icon: Search, title: 'Search', desc: 'Find any song instantly' },
                { icon: Sparkles, title: 'Auto-queue', desc: 'Plays through everything' },
                { icon: Headphones, title: 'Lock screen', desc: 'Controls on your phone' },
                { icon: Music, title: 'Clean UI', desc: 'Premium design, dark mode' },
              ].map((f) => (
                <div
                  key={f.title}
                  className="p-4 rounded-xl bg-card border border-border space-y-2"
                >
                  <div className="w-9 h-9 rounded-lg bg-accent-muted flex items-center justify-center">
                    <f.icon className="w-4 h-4 text-accent" />
                  </div>
                  <h3 className="font-semibold text-sm">{f.title}</h3>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Two ways to use */}
        <section className="px-6 py-12 lg:py-16 bg-card/30 border-y border-border">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
              Two ways to use EchoNest
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-10">
              Pick whichever fits.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-card border border-border space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-muted text-accent text-xs font-medium">
                  Quick
                </div>
                <h3 className="font-semibold text-lg">Just listen</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Click <strong>Start listening</strong>. You&apos;re using
                  the shared library. You can add YouTube links and play
                  anything. No signup, no password — open the URL on any
                  device and you&apos;re in.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card-hover text-foreground text-xs font-medium border border-border">
                  Private
                </div>
                <h3 className="font-semibold text-lg">Make your own library</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Sign up with an email to get a separate, private library.
                  Your playlists, your uploads, your liked songs — only you
                  can see and edit them.
                </p>
                <Link
                  href="/signup"
                  className="inline-block text-sm text-accent hover:underline pt-1"
                >
                  Sign up →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* What it doesn't do */}
        <section className="px-6 py-12 lg:py-16">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-center mb-6">
              A couple honest notes
            </h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="text-accent flex-shrink-0">·</span>
                <span>
                  YouTube embeds play through YouTube&apos;s official iframe.
                  We don&apos;t download or rehost their videos. Some music
                  videos block embedding — you&apos;ll see &quot;open on
                  YouTube&quot; for those.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-accent flex-shrink-0">·</span>
                <span>
                  Background play (screen off) works for uploaded files. For
                  YouTube embeds, only Brave browser or YouTube Premium gets
                  background — that&apos;s YouTube&apos;s policy, not ours.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-accent flex-shrink-0">·</span>
                <span>
                  Install as a phone app: open this site → tap your
                  browser&apos;s share button → &quot;Add to Home Screen&quot;.
                  You get a real app icon and lock-screen controls.
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-12 lg:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to listen?
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
            One click and the shared library opens. No email, no password.
          </p>
          <button
            onClick={enterApp}
            disabled={entering || signedIn === null}
            className="px-10 py-4 bg-accent text-white rounded-full text-base font-semibold hover:bg-accent-hover transition-all hover:scale-105 active:scale-95 disabled:opacity-60 inline-flex items-center gap-2 shadow-lg shadow-accent/30"
          >
            {entering ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Opening library…
              </>
            ) : (
              <>
                <Headphones className="w-5 h-5" />
                {signedIn ? 'Open library' : 'Start listening — no login'}
              </>
            )}
          </button>
        </section>
      </main>

      <footer className="py-6 px-6 text-center border-t border-border">
        <p className="text-xs text-muted">
          &copy; {new Date().getFullYear()} EchoNest · Built for music lovers
        </p>
      </footer>
    </div>
  );
}
