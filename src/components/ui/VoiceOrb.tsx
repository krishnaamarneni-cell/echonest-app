'use client';

/**
 * EchoNest's voice orb.
 *
 * Drawn rather than drawn-over: vector, so it is crisp at any size, themed
 * from the app's own accent colour, and able to react — the core is a live
 * equaliser that moves while the mic is open, which is the clearest way to
 * show "I am listening" without a word of text.
 *
 * The motif is an echo: a bright core with rings travelling outward from
 * it. That is the app's own idea rather than a borrowed one, and it reads
 * at 24px in the panel header as well as at 64px on the bubble.
 *
 * Ids are suffixed with useId because this renders more than once per page
 * and SVG gradient ids are document-global — duplicates would silently
 * resolve to whichever came first.
 */

import { useId } from 'react';

interface VoiceOrbProps {
  size?: number;
  /** Mic is open: ripples travel and the equaliser dances. */
  active?: boolean;
  /** Working: the core holds steady at a mid level. */
  busy?: boolean;
  className?: string;
}

/** Idle bar heights, centred — a frozen waveform rather than a flat line. */
const BARS = [
  { cx: 25.5, h: 9 },
  { cx: 29.8, h: 16 },
  { cx: 34.2, h: 12.5 },
  { cx: 38.5, h: 7 },
];

export function VoiceOrb({ size = 64, active = false, busy = false, className = '' }: VoiceOrbProps) {
  const uid = useId().replace(/:/g, '');
  const body = `orb-body-${uid}`;
  const glow = `orb-glow-${uid}`;
  const rim = `orb-rim-${uid}`;
  const sheen = `orb-sheen-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Off-centre so the sphere lights from the upper left and falls
            away to a deep indigo — that one offset is what makes a flat
            circle read as a ball. */}
        <radialGradient id={body} cx="34%" cy="27%" r="80%">
          <stop offset="0%" stopColor="#ddd6fe" />
          <stop offset="34%" stopColor="#a78bfa" />
          <stop offset="72%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2e1065" />
        </radialGradient>

        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="48%" stopColor="#8b5cf6" stopOpacity="0.5" />
          <stop offset="76%" stopColor="#7c3aed" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>

        {/* Rim light along the lower right, opposite the key light. */}
        <linearGradient id={rim} x1="15%" y1="5%" x2="85%" y2="95%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="62%" stopColor="#c4b5fd" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
        </linearGradient>

        <linearGradient id={sheen} x1="0%" y1="0%" x2="40%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="31" fill={`url(#${glow})`} />

      {/* Echo rings. Always present so the silhouette does not jump when
          the mic opens; they only travel while listening. */}
      {/* Idle, the rings sit OUT from the body at 25.5 and 29 — at the
          animation's own radius of 23 they land flush against the sphere's
          edge and disappear into the rim light, which loses the echo
          entirely. Travelling, 23 is right: the ring starts hidden inside
          the sphere and emerges from it. */}
      <g fill="none" stroke="#a78bfa" strokeWidth="1.4">
        <circle
          cx="32"
          cy="32"
          r={active ? 23 : 25.5}
          opacity={active ? undefined : 0.3}
          className={active ? 'orb-ripple' : ''}
        />
        <circle
          cx="32"
          cy="32"
          r={active ? 23 : 29}
          opacity={active ? undefined : 0.15}
          className={active ? 'orb-ripple orb-ripple-late' : ''}
        />
      </g>

      <g className={active ? '' : 'orb-breathe'}>
        <circle cx="32" cy="32" r="21" fill={`url(#${body})`} />
        <circle cx="32" cy="32" r="20.4" fill="none" stroke={`url(#${rim})`} strokeWidth="1.3" />
        {/* Specular highlight, tilted to follow the sphere's curve. */}
        <ellipse
          cx="25"
          cy="22.5"
          rx="8.5"
          ry="5.2"
          fill={`url(#${sheen})`}
          transform="rotate(-28 25 22.5)"
        />

        <g>
          {BARS.map((b, i) => (
            <rect
              key={b.cx}
              x={b.cx - 1.25}
              y={32 - b.h / 2}
              width="2.5"
              height={b.h}
              rx="1.25"
              fill="#ffffff"
              opacity={busy && !active ? 0.6 : 0.92}
              className={active ? 'orb-bar orb-bar-live' : 'orb-bar'}
              // Staggered so the bars chase each other rather than pumping
              // in unison, which looks mechanical.
              style={active ? { animationDelay: `${i * 0.13}s` } : undefined}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
