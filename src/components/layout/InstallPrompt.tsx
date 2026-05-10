'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already installed
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS-specific
      window.navigator.standalone === true;
    setIsStandalone(standalone);

    if (standalone) return;

    // Detect iOS (no beforeinstallprompt support)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Check dismissal flag
    const dismissed = localStorage.getItem('echonest-install-dismissed');
    if (dismissed) return;

    // Android/Chrome path
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: show after 5 seconds
    if (ios) {
      const t = setTimeout(() => setShow(true), 5000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', handler);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  const dismiss = () => {
    setShow(false);
    localStorage.setItem('echonest-install-dismissed', '1');
  };

  if (isStandalone || !show) return null;

  return (
    <div className="fixed bottom-[calc(var(--bottom-nav-height)+16px)] lg:bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:max-w-sm z-30 bg-card border border-border rounded-2xl shadow-2xl p-4 animate-slide-up">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install EchoNest</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground mt-1">
              Tap <span className="font-medium">Share</span> ↗ in Safari, then{' '}
              <span className="font-medium">Add to Home Screen</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Get the full experience — install as an app
            </p>
          )}
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-3 px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-full hover:bg-accent-hover transition-colors"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
