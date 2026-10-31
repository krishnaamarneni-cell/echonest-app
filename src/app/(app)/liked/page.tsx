'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { SongRow } from '@/components/ui/SongRow';
import { SongCard } from '@/components/ui/SongCard';
import { SongRowSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { BulkDownloadButton } from '@/components/ui/BulkDownloadButton';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { Heart, Play, Shuffle, LayoutGrid, List, Share2 } from 'lucide-react';
import { ShareDialog } from '@/components/ui/ShareDialog';
import { SortMenu } from '@/components/ui/SortMenu';
import { sortSongs, SortKey } from '@/lib/songSort';
import { moveItem, persistLikedOrder, LikeRow } from '@/lib/reorder';

export default function LikedSongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('date_added_desc');
  const [shareOpen, setShareOpen] = useState(false);
  // The like rows behind `songs`, same order. Needed to write positions
  // back; the Song objects don't carry the like row's id.
  const [rows, setRows] = useState<LikeRow[]>([]);
  // Whether likes.position exists yet. Reordering is hidden until the
  // migration that adds it has been run, rather than offering arrows that
  // would silently fail.
  const [orderColumn, setOrderColumn] = useState(true);
  const play = usePlayerStore((s) => s.play);
  const likedIds = useLikesStore((s) => s.likedIds);

  // Persist sort choice
  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? (localStorage.getItem('echonest-liked-sort') as SortKey | null)
        : null;
    if (saved) setSortKey(saved);
  }, []);
  const setSortKeyPersisted = (k: SortKey) => {
    setSortKey(k);
    if (typeof window !== 'undefined') {
      localStorage.setItem('echonest-liked-sort', k);
    }
  };

  // Remember the user's preferred view across sessions.
  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? localStorage.getItem('echonest-liked-view')
        : null;
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);

  const setViewMode = (v: 'list' | 'grid') => {
    setView(v);
    if (typeof window !== 'undefined') {
      localStorage.setItem('echonest-liked-view', v);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    const COLUMNS = 'id, user_id, song_id, song:songs(*)';

    async function load() {
      // likes.position only exists once supabase-migration-liked-order.sql
      // has been run, and asking PostgREST to order by a column it doesn't
      // know is a 400 for the WHOLE query — not a column it quietly skips.
      // Swallowing that error is what made this page claim you had no
      // liked songs at all, so fall back to the pre-migration ordering
      // instead and just turn reordering off.
      //
      // nullsFirst: a like with no position yet belongs at the top, where
      // you'd look for something you just liked. created_at breaks ties so
      // the unplaced ones aren't in arbitrary order among themselves.
      const ordered = await supabase
        .from('likes')
        .select(COLUMNS)
        .order('position', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false });

      let data = ordered.data;
      if (ordered.error) {
        setOrderColumn(false);
        const fallback = await supabase
          .from('likes')
          .select(COLUMNS)
          .order('created_at', { ascending: false });
        data = fallback.data;
      }

      if (data) {
        const withSong = data.filter((d: Record<string, unknown>) => d.song);
        setSongs(withSong.map((d: Record<string, unknown>) => d.song as Song));
        setRows(
          withSong.map((d: Record<string, unknown>) => ({
            id: d.id as string,
            user_id: d.user_id as string,
            song_id: d.song_id as string,
          })),
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  // Reactively remove songs from the list when they're un-liked elsewhere,
  // then sort according to the user's choice.
  const visibleSongs = sortSongs(
    songs.filter((s) => likedIds.has(s.id)),
    sortKey,
  );

  // Available under ANY sort, not just "My order". Hiding the arrows
  // behind a mode nobody thinks to select is the same as not having
  // them — the first move simply adopts what you're looking at as your
  // order, which is what rearranging a sorted list means anyway.
  const canReorder = orderColumn;

  // Addressed by song id, not by index. `visibleSongs` is a FILTERED
  // view of `songs` — un-liking a song elsewhere drops it from the view
  // while it stays in state — so the two lists drift apart and a visible
  // index would move the wrong row. Swapping with the visible neighbour
  // also means a hidden row in between is stepped over correctly.
  const moveSong = async (songId: string, neighbourId: string) => {
    // Operates on the VISIBLE list, because that is the sequence being
    // rearranged. Under a sort it differs from the stored order, and
    // under any sort it excludes songs un-liked elsewhere whose like
    // rows no longer exist — so rebuilding from it also drops the stale
    // ones rather than writing positions for rows that are gone.
    const from = visibleSongs.findIndex((s) => s.id === songId);
    const to = visibleSongs.findIndex((s) => s.id === neighbourId);
    if (from < 0 || to < 0 || from === to) return;

    const nextSongs = moveItem(visibleSongs, from, to);
    const rowBySongId = new Map(rows.map((r) => [r.song_id, r]));
    const nextRows = nextSongs
      .map((song) => rowBySongId.get(song.id))
      .filter((r): r is LikeRow => !!r);

    const prevSongs = songs;
    const prevRows = rows;
    const prevSort = sortKey;

    setSongs(nextSongs);
    setRows(nextRows);
    // The arrangement you just made IS your order. Staying on, say,
    // "Title A→Z" would re-sort on the next render and snap the row
    // straight back, which reads as the move having failed.
    if (sortKey !== 'custom') setSortKeyPersisted('custom');

    if (!(await persistLikedOrder(nextRows))) {
      setSongs(prevSongs);
      setRows(prevRows);
      if (prevSort !== 'custom') setSortKeyPersisted(prevSort);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-b from-pink-900/30 to-background p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="w-48 h-48 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center flex-shrink-0 shadow-2xl">
            <Heart className="w-20 h-20 text-white fill-current" />
          </div>
          <div className="flex-1 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Playlist</p>
            <h1 className="text-3xl lg:text-5xl font-bold mt-1">Liked Songs</h1>
            <p className="text-sm text-muted mt-3">{visibleSongs.length} songs</p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <Button
                onClick={() => visibleSongs.length > 0 && play(visibleSongs[0], visibleSongs, 'library')}
                disabled={visibleSongs.length === 0}
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (visibleSongs.length > 0) {
                    const shuffled = [...visibleSongs].sort(() => Math.random() - 0.5);
                    play(shuffled[0], shuffled, 'library');
                  }
                }}
                disabled={visibleSongs.length === 0}
              >
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              <BulkDownloadButton songs={visibleSongs} />
              <Button
                variant="secondary"
                onClick={() => setShareOpen(true)}
                title="Let another EchoNest user follow what you like"
              >
                <Share2 className="w-4 h-4" /> Share
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-8 pt-4 space-y-4">
        {/* Picking "My order" with no position column would just show the
            default order and no arrows, with nothing explaining why. */}
        {!loading && !orderColumn && visibleSongs.length > 0 && (
          <p className="rounded-lg bg-card px-3 py-2 text-xs text-muted-foreground">
            Rearranging needs one more database change. Run
            <span className="font-mono"> supabase-migration-liked-order.sql</span> and
            reload.
          </p>
        )}
        {!loading && visibleSongs.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <SortMenu value={sortKey} onChange={setSortKeyPersisted} />
            <button
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
              className={`p-2 rounded-lg transition-colors ${
                view === 'list'
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              title="Grid view"
              className={`p-2 rounded-lg transition-colors ${
                view === 'grid'
                  ? 'bg-card text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => <SongRowSkeleton key={i} />)}
            </div>
          )
        ) : visibleSongs.length === 0 ? (
          <EmptyState icon={Heart} title="No liked songs yet" description="Tap the heart icon on any song to add it here" />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {visibleSongs.map((song) => (
              <SongCard
                key={song.id}
                song={song}
                songs={visibleSongs}
                onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {visibleSongs.map((song, i) => (
              <SongRow
                key={song.id}
                song={song}
                index={i}
                showIndex
                songs={visibleSongs}
                onDeleted={(id) => setSongs((prev) => prev.filter((s) => s.id !== id))}
                onMoveUp={
                  canReorder && i > 0
                    ? () => moveSong(song.id, visibleSongs[i - 1].id)
                    : undefined
                }
                onMoveDown={
                  canReorder && i < visibleSongs.length - 1
                    ? () => moveSong(song.id, visibleSongs[i + 1].id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        kind="likes"
        playlistId={null}
        title="Liked Songs"
      />
    </div>
  );
}
