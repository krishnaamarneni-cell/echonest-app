'use client';

// "AI Access" panel for the settings page — Wealth-Claude-inspired layout.
// Users generate per-client tokens (Bearer auth) and copy a clean URL into
// their AI client's MCP connector setting. Tokens auto-expire after 365
// days and can be revoked at any time.

import { useEffect, useState, useCallback } from 'react';
import {
  Bot,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Loader2,
  BookOpen,
  X,
} from 'lucide-react';

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

const ORIGIN = (() => {
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
})();

const MCP_URL = `${ORIGIN}/api/mcp`;
const REST_URL = `${ORIGIN}/api/agent/me`;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

export function McpConnectorPanel() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ token: string; name: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/mcp/tokens');
      const d = await r.json();
      if (r.ok && Array.isArray(d.tokens)) setTokens(d.tokens);
      else setTokens([]);
    } catch {
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const trimmed = name.trim() || 'Untitled token';
    setCreating(true);
    try {
      const r = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const d = await r.json();
      if (r.ok && d.token) {
        setRevealed({ token: d.token, name: trimmed });
        setName('');
        setShowCreate(false);
        load();
      } else {
        alert(d.error || 'Could not create token');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this token? Any AI client using it will immediately stop working.')) return;
    await fetch(`/api/mcp/tokens/${id}`, { method: 'DELETE' });
    load();
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {}
  };

  const activeTokens = (tokens || []).filter((t) => !t.revoked_at);

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        AI Access
      </h2>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
        {/* Heading */}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold">Connect an AI agent</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Generate a token so Claude, ChatGPT, Cursor, or any Model Context
              Protocol agent can search your library, play songs, manage
              playlists, and like tracks on your behalf. One token per client
              — revoke anytime.
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-xs text-amber-100/90">
            A token is like a password — anyone who has it can access your
            EchoNest library and start music on your devices until you revoke
            it. Only paste it into AI tools you trust.
          </p>
        </div>

        {/* Newly created token — shown ONCE */}
        {revealed && (
          <div className="space-y-3 rounded-xl border border-success/40 bg-success/10 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                <div className="text-xs">
                  <p className="font-semibold text-success">
                    Copy this token now — you won&apos;t see it again
                  </p>
                  <p className="mt-0.5 text-success/80">
                    &ldquo;{revealed.name}&rdquo;
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRevealed(null)}
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-success/70 hover:bg-success/20 hover:text-success"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              <span className="flex-1 truncate text-foreground">{revealed.token}</span>
              <button
                onClick={() => copy('revealed-token', revealed.token)}
                className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-card-hover hover:text-foreground"
              >
                {copiedKey === 'revealed-token' ? (
                  <>
                    <Check className="h-3 w-3 text-success" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copy
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* YOUR TOKENS */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Your tokens
            </p>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card-hover px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-card"
            >
              <Plus className="h-3.5 w-3.5" />
              New token
            </button>
          </div>

          {/* Inline create form */}
          {showCreate && (
            <form
              onSubmit={handleCreate}
              className="flex items-center gap-2 rounded-xl border border-border bg-background p-2"
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Name (e.g. Claude Desktop on Mac)"
                className="flex-1 rounded-md bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setName('');
                }}
                className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-card-hover hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Generate
              </button>
            </form>
          )}

          {tokens === null ? (
            <p className="px-1 text-xs text-muted-foreground">Loading…</p>
          ) : activeTokens.length === 0 && !showCreate ? (
            <div className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                No tokens yet — click <span className="font-semibold text-foreground">+ New token</span> to connect your first AI client.
              </p>
            </div>
          ) : (
            activeTokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-cyan-500/30 text-xs font-bold text-foreground">
                  {initialsFor(t.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{t.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      mcp_{t.token_prefix}…
                    </span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t.last_used_at
                      ? `Last used ${fmtDate(t.last_used_at)}`
                      : 'Never used'}
                    {' · '}
                    {t.expires_at ? `expires ${fmtDate(t.expires_at)}` : 'no expiry'}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(t.id)}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Revoke"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* How to connect */}
        <div className="space-y-3 rounded-xl border border-border bg-background p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-success" />
            How to connect
          </p>

          <UrlField
            label="MCP connector URL (Claude / ChatGPT custom connectors, Cursor, Zed):"
            url={MCP_URL}
            onCopy={() => copy('mcp-url', MCP_URL)}
            copied={copiedKey === 'mcp-url'}
          />

          <UrlField
            label="Or a plain read-only REST endpoint (any agent / script):"
            url={REST_URL}
            onCopy={() => copy('rest-url', REST_URL)}
            copied={copiedKey === 'rest-url'}
          />

          <p className="text-[11px] text-muted-foreground">
            Add the connector with the URL above and set the authorization
            header to <code className="rounded bg-card px-1 py-0.5 font-mono">Bearer &lt;your token&gt;</code>.
            EchoNest exposes 10 tools: search, play, like/unlike, list
            playlists, add to playlist, recent history, and now-playing.
          </p>
        </div>
      </div>
    </section>
  );
}

function UrlField({
  label,
  url,
  onCopy,
  copied,
}: {
  label: string;
  url: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          readOnly
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent/40"
        />
        <button
          onClick={onCopy}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card-hover px-3 py-2 text-xs font-medium text-foreground hover:bg-card"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}
