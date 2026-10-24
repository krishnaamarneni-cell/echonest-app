'use client';

/**
 * Cover art that asks YouTube for its best thumbnail and quietly falls back.
 *
 * hqdefault (480x360) is all most of our song rows carry, which is fine at
 * list size but visibly soft blown up to the player's ~400pt square on a
 * retina screen. maxresdefault is 1280x720 — except YouTube only generates
 * it when the source video is big enough, so it 404s often and can't just
 * be used blindly. This tries the big one and swaps back on error, keyed by
 * URL so changing track re-tries rather than inheriting the last failure.
 */

import { useState } from 'react';
import Image from 'next/image';
import { hiResCover } from '@/lib/coverFor';

export function CoverArt({
  src,
  alt,
  width,
  height,
  className,
  priority,
  draggable,
  sizes,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  draggable?: boolean;
  sizes?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hi = hiResCover(src);
  const effective = hi && failedSrc !== hi ? hi : src;
  const fill = width === undefined && height === undefined;

  return (
    <Image
      key={effective}
      src={effective}
      alt={alt}
      {...(fill ? { fill: true, sizes: sizes || '400px' } : { width, height })}
      className={className}
      priority={priority}
      draggable={draggable}
      onError={() => {
        // Only meaningful for the hi-res attempt; if the original fails too
        // there's nothing better to try and the alt text stands in.
        if (effective !== src) setFailedSrc(effective);
      }}
    />
  );
}
