'use client';

import { useSleepTimer } from '@/store/sleepTimer';
import { Menu } from './Menu';
import { Moon, Check } from 'lucide-react';

const PRESETS = [5, 10, 15, 30, 45, 60, 90];

function formatRemaining(seconds: number): string {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `0:${seconds.toString().padStart(2, '0')}`;
}

export function SleepTimerMenu() {
  const remaining = useSleepTimer((s) => s.remaining);
  const endOfTrack = useSleepTimer((s) => s.endOfTrack);
  const start = useSleepTimer((s) => s.start);
  const cancel = useSleepTimer((s) => s.cancel);
  const setEndOfTrack = useSleepTimer((s) => s.setEndOfTrack);

  const active = remaining !== null || endOfTrack;
  const label = endOfTrack
    ? 'End of track'
    : remaining !== null
    ? formatRemaining(remaining)
    : null;

  return (
    <Menu
      align="right"
      trigger={
        <button
          aria-label="Sleep timer"
          title={
            endOfTrack
              ? 'Sleep timer: stops at end of current song'
              : remaining !== null
              ? `Sleep timer: ${formatRemaining(remaining)} remaining`
              : 'Sleep timer'
          }
          className={`relative px-2 py-1 rounded-md text-xs font-bold tabular-nums transition-colors inline-flex items-center gap-1.5 ${
            active
              ? 'bg-accent text-white'
              : 'text-muted-foreground hover:text-foreground border border-border'
          }`}
        >
          <Moon className="w-3.5 h-3.5" />
          {label}
        </button>
      }
      items={[
        ...PRESETS.map((m) => ({
          label: `${m} minute${m === 1 ? '' : 's'}`,
          icon: remaining !== null && Math.round(remaining / 60) === m ? Check : undefined,
          onClick: () => start(m),
        })),
        {
          label: 'End of current track',
          icon: endOfTrack ? Check : undefined,
          onClick: () => setEndOfTrack(!endOfTrack),
        },
        ...(active
          ? [
              {
                label: 'Cancel timer',
                onClick: cancel,
                variant: 'danger' as const,
              },
            ]
          : []),
      ]}
    />
  );
}
