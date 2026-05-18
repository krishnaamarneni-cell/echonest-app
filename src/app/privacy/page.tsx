import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export const metadata = {
  title: 'Privacy Policy · EchoNest',
  description:
    'What data EchoNest collects, how it is stored, and how it is used.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="md" />
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated: May 17, 2026
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">The short version</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest is a personal music player. We only collect what we need
            to play your music: your sign-in info, the songs you save, and the
            playlists you create. We don&apos;t sell your data, we don&apos;t
            run ads, and we don&apos;t share anything with anyone else.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">What we collect</h2>

          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              <strong>Account info.</strong> When you sign up — whether with
              email and password or by signing in with Google — we store your
              email address, display name, and (if you used Google) your
              avatar URL. This is the bare minimum we need to attach songs and
              playlists to &quot;you.&quot;
            </p>

            <p>
              <strong>Music library data.</strong> Songs you upload, playlists
              you create, songs you like, and recently played history.
              Stored in our Supabase database, scoped to your account by
              row-level-security so other users can&apos;t see it.
            </p>

            <p>
              <strong>YouTube account data (only if you connect it).</strong>{' '}
              If you click &quot;Connect YouTube &amp; Import,&quot; EchoNest
              reads — with the <code>youtube.readonly</code> scope you grant
              on Google&apos;s consent screen:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>
                The playlists you&apos;ve created on YouTube, plus the videos
                inside each
              </li>
              <li>Your Liked Videos</li>
            </ul>
            <p>
              These get copied into EchoNest&apos;s database as playlists +
              song references. We don&apos;t store the video files themselves
              — only the YouTube video IDs, titles, channel names, and
              thumbnails. We do <em>not</em> access your YouTube watch
              history, recommendations, comments, channel uploads, or any
              data you didn&apos;t explicitly add to a playlist or like.
              Google doesn&apos;t expose those even if we asked.
            </p>

            <p>
              <strong>OAuth tokens.</strong> To sync new playlist additions
              automatically in the background, we store the Google access
              token + refresh token for your YouTube connection in our
              <code> user_youtube_tokens </code>
              database table, encrypted at rest by Supabase. You can disconnect
              and wipe these tokens any time from Settings → Import from
              YouTube → Disconnect.
            </p>

            <p>
              <strong>Downloaded songs.</strong> When you tap
              &quot;Download to device,&quot; the audio file is stored
              <em> on your device </em> using IndexedDB — nothing about the
              download leaves your browser. We don&apos;t know what you
              downloaded.
            </p>

            <p>
              <strong>Technical logs.</strong> Vercel (our host) keeps
              short-lived access logs for crash diagnosis. These contain IP
              addresses and request paths and are auto-deleted by Vercel on a
              rolling basis.
            </p>
          </div>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">How we use it</h2>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>To play music to you — that&apos;s the whole point.</li>
            <li>
              To keep your library in sync with YouTube when you ask us to
              (background sync, max once per day).
            </li>
            <li>
              To fix bugs (technical logs, retained briefly by our hosting
              provider).
            </li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We don&apos;t run advertising, we don&apos;t sell or share data
            with third parties, we don&apos;t analyze your listening habits to
            build a profile, and we don&apos;t train AI on anything you
            upload.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Who can see your data</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Only you. Supabase row-level security means each user&apos;s rows
            are filtered server-side by the auth token of the request — even
            with our database password, we&apos;d have to take an explicit
            administrative action to read a specific account&apos;s data, and
            we don&apos;t do that.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong>Exception:</strong> EchoNest has a feature called the
            &quot;public library&quot; — an opt-in shared account anyone can
            log into without signing up. Anything saved on that account is
            visible to anyone using that account. If you want a private
            library, sign up with email or Google.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Where it lives</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Our infrastructure providers:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>
              <strong>Supabase</strong> (US-East region) — database, auth, file
              storage for uploaded audio
            </li>
            <li>
              <strong>Vercel</strong> — web hosting and edge functions
            </li>
            <li>
              <strong>Google YouTube Data API</strong> — accessed on your
              behalf when you import your YouTube library
            </li>
            <li>
              <strong>Cloudflare</strong> — used for an audio extraction proxy
              for YouTube streaming; doesn&apos;t see your account data, only
              the YouTube video ID being played
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Your rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can, at any time:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>
              Download your data — every song, playlist, and like is yours.
              Email us and we&apos;ll send you a JSON export.
            </li>
            <li>
              Disconnect your YouTube account — Settings → Import from
              YouTube → Disconnect. This deletes the stored tokens.
            </li>
            <li>
              Delete your account entirely — email us at the address below.
              All your data including OAuth tokens, uploads, playlists, and
              listening history will be hard-deleted from our database within
              30 days.
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Cookies</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest uses cookies only for authentication — i.e. to remember
            that you are signed in. No third-party tracking or advertising
            cookies. No analytics scripts.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Children</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest is not directed at children under 13. If you believe a
            child has signed up, email us and we&apos;ll delete the account.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Changes to this policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            If we change anything material, we&apos;ll update the
            &quot;Last updated&quot; date at the top of this page. Significant
            changes will also be surfaced inside the app the next time you
            sign in.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Questions, data requests, or account deletion:{' '}
            <a
              href="mailto:avgk26@gmail.com"
              className="text-accent hover:underline"
            >
              avgk26@gmail.com
            </a>
          </p>
        </section>

        <div className="mt-16 pt-8 border-t border-border/40 flex items-center justify-between text-sm">
          <Link
            href="/terms"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Terms of Service →
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to EchoNest
          </Link>
        </div>
      </main>
    </div>
  );
}
