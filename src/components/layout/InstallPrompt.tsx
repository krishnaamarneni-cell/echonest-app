'use client';

import { useEffect, useState } from 'react';
import { Download, X, Plus, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

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

  if (isStandalone) return null;
  if (!show && !showIosGuide) return null;

  return (
    <>
      {show && (
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
              <p className="text-xs text-muted-foreground mt-1">
                {isIOS
                  ? 'Get music in background + lock-screen controls.'
                  : 'Get the full experience — install as an app'}
              </p>
              {isIOS ? (
                <button
                  onClick={() => setShowIosGuide(true)}
                  className="mt-3 px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-full hover:bg-accent-hover transition-colors"
                >
                  Show me how
                </button>
              ) : (
                deferredPrompt && (
                  <button
                    onClick={handleInstall}
                    className="mt-3 px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-full hover:bg-accent-hover transition-colors"
                  >
                    Install
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* iOS guided install — opens after the user taps "Show me how" since
          Apple deliberately doesn't expose a programmatic install API. */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => {
                setShowIosGuide(false);
                setShow(false);
                localStorage.setItem('echonest-install-dismissed', '1');
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mb-6">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-purple-600 items-center justify-center mb-3">
                <Download className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold">Install EchoNest</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Add it to your Home Screen so it works like a real app
              </p>
            </div>
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  1
                </span>
                <div className="flex-1 text-sm">
                  Tap the{' '}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card-hover border border-border align-middle">
                    <Share className="w-3.5 h-3.5 text-accent" />
                    <span className="text-xs font-medium">Share</span>
                  </span>{' '}
                  button at the bottom of Safari
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  2
                </span>
                <div className="flex-1 text-sm">
                  Scroll down and tap{' '}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-card-hover border border-border align-middle">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">Add to Home Screen</span>
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  3
                </span>
                <div className="flex-1 text-sm">
                  Tap <span className="font-medium">Add</span> in the top right
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  ✓
                </span>
                <div className="flex-1 text-sm">
                  Find EchoNest on your Home Screen — open it from there
                </div>
              </li>
            </ol>
            <p className="text-[11px] text-muted-foreground mt-5 text-center">
              Apple doesn&apos;t let websites add themselves to your Home Screen
              — you have to do this step yourself. Sorry for the extra taps!
            </p>
            <button
              onClick={() => {
                setShowIosGuide(false);
                setShow(false);
                localStorage.setItem('echonest-install-dismissed', '1');
              }}
              className="w-full mt-5 px-4 py-3 bg-accent text-white text-sm font-semibold rounded-full hover:bg-accent-hover transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
