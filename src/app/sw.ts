/// <reference lib="webworker" />
// EchoNest service worker — compiled by Serwist at build time to public/sw.js.
// What this gives us:
//   - The whole app shell (HTML/JS/CSS/icons) is cached on first online visit
//     so subsequent opens work with NO internet.
//   - Navigations use a network-first strategy with offline fallback to
//     /offline so the user always gets something instead of Safari's
//     "can't open this website" error.
//   - Static assets are cache-first (instant after first load).
//   - Downloaded songs already live in IndexedDB via offline-storage.ts —
//     this SW just makes sure the *app* loads so the user can play them.
//
// Caveat: a service worker can ONLY install after one successful online
// visit. Web browsers have no way to bootstrap from zero internet. For
// true offline-from-first-launch we'd need a native wrapper (Capacitor).

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The audio stream must reach the network untouched.
 *
 * `defaultCache` ends with a catch-all for cross-origin requests on a
 * NetworkFirst strategy, and the extractor's /audio/<id> endpoint is
 * cross-origin — so the worker was sitting in front of the one request
 * that cannot tolerate it. <audio> streams by RANGE request: the proxy
 * forwards Range and answers 206 precisely so Safari can seek. The Cache
 * API cannot store a 206, and NetworkFirst's timeout drops a slow cold
 * resolve (3-5s of yt-dlp) onto an empty cache.
 *
 * Installed as a home-screen app this is the normal path, which is why
 * playback could behave differently there than in a browser tab with no
 * worker registered. Media goes straight to the network, always.
 */
const streamStraightToNetwork = {
  matcher: ({ url, request }: { url: URL; request: Request }) =>
    request.destination === "audio" ||
    request.destination === "video" ||
    /\/audio\/[A-Za-z0-9_-]{11}/.test(url.pathname),
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Ordered: the media rule has to win before defaultCache's cross-origin
  // catch-all gets a chance to claim the request.
  runtimeCaching: [streamStraightToNetwork, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
