'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { useMusicLanguages } from '@/store/musicLanguages';

const REGIONS = [
  { region: 'IN', label: 'India', gradient: 'from-orange-500 via-rose-500 to-red-600' },
  { region: 'US', label: 'United States', gradient: 'from-rose-500 via-pink-500 to-red-500' },
  { region: 'global', label: 'Global', gradient: 'from-violet-500 via-purple-500 to-fuchsia-600' },
];

const LANG_GRADIENTS = [
  'from-amber-500 via-orange-500 to-red-600',
  'from-sky-500 via-blue-500 to-indigo-600',
  'from-fuchsia-500 via-purple-500 to-violet-600',
  'from-emerald-500 via-teal-500 to-cyan-600',
  'from-rose-500 via-pink-500 to-fuchsia-600',
  'from-lime-500 via-green-500 to-emerald-600',
];

function ChartCard({ href, label, gradient }: { href: string; label: string; gradient: string }) {
  return (
    <Link href={href} className="group min-w-0">
      <div
        className={`relative aspect-square rounded-2xl bg-gradient-to-br ${gradient} p-4 flex flex-col justify-between overflow-hidden shadow-lg group-hover:scale-[1.03] transition-transform`}
      >
        <div className="flex items-center gap-1.5 text-white">
          <Play className="w-3.5 h-3.5 fill-current" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Daily</span>
        </div>
        <div className="text-white">
          <p className="text-4xl sm:text-5xl font-black leading-none">TOP</p>
          <p className="text-5xl sm:text-6xl font-black leading-none">50</p>
        </div>
        <p className="text-xs font-bold text-white/95 uppercase tracking-wider truncate">{label}</p>
        <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/10 blur-2xl" />
      </div>
      <p className="text-sm font-semibold mt-2 truncate">Top 50 · {label}</p>
      <p className="text-xs text-muted-foreground">Chart · YouTube</p>
    </Link>
  );
}

// Charts for Home + Explore: a row of "Top 50" cards by the user's selected
// languages, plus the regional/country charts.
export function ChartsRow() {
  const languages = useMusicLanguages((s) => s.languages);
  const hydrate = useMusicLanguages((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <div className="space-y-6">
      {languages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-2xl font-bold">Top charts by language</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3 sm:gap-4">
            {languages.map((lang, i) => (
              <ChartCard
                key={lang}
                href={`/charts/lang/${encodeURIComponent(lang)}`}
                label={lang}
                gradient={LANG_GRADIENTS[i % LANG_GRADIENTS.length]}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Charts by country</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3 sm:gap-4">
          {REGIONS.map((c) => (
            <ChartCard key={c.region} href={`/charts/${c.region}`} label={c.label} gradient={c.gradient} />
          ))}
        </div>
      </section>
    </div>
  );
}
