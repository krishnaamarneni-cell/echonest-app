'use client';

import { useEffect } from 'react';

// Registers the Serwist-generated /sw.js once the page has loaded. The
// service worker handles app-shell caching so EchoNest opens & navigates
// with no internet after the first successful visit.
//
// Production-only — in dev next.config.ts disables Serwist so the SW
// doesn't shadow your hot-reload bundles.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // Non-fatal: if the SW can't register, the app still works online.
          // We just lose the offline-cache benefit.
          console.warn('[SW] registration failed', err);
        });
    };

    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
    }
  }, []);

  return null;
}
