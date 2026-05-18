'use client';

/**
 * "Your data" + "Delete account" actions on Settings.
 * These match the rights we promised in /privacy:
 *   - Download your data (JSON export)
 *   - Delete your account entirely
 */

import { useState } from 'react';
import { Download, Trash2, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function AccountDangerZone() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDone, setDeleteDone] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const r = await fetch('/api/me/export');
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.error || `Export failed (${r.status})`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'echonest-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    if (confirmText.trim().toLowerCase() !== 'delete') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const r = await fetch('/api/me/delete', { method: 'POST' });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.error || `Deletion failed (${r.status})`);
      }
      setDeleteDone(true);
      if (typeof window !== 'undefined') {
        localStorage.clear(); // best-effort wipe of all client cache
        setTimeout(() => {
          window.location.href = '/?deleted=1';
        }, 1500);
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Your data</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Download a JSON file with every song, playlist, like, and play
          history we have on file for your account. Or wipe everything.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-card-hover border border-border text-foreground rounded-full text-xs font-medium hover:bg-card transition-colors disabled:opacity-60"
        >
          {exporting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {exporting ? 'Preparing…' : 'Download my data'}
        </button>

        {confirmStep === 0 && (
          <button
            onClick={() => setConfirmStep(1)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 border border-destructive/30 text-destructive rounded-full text-xs font-medium hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete my account
          </button>
        )}
      </div>

      {exportError && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-foreground">Export failed — {exportError}</p>
        </div>
      )}

      {/* Two-step delete confirmation */}
      {confirmStep === 1 && !deleteDone && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Are you sure?
          </p>
          <p className="text-xs text-muted-foreground">
            This permanently removes every song, playlist, like, play
            history, uploaded audio file, and YouTube connection for your
            account. There is no undo. Download your data first if you
            want a copy.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmStep(2)}
              className="px-4 py-2 bg-destructive text-white rounded-full text-xs font-semibold hover:bg-destructive/80 transition-colors"
            >
              Yes, continue
            </button>
            <button
              onClick={() => setConfirmStep(0)}
              className="px-4 py-2 bg-card-hover border border-border text-foreground rounded-full text-xs font-medium hover:bg-card transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {confirmStep === 2 && !deleteDone && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            Type{' '}
            <code className="px-1.5 py-0.5 bg-card-hover border border-border rounded text-xs font-mono">
              DELETE
            </code>{' '}
            to confirm
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full px-3 py-2 rounded-lg bg-card border border-destructive/30 text-foreground placeholder:text-muted focus:outline-none focus:border-destructive font-mono text-sm"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={
                deleting || confirmText.trim().toLowerCase() !== 'delete'
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-destructive text-white rounded-full text-xs font-semibold hover:bg-destructive/80 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </button>
            <button
              onClick={() => {
                setConfirmStep(0);
                setConfirmText('');
              }}
              disabled={deleting}
              className="px-4 py-2 bg-card-hover border border-border text-foreground rounded-full text-xs font-medium hover:bg-card transition-colors"
            >
              Cancel
            </button>
          </div>
          {deleteError && (
            <div className="flex items-start gap-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">{deleteError}</p>
            </div>
          )}
        </div>
      )}

      {deleteDone && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-foreground">
            Account deleted. Redirecting to the home page…
          </p>
        </div>
      )}
    </section>
  );
}
