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
import {
  Share2,
  Copy,
  Check,
  MessageCircle,
  Linkedin,
  Facebook,
  Send,
  Mail,
  Instagram,
} from 'lucide-react';

// lucide-react dropped its `Twitter` glyph after the rebrand to X.
// Inline the new X mark as a tiny SVG so we don't depend on a removed
// export. Sized to match the other w-5 h-5 lucide icons used here.
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
    icon: Linkedin,
    color: 'bg-[#0a66c2] hover:bg-[#004182]',
    href: (_text: string, url: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    icon: Facebook,
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
          <Instagram className="w-5 h-5" />
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
