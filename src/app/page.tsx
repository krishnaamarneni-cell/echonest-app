import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { Music, Upload, ListMusic, Search } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 lg:px-12">
        <Logo size="md" />
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="animate-fade-in space-y-6 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-muted text-accent text-sm font-medium mb-4">
            <Music className="w-4 h-4" />
            Your music. Your rules.
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
            Your personal
            <br />
            <span className="bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              music sanctuary
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Upload your collection, create playlists, and stream your music
            anywhere with a premium listening experience.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Link
              href="/signup"
              className="px-8 py-3 bg-accent text-white rounded-full text-sm font-medium hover:bg-accent-hover transition-all hover:scale-105 active:scale-95"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="px-8 py-3 border border-border text-foreground rounded-full text-sm font-medium hover:bg-card transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 max-w-3xl w-full animate-fade-in">
          {[
            { icon: Upload, title: 'Upload', desc: 'Upload your own audio files' },
            { icon: ListMusic, title: 'Organize', desc: 'Create unlimited playlists' },
            { icon: Search, title: 'Discover', desc: 'Import from YouTube playlists' },
          ].map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-2xl bg-card border border-border text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center mx-auto">
                <f.icon className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted">
        &copy; {new Date().getFullYear()} EchoNest. Your music, your way.
      </footer>
    </div>
  );
}
