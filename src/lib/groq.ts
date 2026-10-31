/**
 * Groq access, server side only.
 *
 * No model id is written into a request anywhere in this file. Groq retires
 * models on its own schedule and without notice, and a pinned id turns into
 * a 400 the morning it goes — which, for a feature you use while driving,
 * means the bubble silently stops understanding you. So the id is always
 * resolved from the live /models list against a preference order, cached for
 * a few minutes, and re-resolved once if a call still complains about the
 * model it was given.
 *
 * Everything degrades to null rather than throwing. The voice assistant has
 * a working rule-based parser behind it, so "Groq is unreachable" has to
 * mean "fall back", not "error".
 */

const API = 'https://api.groq.com/openai/v1';

/**
 * Best first, matched as a substring against the live list so a dated
 * variant ("…-versatile-0905") still matches its family. Ordered by how
 * well each one follows a strict JSON schema, not by raw size — the task
 * here is classification into a fixed set, not prose.
 */
const CHAT_PREFERENCE = [
  'llama-3.3-70b-versatile',
  'llama-3.3-70b',
  'llama-3.1-70b',
  'llama-3.1-8b-instant',
  'llama-3',
  'mixtral',
  'gemma2',
  'gemma',
];

const AUDIO_PREFERENCE = ['whisper-large-v3-turbo', 'whisper-large-v3', 'whisper'];

type Kind = 'chat' | 'audio';

interface Cached {
  id: string;
  at: number;
}
const cache: Partial<Record<Kind, Cached>> = {};
const TTL = 10 * 60 * 1000;

export function groqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

async function listModels(key: string): Promise<string[]> {
  try {
    const r = await fetch(`${API}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!r.ok) return [];
    const d = (await r.json()) as { data?: Array<{ id?: string }> };
    return (d.data || []).map((m) => m.id).filter((id): id is string => !!id);
  } catch {
    return [];
  }
}

/**
 * Pick a live model for `kind`. `force` skips the cache, which is what the
 * retry path uses after a model-related rejection.
 */
async function pickModel(kind: Kind, key: string, force = false): Promise<string | null> {
  const hit = cache[kind];
  if (!force && hit && Date.now() - hit.at < TTL) return hit.id;

  const available = await listModels(key);
  const prefs = kind === 'chat' ? CHAT_PREFERENCE : AUDIO_PREFERENCE;

  for (const pref of prefs) {
    // Exact id first, then any id containing it. Exact-first matters because
    // a substring search for "llama-3" would otherwise hand back whatever
    // the list happens to order first.
    const exact = available.find((id) => id === pref);
    const loose = exact || available.find((id) => id.includes(pref));
    if (loose) {
      cache[kind] = { id: loose, at: Date.now() };
      return loose;
    }
  }

  // The list came back but nothing matched: take any model that at least
  // looks like the right family rather than giving up outright.
  const salvage = available.find((id) =>
    kind === 'audio' ? id.includes('whisper') : /llama|mixtral|gemma|qwen/.test(id),
  );
  if (salvage) {
    cache[kind] = { id: salvage, at: Date.now() };
    return salvage;
  }
  return null;
}

/** Does this failure look like "that model is gone" rather than anything else? */
function isModelComplaint(status: number, body: string): boolean {
  if (status !== 400 && status !== 404) return false;
  return /model|decommission|does not exist|not found/i.test(body);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * One JSON-mode completion. Returns the parsed object, or null if Groq is
 * not configured, unreachable, or gave back something that is not JSON.
 */
export async function groqJson(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<unknown | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const send = async (model: string) =>
    fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        // Low but not zero: the classification should be stable, while the
        // spoken line is allowed a little variety.
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.maxTokens ?? 300,
        response_format: { type: 'json_object' },
      }),
      cache: 'no-store',
    });

  try {
    let model = await pickModel('chat', key);
    if (!model) return null;

    let res = await send(model);

    if (!res.ok) {
      const body = await res.text();
      if (!isModelComplaint(res.status, body)) return null;
      // The cached pick is stale. Re-resolve once against a fresh list.
      model = await pickModel('chat', key, true);
      if (!model) return null;
      res = await send(model);
      if (!res.ok) return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Transcribe a short audio clip. Only used where the browser has no speech
 * recognition of its own — see VoiceBubble.
 */
export async function groqTranscribe(file: Blob, filename: string): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const send = async (model: string) => {
    const form = new FormData();
    form.append('file', file, filename);
    form.append('model', model);
    form.append('response_format', 'json');
    // A hint, not a filter: it nudges Whisper toward song and app wording
    // without constraining the language it will accept.
    form.append('prompt', 'A command for a music app, naming a playlist, song, artist or movie.');
    return fetch(`${API}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      cache: 'no-store',
    });
  };

  try {
    let model = await pickModel('audio', key);
    if (!model) return null;

    let res = await send(model);
    if (!res.ok) {
      const body = await res.text();
      if (!isModelComplaint(res.status, body)) return null;
      model = await pickModel('audio', key, true);
      if (!model) return null;
      res = await send(model);
      if (!res.ok) return null;
    }

    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch {
    return null;
  }
}
