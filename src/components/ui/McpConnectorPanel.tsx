'use client';

// "Connect to AI" panel for the settings page. Users can generate per-client
// MCP tokens, copy them, view ready-made config snippets for Claude Desktop /
// Cursor / Zed, and revoke any token. The plaintext token is shown EXACTLY
// once at creation time (the API only ever returns the hash after that), so
// the UI surfaces it clearly with a Copy button and a "save this now" warning.

import { useEffect, useState, useCallback } from 'react';
import {
  Bot,
  Plus,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const MCP_BASE = (() => {
  if (typeof window !== 'undefined') return `${window.location.origin}/api/mcp`;
  return '/api/mcp';
})();

export function McpConnectorPanel() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ token: string; name: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showConfigs, setShowConfigs] = useState(false);

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

  const fullUrl = revealed ? `${MCP_BASE}?token=${revealed.token}` : `${MCP_BASE}?token=YOUR_TOKEN`;

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
        Connect to AI (MCP)
      </h2>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">AI client access</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Let Claude Desktop, Cursor, Zed, or any Model Context Protocol
              client control your EchoNest by chat. Generate one token per
              client so you can revoke them individually.
            </p>
          </div>
        </div>

        {/* Newly created token — shown ONCE */}
        {revealed && (
          <div className="rounded-xl border border-success/40 bg-success/10 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-success mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-success">
                  Copy this now — you won&apos;t see it again
                </p>
                <p className="text-success/80 mt-0.5">
                  &ldquo;{revealed.name}&rdquo;
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2 font-mono text-xs">
              <span className="flex-1 truncate text-foreground">{revealed.token}</span>
              <button
                onClick={() => copy('revealed-token', revealed.token)}
                className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-card-hover hover:text-foreground"
              >
                {copiedKey === 'revealed-token' ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <button
              onClick={() => setRevealed(null)}
              className="text-xs font-medium text-success underline-offset-2 hover:underline"
            >
              I&apos;ve saved it — dismiss
            </button>
          </div>
        )}

        {/* Create form */}
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Token name (e.g. Claude Desktop on Mac)"
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New token
          </button>
        </form>

        {/* Existing tokens */}
        <div className="space-y-2">
          {tokens === null ? (
            <p className="px-1 text-xs text-muted-foreground">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              No tokens yet. Create one above to connect your first AI client.
            </p>
          ) : (
            tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {t.name}
                    {t.revoked_at && (
                      <span className="ml-2 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        REVOKED
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    mcp_{t.token_prefix}… · created {new Date(t.created_at).toLocaleDateString()}
                    {t.last_used_at
                      ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`
                      : ' · never used'}
                  </p>
                </div>
                {!t.revoked_at && (
                  <button
                    onClick={() => handleRevoke(t.id)}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Revoke"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Config snippets */}
        <button
          type="button"
          onClick={() => setShowConfigs((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-card-hover"
        >
          <span>How to connect (Claude Desktop, Cursor, Zed)</span>
          {showConfigs ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {showConfigs && (
          <div className="space-y-4 rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">
              Replace <code className="rounded bg-card px-1 py-0.5">YOUR_TOKEN</code> with the
              token you just copied. Each client needs to be restarted after the config change.
            </p>

            <ConfigBlock
              title="Claude Desktop"
              path="~/Library/Application Support/Claude/claude_desktop_config.json (macOS) · %APPDATA%\Claude\claude_desktop_config.json (Windows)"
              code={JSON.stringify(
                {
                  mcpServers: {
                    echonest: {
                      url: fullUrl,
                    },
                  },
                },
                null,
                2,
              )}
              onCopy={(t) => copy('claude', t)}
              copied={copiedKey === 'claude'}
            />
            <ConfigBlock
              title="Cursor"
              path="~/.cursor/mcp.json (or Settings → Features → Model Context Protocol)"
              code={JSON.stringify(
                {
                  mcpServers: {
                    echonest: {
                      url: fullUrl,
                    },
                  },
                },
                null,
                2,
              )}
              onCopy={(t) => copy('cursor', t)}
              copied={copiedKey === 'cursor'}
            />
            <ConfigBlock
              title="Zed"
              path="~/.config/zed/settings.json"
              code={JSON.stringify(
                {
                  context_servers: {
                    echonest: {
                      url: fullUrl,
                    },
                  },
                },
                null,
                2,
              )}
              onCopy={(t) => copy('zed', t)}
              copied={copiedKey === 'zed'}
            />

            <p className="text-[11px] text-muted-foreground">
              Tools EchoNest exposes: <code className="rounded bg-card px-1">search_songs</code>,
              <code className="ml-1 rounded bg-card px-1">search_youtube</code>,
              <code className="ml-1 rounded bg-card px-1">get_now_playing</code>,
              <code className="ml-1 rounded bg-card px-1">play_song</code>,
              <code className="ml-1 rounded bg-card px-1">like_song</code> /{' '}
              <code className="rounded bg-card px-1">unlike_song</code>,
              <code className="ml-1 rounded bg-card px-1">list_playlists</code>,
              <code className="ml-1 rounded bg-card px-1">get_playlist_songs</code>,
              <code className="ml-1 rounded bg-card px-1">add_song_to_playlist</code>,
              <code className="ml-1 rounded bg-card px-1">get_recent_played</code>.
              <br />
              <span className="mt-1 inline-block">
                Note: <code className="rounded bg-card px-1">play_song</code> only starts audio
                if you have an EchoNest tab open with cross-device sync turned on. Read-only
                tools work any time.
              </span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ConfigBlock({
  title,
  path,
  code,
  onCopy,
  copied,
}: {
  title: string;
  path: string;
  code: string;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <button
          onClick={() => onCopy(code)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-card-hover hover:text-foreground"
        >
          {copied ? (
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
      <p className="text-[11px] text-muted-foreground">{path}</p>
      <pre className="overflow-x-auto rounded-lg bg-card px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground">
        {code}
      </pre>
    </div>
  );
}
