'use client';

import Link from 'next/link';
import Image from 'next/image';

interface BrowseTileProps {
  title: string;
  href: string;
  imageUrl?: string | null;
  gradient: string; // tailwind gradient classes
}

/**
 * Spotify-style browse tile — colorful gradient background with a title in
 * the top-left and a tilted thumbnail in the bottom-right corner.
 */
export function BrowseTile({ title, href, imageUrl, gradient }: BrowseTileProps) {
  return (
    <Link
      href={href}
      className={`group relative aspect-[7/4] sm:aspect-square overflow-hidden rounded-xl ${gradient} hover:scale-[1.02] active:scale-[0.99] transition-transform`}
    >
      {/* Title — reserve right space for thumbnail when present so they
          never overlap on narrow screens. */}
      <h3
        className={`absolute top-3 left-3 text-base sm:text-lg font-bold text-white drop-shadow-lg z-10 line-clamp-2 leading-tight ${
          imageUrl ? 'right-[44%] sm:right-12' : 'right-3'
        }`}
      >
        {title}
      </h3>
      {imageUrl && (
        <div className="absolute bottom-2 right-2 sm:-bottom-2 sm:-right-3 w-16 h-16 sm:w-24 sm:h-24 rounded-md overflow-hidden shadow-2xl sm:rotate-[20deg] sm:origin-center sm:group-hover:rotate-[15deg] transition-transform">
          <Image
            src={imageUrl}
            alt=""
            width={96}
            height={96}
            className="w-full h-full object-cover"
          />
        </div>
      )}
    </Link>
  );
}

// Pre-defined gradient palette — cycled through based on tile index so the
// browse grid feels colorful but consistent.
export const browseGradients = [
  'bg-gradient-to-br from-pink-600 to-rose-800',
  'bg-gradient-to-br from-purple-600 to-indigo-800',
  'bg-gradient-to-br from-emerald-600 to-teal-800',
  'bg-gradient-to-br from-amber-600 to-orange-800',
  'bg-gradient-to-br from-cyan-600 to-blue-800',
  'bg-gradient-to-br from-fuchsia-600 to-purple-800',
  'bg-gradient-to-br from-red-600 to-rose-900',
  'bg-gradient-to-br from-yellow-600 to-amber-800',
  'bg-gradient-to-br from-blue-600 to-indigo-900',
  'bg-gradient-to-br from-green-600 to-emerald-800',
  'bg-gradient-to-br from-violet-600 to-purple-900',
  'bg-gradient-to-br from-sky-600 to-cyan-800',
];

export function pickGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return browseGradients[Math.abs(hash) % browseGradients.length];
}
