// Shown by the service worker when the user navigates while offline AND the
// requested page isn't in cache yet. We point them at the Downloads tab,
// which is the only place that's guaranteed to work without internet
// (IndexedDB-backed song blobs).

import Link from 'next/link';
import { CloudOff, Download } from 'lucide-react';

export const metadata = {
  title: 'Offline — EchoNest',
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple-600 shadow-lg shadow-accent/30">
        <CloudOff className="h-8 w-8 text-white" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">You&apos;re offline</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Live search, charts and YouTube playback need the internet. But your
        downloaded songs are still here — open Downloads to play them.
      </p>
      <Link
        href="/downloads"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        <Download className="h-4 w-4" />
        Open Downloads
      </Link>
      <p className="mt-8 text-xs text-muted">
        EchoNest will reconnect automatically once you&apos;re back online.
      </p>
    </div>
  );
}
