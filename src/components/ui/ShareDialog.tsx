'use client';

/**
 * Share a playlist, or your Liked Songs, with another EchoNest user.
 *
 * Deliberately shows the current recipient list in the same place you add
 * to it: sharing is a thing you do repeatedly and then forget, so "who
 * can see this" has to be answerable without hunting for a settings page.
 */

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, UserPlus, Trash2, Users } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import {
  ShareKind,
  ShareWithPerson,
  listShares,
  removeShare,
  shareCollection,
} from '@/lib/shares';

export function ShareDialog({
  open,
  onClose,
  kind,
  playlistId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  kind: ShareKind;
  /** null for Liked Songs — a user has exactly one. */
  playlistId: string | null;
  title: string;
}) {
  const [email, setEmail] = useState('');
  const [shares, setShares] = useState<ShareWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // Reopening the dialog clears whatever the last visit left behind.
  // Done during render rather than in an effect because it is derived
  // from a prop changing, not a side effect: an effect would paint one
  // frame of the previous recipient's email before wiping it.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmail('');
      setError('');
      setNote('');
      setShares([]);
      setLoading(true);
    }
  }

  const refresh = useCallback(async () => {
    const rows = await listShares(kind, playlistId);
    setShares(rows);
    setLoading(false);
  }, [kind, playlistId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listShares(kind, playlistId).then((rows) => {
      if (cancelled) return;
      setShares(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, kind, playlistId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setSharing(true);
    setError('');
    setNote('');

    const result = await shareCollection(kind, playlistId, value);
    if (result.ok) {
      setNote(`Shared with ${result.name}.`);
      setEmail('');
      await refresh();
    } else {
      setError(result.error);
    }
    setSharing(false);
  };

  const drop = async (id: string) => {
    if (await removeShare(id)) {
      setShares((prev) => prev.filter((s) => s.id !== id));
      setNote('');
    } else {
      setError("Couldn't remove that person. Try again.");
    }
  };

  const label = (s: ShareWithPerson) =>
    s.person?.display_name ||
    (s.person?.username ? `@${s.person.username}` : null) ||
    s.person?.email ||
    'Someone';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
      />

      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Share</h2>
            <p className="truncate text-xs text-muted-foreground">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-card-hover flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3 border-b border-border">
          <Input
            label="Their EchoNest email"
            type="email"
            placeholder="friend@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {kind === 'likes'
              ? 'They can see everything you like, as you like it. They cannot change anything.'
              : 'They can play it, and add songs to it. Anything either of you adds shows up for both.'}
          </p>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
          {note && (
            <p className="text-sm text-accent bg-accent/10 px-3 py-2 rounded-lg">{note}</p>
          )}
          <Button type="submit" disabled={sharing || !email.trim()}>
            {sharing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sharing...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Share
              </>
            )}
          </Button>
        </form>

        <div className="p-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shared with
          </h3>

          {loading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : shares.length === 0 ? (
            <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
              <Users className="w-4 h-4 shrink-0" />
              Not shared with anyone yet.
            </div>
          ) : (
            shares.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg bg-background px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label(s)}</p>
                  {s.person?.email && s.person.email !== label(s) && (
                    <p className="truncate text-xs text-muted-foreground">
                      {s.person.email}
                    </p>
                  )}
                </div>
                {s.kind === 'playlist' && (
                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                    {s.can_edit ? 'Can add' : 'View only'}
                  </span>
                )}
                <button
                  onClick={() => drop(s.id)}
                  aria-label={`Stop sharing with ${label(s)}`}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
