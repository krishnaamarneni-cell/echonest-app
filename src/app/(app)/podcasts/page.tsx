'use client';

/**
 * Podcasts — discovery.
 *
 * Before this, the podcast sections only ever showed episodes you'd already
 * imported, with no way to find any, so a new account saw an empty shelf
 * and no next step. This is the browse layer: a featured row plus search
 * over every channel on YouTube.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mic, Search as SearchIcon, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { PodcastChannel, formatSubscribers } from '@/lib/podcasts';

export default function PodcastsPage() {
  const [featured, setFeatured] = useState<PodcastChannel[]>([]);
  const [results, setResults] = useState<PodcastChannel[] | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/podcasts/channels')
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (cancelled) return;
        if (r.ok && Array.isArray(body?.channels)) {
          setFeatured(body.channels);
          setError(null);
        } else {
          setError(body?.error || `Couldn't load podcasts (${r.status})`);
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/podcasts/channels?q=${encodeURIComponent(q)}`);
      const body = await r.json().catch(() => null);
      setResults(r.ok && Array.isArray(body?.channels) ? body.channels : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults(null);
  };

  const shown = results ?? featured;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Podcasts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse shows and open any one for its latest episodes.
        </p>
      </div>

      <form onSubmit={runSearch} className="relative max-w-xl">
        <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search podcasts — try Joe Rogan, Huberman, Ranveer…"
          className="w-full rounded-full border border-white/10 bg-card py-3 pl-11 pr-11 text-sm outline-none focus:border-accent"
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      <h2 className="text-xl font-bold">
        {results ? `Results for "${query}"` : 'Top podcasts'}
      </h2>

      {loading || searching ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error && !results ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 sm:gap-4">
          {shown.map((c) => (
            <Link key={c.channelId} href={`/podcasts/${encodeURIComponent(c.handle)}`} className="group">
              <div className="relative aspect-square overflow-hidden rounded-full bg-card shadow-lg transition-transform group-hover:scale-[1.03]">
                {c.thumbnail ? (
                  <Image
                    src={c.thumbnail}
                    alt={c.title}
                    fill
                    sizes="200px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Mic className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-sm font-semibold">{c.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatSubscribers(c.subscriberCount)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Mic}
          title={results ? 'No podcasts found' : 'No podcasts available'}
          description={
            results
              ? 'Try a different name — searching looks across every channel on YouTube.'
              : "Couldn't reach YouTube for the featured list."
          }
        />
      )}
    </div>
  );
}
