'use client';

/**
 * Listening stats — the user's "wrapped"-style recap built from the
 * recently_played table we've been logging into all along.
 *
 * Five sections:
 *   1. Headline numbers: total plays, unique songs, unique artists,
 *      approximate listening time (sum of durations).
 *   2. Top songs (top 20 by play count).
 *   3. Top artists (top 20 by play count).
 *   4. Daily activity heatmap for the last 90 days.
 *   5. Period selector: All time / Last 30 days / Last 7 days.
 *
 * Everything is computed client-side from a single Supabase query so
 * we don't need new server endpoints. The recently_played table
 * already joins to songs via FK; we pull both in one go.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';
import { usePlayerStore } from '@/store/player';
import {
  Clock,
  Play,
  Disc,
  Mic2,
  Calendar,
  Music,
  TrendingUp,
  Loader2,
} from 'lucide-react';

interface PlayEvent {
  played_at: string;
  song: Song | null;
}

type Period = 'all' | '30d' | '7d';

function startCutoff(period: Period): Date | null {
  if (period === 'all') return null;
  const ms = period === '7d' ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  return new Date(Date.now() - ms);
}

function formatHours(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function StatsPage() {
  const [plays, setPlays] = useState<PlayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      setLoading(true);
      // Pull last 5000 plays joined with songs. Five thousand is enough
      // for years of personal listening but still a single fast request.
      const { data } = await supabase
        .from('recently_played')
        .select('played_at, song:songs(*)')
        .order('played_at', { ascending: false })
        .limit(5000);
      if (data) {
        setPlays(
          data.map((r: Record<string, unknown>) => ({
            played_at: r.played_at as string,
            song: r.song as Song | null,
          })),
        );
      }
      setLoading(false);
    })();
  }, []);

  // Filter to current period
  const filtered = useMemo(() => {
    const cutoff = startCutoff(period);
    if (!cutoff) return plays;
    return plays.filter((p) => new Date(p.played_at) >= cutoff);
  }, [plays, period]);

  // Aggregate top songs
  const topSongs = useMemo(() => {
    const counts = new Map<string, { song: Song; count: number }>();
    for (const ev of filtered) {
      if (!ev.song) continue;
      const existing = counts.get(ev.song.id);
      if (existing) {
        existing.count++;
      } else {
        counts.set(ev.song.id, { song: ev.song, count: 1 });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [filtered]);

  // Aggregate top artists
  const topArtists = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; cover: string | null }>();
    for (const ev of filtered) {
      if (!ev.song) continue;
      const name = ev.song.artist_name || 'Unknown';
      const key = name.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
        if (!existing.cover && ev.song.cover_url) existing.cover = ev.song.cover_url;
      } else {
        counts.set(key, { name, count: 1, cover: ev.song.cover_url || null });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [filtered]);

  // Headline stats
  const totals = useMemo(() => {
    const uniqueSongs = new Set<string>();
    const uniqueArtists = new Set<string>();
    let totalSeconds = 0;
    for (const ev of filtered) {
      if (!ev.song) continue;
      uniqueSongs.add(ev.song.id);
      if (ev.song.artist_name) uniqueArtists.add(ev.song.artist_name.toLowerCase());
      if (ev.song.duration > 0) totalSeconds += ev.song.duration;
    }
    return {
      plays: filtered.length,
      uniqueSongs: uniqueSongs.size,
      uniqueArtists: uniqueArtists.size,
      totalSeconds,
    };
  }, [filtered]);

  // 90-day activity heatmap (always over the last 90 calendar days
  // regardless of selected period — heatmap shows context)
  const heatmap = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    const byDay = new Map<string, number>();
    for (const ev of plays) {
      const d = new Date(ev.played_at);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: byDay.get(key) || 0 });
    }
    return days;
  }, [plays]);

  const heatmapMax = useMemo(
    () => heatmap.reduce((m, d) => Math.max(m, d.count), 1),
    [heatmap],
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Listening stats</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Built from the plays we&apos;ve logged for your account.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { id: 'all', label: 'All time' },
          { id: '30d', label: 'Last 30 days' },
          { id: '7d', label: 'Last 7 days' },
        ] as { id: Period; label: string }[]).map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              period === p.id
                ? 'bg-accent text-white'
                : 'bg-card text-muted-foreground hover:text-foreground hover:bg-card-hover'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading your listening history…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Music className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">No plays in this period</p>
          <p className="text-xs text-muted-foreground">
            Play some songs and come back — every play gets logged here.
          </p>
        </div>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={Play}
              label="Total plays"
              value={totals.plays.toLocaleString()}
            />
            <StatCard
              icon={Music}
              label="Unique songs"
              value={totals.uniqueSongs.toLocaleString()}
            />
            <StatCard
              icon={Mic2}
              label="Unique artists"
              value={totals.uniqueArtists.toLocaleString()}
            />
            <StatCard
              icon={Clock}
              label="Listening time"
              value={formatHours(totals.totalSeconds)}
            />
          </div>

          {/* Activity heatmap */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" />
              Last 90 days
            </h2>
            <div className="flex gap-[2px] flex-wrap">
              {heatmap.map((d) => {
                const intensity = d.count === 0 ? 0 : Math.min(1, d.count / heatmapMax);
                const opacity = intensity === 0 ? 0.08 : 0.2 + intensity * 0.8;
                return (
                  <div
                    key={d.date}
                    className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-sm bg-accent"
                    style={{ opacity }}
                    title={`${d.date}: ${d.count} play${d.count === 1 ? '' : 's'}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted">
              <span>Less</span>
              {[0.1, 0.3, 0.5, 0.7, 1].map((o) => (
                <div
                  key={o}
                  className="w-3 h-3 rounded-sm bg-accent"
                  style={{ opacity: o === 0.1 ? 0.08 : o }}
                />
              ))}
              <span>More</span>
            </div>
          </section>

          {/* Top songs */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              Top songs ({topSongs.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {topSongs.map((row, idx) => (
                <button
                  key={row.song.id}
                  onClick={() =>
                    play(
                      row.song,
                      topSongs.map((r) => r.song),
                      'library',
                    )
                  }
                  className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-card-hover text-left transition-colors"
                >
                  <span className="text-sm text-muted-foreground tabular-nums w-7 text-right flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="relative w-10 h-10 rounded-md overflow-hidden bg-card flex-shrink-0">
                    {row.song.cover_url ? (
                      <Image
                        src={row.song.cover_url}
                        alt={row.song.title}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4 text-muted" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.song.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.song.artist_name}
                    </p>
                  </div>
                  <span className="text-xs text-muted tabular-nums flex-shrink-0">
                    {row.count} play{row.count === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Top artists */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Disc className="w-4 h-4 text-accent" />
              Top artists ({topArtists.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {topArtists.map((row, idx) => (
                <div
                  key={row.name}
                  className="flex items-center gap-3 px-2 py-1.5"
                >
                  <span className="text-sm text-muted-foreground tabular-nums w-7 text-right flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-card flex-shrink-0">
                    {row.cover ? (
                      <Image
                        src={row.cover}
                        alt={row.name}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Mic2 className="w-4 h-4 text-muted" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                  </div>
                  <span className="text-xs text-muted tabular-nums flex-shrink-0">
                    {row.count} play{row.count === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            <Link href="/recent" className="hover:text-foreground transition-colors">
              See full recently played →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
