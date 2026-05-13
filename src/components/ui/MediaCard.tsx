'use client';

import { Play, Music } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface MediaCardProps {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  href: string;
  onPlay?: () => void;
  rounded?: boolean;
}

export function MediaCard({ title, subtitle, imageUrl, href, onPlay, rounded }: MediaCardProps) {
  return (
    <Link href={href} className="group block space-y-3">
      <div
        className={`relative aspect-square overflow-hidden bg-card ${
          rounded ? 'rounded-full' : 'rounded-xl'
        }`}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-card-hover">
            <Music className="w-12 h-12 text-muted" />
          </div>
        )}
        {onPlay && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 hover:bg-accent-hover hover:scale-105 active:scale-95"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        )}
      </div>
      <div className="px-1">
        <p className="font-medium text-sm truncate">
          {title?.trim() || (
            <span className="italic text-muted-foreground">Untitled</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
      </div>
    </Link>
  );
}
