'use client';

/**
 * "Refer friends" share card on the Settings page.
 *
 * One-tap share buttons for the platforms that have public deep-link
 * share endpoints (WhatsApp, Twitter/X, LinkedIn, Facebook, Telegram,
 * Reddit, email). Instagram doesn't expose a share URL, so we offer
 * "Copy link" instead. Native Web Share API ("More") is shown when
 * the browser supports it — that's the path on iOS that surfaces all
 * the user's installed messaging apps including Instagram DMs.
 *
 * Every link shared from here triggers an Open Graph card preview on
 * the receiving platform (see /og-image.png in src/app/og-image.png/).
 */

import { useState } from 'react';
import { Share2, Copy, Check, MessageCircle, Send, Mail } from 'lucide-react';

// lucide-react dropped many brand glyphs (Twitter, Facebook, LinkedIn,
// Instagram, etc.) because of trademark concerns. We re-add them as
// inline SVGs — sized to match the other w-5 h-5 lucide icons used here.

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.025-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

const SITE_URL = 'https://echonest-app.vercel.app';
const INVITE_TEXT =
  'I\'ve been using EchoNest — a free personal music app that imports your YouTube library and plays everything on your phone (even in the background on iPhone). Check it out:';

const SHARE_TARGETS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    color: 'bg-emerald-500 hover:bg-emerald-600',
    href: (text: string, url: string) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: 'twitter',
    label: 'X',
    icon: XIcon,
    color: 'bg-neutral-900 hover:bg-neutral-800 border border-neutral-700',
    href: (text: string, url: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: LinkedinIcon,
    color: 'bg-[#0a66c2] hover:bg-[#004182]',
    href: (_text: string, url: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: FacebookIcon,
    color: 'bg-[#1877f2] hover:bg-[#0c5cc9]',
    href: (_text: string, url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: Send,
    color: 'bg-sky-500 hover:bg-sky-600',
    href: (text: string, url: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    color: 'bg-card-hover hover:bg-card border border-border text-foreground',
    href: (text: string, url: string) =>
      `mailto:?subject=${encodeURIComponent('Check out EchoNest')}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  },
];

export function ShareInvitePanel() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${INVITE_TEXT} ${SITE_URL}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers — fall back to a hidden text input
      const ta = document.createElement('textarea');
      ta.value = `${INVITE_TEXT} ${SITE_URL}`;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {}
      document.body.removeChild(ta);
    }
  };

  const handleInstagram = async () => {
    // Instagram has no public share-by-URL endpoint, so we copy + open
    // their app. iOS opens the Instagram app if installed; Android too.
    await handleCopy();
    // Best-effort deep link — opens the app if installed, no-ops otherwise
    window.location.href = 'instagram://';
  };

  const handleNativeShare = async () => {
    if (typeof navigator === 'undefined' || !navigator.share) return;
    try {
      await navigator.share({
        title: 'EchoNest',
        text: INVITE_TEXT,
        url: SITE_URL,
      });
    } catch {
      // user cancelled — no-op
    }
  };

  const supportsNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="bg-gradient-to-br from-accent/15 via-pink-500/10 to-orange-500/10 border border-accent/30 rounded-2xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-pink-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-accent/20">
          <Share2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">Refer friends &amp; family</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Send them a link. They get a free music library that plays in the
            background on their phone — no signup required.
          </p>
        </div>
      </div>

      {/* Copy link row */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
        <span className="text-xs text-muted-foreground flex-1 truncate font-mono">
          {SITE_URL}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-semibold rounded-full hover:bg-accent-hover transition-colors flex-shrink-0"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" /> Copy
            </>
          )}
        </button>
      </div>

      {/* Share targets */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {supportsNativeShare && (
          <button
            onClick={handleNativeShare}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity text-xs font-medium"
          >
            <Share2 className="w-5 h-5" />
            More
          </button>
        )}
        {SHARE_TARGETS.map((t) => (
          <a
            key={t.id}
            href={t.href(INVITE_TEXT, SITE_URL)}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-white transition-colors text-xs font-medium ${t.color}`}
          >
            <t.icon className="w-5 h-5" />
            {t.label}
          </a>
        ))}
        <button
          onClick={handleInstagram}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-white transition-colors text-xs font-medium bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 hover:opacity-90"
        >
          <InstagramIcon className="w-5 h-5" />
          Instagram
        </button>
      </div>

      <p className="text-[10px] text-muted">
        Links open a preview card on every messaging app with the EchoNest
        logo + tagline. Instagram opens after copying the link.
      </p>
    </section>
  );
}
