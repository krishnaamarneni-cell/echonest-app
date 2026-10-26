'use client';

/**
 * Someone else's public profile: their playlists and what they like.
 *
 * Read-only by construction, not by convention — the RLS policies grant
 * SELECT and nothing more, so there is no write path to guard here. An
 * unknown username and a private user produce the identical "not found",
 * so this page can't be used to discover who has an account.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Heart, ListMusic, Play, UserX } from 'lucide-react';
import { MediaCard } from '@/components/ui/MediaCard';
import { SongRow } from '@/components/ui/SongRow';
import { SongRowSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { usePlayerStore } from '@/store/player';
import { getPublicProfile } from '@/lib/profile';
import { Song } from '@/types';

type Loaded = Awaited<ReturnType<typeof getPublicProfile>>;

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const play = usePlayerStore((s) => s.play);

  const [data, setData] = useState<Loaded>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Derived rather than stored: we're loading until the fetch for THIS
  // username has settled, so navigating between profiles shows a skeleton
  // again with no state to reset.
  const loading = loadedFor !== username;

  useEffect(() => {
    let cancelled = false;
    getPublicProfile(username)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadedFor(username);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const name = data?.profile.display_name || `@${data?.profile.username}`;
  const liked: Song[] = data?.liked || [];

  return (
    <div className="animate-fade-in">
      <div className="relative bg-gradient-to-b from-accent/20 to-background p-6 lg:p-8">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="mb-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {loading ? (
          <div className="h-32" />
        ) : !data ? null : (
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-card shadow-2xl sm:h-32 sm:w-32">
              {data.profile.avatar_url ? (
                <Image
                  src={data.profile.avatar_url}
                  alt={name}
                  fill
                  sizes="128px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/30 to-purple-600/30 text-3xl font-bold">
                  {name.replace('@', '').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Profile
              </p>
              <h1 className="mt-1 truncate text-3xl font-bold lg:text-4xl">{name}</h1>
              {data.profile.display_name && (
                <p className="text-sm text-muted-foreground">@{data.profile.username}</p>
              )}
              <p className="mt-2 text-sm text-muted">
                {data.playlists.length} playlists · {liked.length} liked
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8 p-6 lg:p-8">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        ) : !data ? (
          <EmptyState
            icon={UserX}
            title="Profile not found"
            description="Either nobody uses that username, or they keep their profile private."
          />
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-xl font-bold">Playlists</h2>
              {data.playlists.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {data.playlists.map((p) => (
                    <MediaCard
                      key={p.id}
                      title={p.title}
                      subtitle={p.description || 'Playlist'}
                      imageUrl={p.cover_url}
                      href={`/playlist/${p.id}`}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No public playlists.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Heart className="h-5 w-5 text-accent" />
                  Liked
                </h2>
                {liked.length > 0 && (
                  <Button onClick={() => play(liked[0], liked, 'library')}>
                    <Play className="h-4 w-4 fill-current" />
                    Play
                  </Button>
                )}
              </div>
              {liked.length > 0 ? (
                <div className="space-y-0.5">
                  {liked.map((song) => (
                    <SongRow key={song.id} song={song} songs={liked} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ListMusic}
                  title="Nothing liked yet"
                  description={`${name} hasn't liked anything public.`}
                />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
