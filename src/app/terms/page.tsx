import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export const metadata = {
  title: 'Terms of Service · EchoNest',
  description: 'The terms you agree to when you use EchoNest.',
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated: May 17, 2026
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">The short version</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest is a free, personal-use music player. By using it you
            agree to: don&apos;t upload anything you don&apos;t have the right
            to, don&apos;t try to break the service for other users, and
            understand that we provide it as-is with no warranty.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">1. What EchoNest is</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest is a personal music library app. It lets you upload your
            own audio files, save YouTube videos for playback, build
            playlists, and import your existing YouTube library if you choose
            to connect your Google account. It&apos;s built and operated by
            an individual hobbyist, not a company.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The service is provided free of charge and is meant for personal,
            non-commercial use only.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">2. Your account</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You&apos;re responsible for keeping your account credentials safe.
            If you signed in with Google, your account is tied to that Google
            identity — losing access to the Google account means losing
            access to your EchoNest library.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can delete your account any time by emailing the contact
            address at the bottom of this page.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">3. Content rules</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When you upload audio files to EchoNest, you confirm that you own
            them or have the right to upload them (e.g. tracks you produced,
            podcasts you licensed, files you legally purchased). Don&apos;t
            upload:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>Copyrighted material you don&apos;t have rights to distribute</li>
            <li>Anything illegal, harmful, or that violates someone&apos;s privacy</li>
            <li>Malware or non-audio files disguised as audio</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may remove uploaded content we believe violates these rules,
            with or without notice, and may terminate accounts that
            repeatedly do so.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">4. YouTube content</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest plays YouTube videos via YouTube&apos;s own embed and
            audio APIs. We don&apos;t store or rehost the videos themselves
            — only the video IDs and metadata. Playback of YouTube content
            is subject to{' '}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              YouTube&apos;s Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Google&apos;s Privacy Policy
            </a>
            .
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When you connect your Google account to import your YouTube
            library, you&apos;re also agreeing to Google&apos;s API Services
            User Data Policy as it applies to EchoNest&apos;s use of your
            data.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">5. What you can&apos;t do</h2>
          <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <li>
              Don&apos;t try to break, abuse, or overload the service (e.g.
              scripting bulk requests, scraping, denial-of-service)
            </li>
            <li>
              Don&apos;t use EchoNest for any commercial purpose — no
              reselling access, no embedding in a paid product
            </li>
            <li>
              Don&apos;t bypass authentication or try to access other
              users&apos; data
            </li>
            <li>
              Don&apos;t use it to distribute illegal content or to harass
              anyone
            </li>
          </ul>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">6. As-is, no warranty</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            EchoNest is provided &quot;as is&quot; without any warranty,
            express or implied. The service can break, go offline, lose data,
            change features, or shut down entirely with no notice. Don&apos;t
            store anything in EchoNest that you can&apos;t afford to lose —
            keep your own backups of audio files you upload.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To the maximum extent permitted by applicable law, the operator
            of EchoNest is not liable for any direct, indirect, incidental,
            consequential, or special damages arising from your use of (or
            inability to use) the service.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">7. Termination</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You can stop using EchoNest at any time. We may suspend or
            terminate your access if you violate these terms, if continuing
            to provide the service becomes impractical, or for any other
            reason at our discretion.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">8. Changes</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update these terms over time. Significant changes will be
            surfaced in the app the next time you sign in. Continuing to use
            the service after a change means you accept the updated terms.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">9. Contact</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Questions, complaints, or account deletion:{' '}
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
            href="/privacy"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Privacy Policy
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to EchoNest →
          </Link>
        </div>
      </main>
    </div>
  );
}
