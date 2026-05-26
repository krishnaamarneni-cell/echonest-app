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
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
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
