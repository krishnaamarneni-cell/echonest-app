'use client';

import { useMemo, useState } from 'react';
import { Song } from '@/types';
import { useOfflineStore, isDownloadable } from '@/store/offline';
import { Button } from './Button';
import { Download, Loader2, Check } from 'lucide-react';

interface BulkDownloadButtonProps {
  songs: Song[];
  /** Optional label override — default is "Download all" */
  label?: string;
}

/**
 * One-click bulk download. Filters the list to YouTube songs eligible for
 * caching, skips ones already on device, and downloads the rest sequentially.
 * Shows live "X of Y" progress while running.
 */
export function BulkDownloadButton({ songs, label = 'Download all' }: BulkDownloadButtonProps) {
  const offlineIds = useOfflineStore((s) => s.ids);
  const inProgress = useOfflineStore((s) => s.inProgress);
  const downloadMany = useOfflineStore((s) => s.downloadMany);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null);

  const eligible = useMemo(() => songs.filter(isDownloadable), [songs]);
  const remaining = eligible.filter((s) => !offlineIds.has(s.id));
  const isAllDownloaded = eligible.length > 0 && remaining.length === 0;

  // While a bulk run is in progress, show how many are done out of the
  // initial "remaining" snapshot. We freeze the denominator at run-start so
  // the displayed total doesn't shift mid-run.
  const [startedWith, setStartedWith] = useState(0);
  const completedInRun = startedWith - remaining.length;

  if (eligible.length === 0) return null;

  const onClick = async () => {
    if (running) return;
    setStartedWith(remaining.length);
    setRunning(true);
    setResult(null);
    try {
      const r = await downloadMany(remaining);
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  let buttonLabel: string;
  let icon = <Download className="w-4 h-4" />;
  if (running) {
    icon = <Loader2 className="w-4 h-4 animate-spin" />;
    buttonLabel = `Downloading ${completedInRun}/${startedWith}…`;
  } else if (isAllDownloaded) {
    icon = <Check className="w-4 h-4" />;
    buttonLabel = 'All downloaded';
  } else {
    buttonLabel = `${label} (${remaining.length})`;
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        onClick={onClick}
        disabled={running || isAllDownloaded}
        title={
          isAllDownloaded
            ? 'Every song in this list is already on this device'
            : `Download ${remaining.length} song${remaining.length === 1 ? '' : 's'} to this device for offline / background play`
        }
      >
        {icon}
        {buttonLabel}
      </Button>
      {result && !running && (result.done > 0 || result.failed > 0) && (
        <p className="text-xs text-muted-foreground px-1">
          {result.done} downloaded
          {result.failed > 0 ? `, ${result.failed} failed` : ''}
        </p>
      )}
      {inProgress.size > 0 && !running && (
        <p className="text-xs text-muted-foreground px-1">
          {inProgress.size} download{inProgress.size === 1 ? '' : 's'} in
          progress
        </p>
      )}
    </div>
  );
}
