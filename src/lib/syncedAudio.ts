// Web Audio engine for tight multi-device room sync.
//
// The trick (vs the <audio> element, which can't be scheduled): download the
// song, decode it to an AudioBuffer, then schedule playback with the Web Audio
// clock so every device starts the exact same sample at the exact same shared
// moment. Combined with server-clock sync, devices line up within ms.
//
// Model: the room stores the song's live position on the SHARED server clock
// as `playStartedAtMs` = (server time when the song was at offset 0). At any
// server time S the correct offset is (S - playStartedAtMs)/1000. Each device
// schedules its buffer to that function, so they all converge regardless of
// when each one joined or scheduled.

import { createClient } from '@/lib/supabase/client';

let audioCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

// ---- Shared clock (server time) ----
let clockOffset = 0; // serverNow() ≈ Date.now() + clockOffset
let clockSynced = false;

export async function syncClock(force = false): Promise<void> {
  if (clockSynced && !force) return;
  const supabase = createClient();
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_now_ms');
    const t1 = Date.now();
    if (error || data == null) continue;
    const serverAtT1 = Number(data) + (t1 - t0) / 2;
    samples.push(serverAtT1 - t1);
  }
  if (samples.length) {
    samples.sort((a, b) => a - b);
    clockOffset = samples[Math.floor(samples.length / 2)];
    clockSynced = true;
  }
}

export function serverNow(): number {
  return Date.now() + clockOffset;
}

// ---- Engine ----
export class SyncedAudioEngine {
  private buffers = new Map<string, AudioBuffer>(); // videoId -> decoded audio
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private playingVideoId: string | null = null;
  private loadingVideoId: string | null = null;
  nudgeMs = 0; // per-device manual offset (e.g. Bluetooth latency)

  get currentDuration(): number {
    const id = this.playingVideoId;
    return id && this.buffers.has(id) ? this.buffers.get(id)!.duration : 0;
  }

  // Download + decode a song (cached). url = proxy /audio/<id> (streams bytes).
  async load(videoId: string, url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(videoId)) return this.buffers.get(videoId)!;
    if (this.loadingVideoId === videoId) return null; // already in flight
    this.loadingVideoId = videoId;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      const buf = await getAudioContext().decodeAudioData(bytes);
      this.buffers.set(videoId, buf);
      return buf;
    } catch {
      return null;
    } finally {
      if (this.loadingVideoId === videoId) this.loadingVideoId = null;
    }
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch {}
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    this.playingVideoId = null;
  }

  setVolume(v: number) {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v));
  }

  // Current playback offset (seconds into the song) per the shared clock.
  offsetFor(playStartedAtMs: number): number {
    return (serverNow() - playStartedAtMs) / 1000;
  }

  // Schedule the song so it tracks (serverNow - playStartedAtMs). Safe to call
  // repeatedly; it only (re)schedules when needed (song change or big drift).
  async sync(opts: {
    videoId: string;
    url: string;
    playStartedAtMs: number;
    isPlaying: boolean;
    volume: number;
    driftThreshold?: number; // seconds
  }) {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }

    if (!opts.isPlaying) {
      // Host paused — stop local sound but keep buffer cached.
      if (this.source) this.stop();
      this.playingVideoId = opts.videoId;
      return;
    }

    const buffer = await this.load(opts.videoId, opts.url);
    if (!buffer) return; // still downloading/decoding; try again next tick

    const targetOffset = this.offsetFor(opts.playStartedAtMs) + this.nudgeMs / 1000;
    if (targetOffset >= buffer.duration) return; // past the end

    // If already playing this song, only re-schedule on noticeable drift.
    if (this.source && this.playingVideoId === opts.videoId) {
      const drift = Math.abs(this.estimatedOffset(opts.playStartedAtMs) - this.offsetFor(opts.playStartedAtMs));
      if (drift < (opts.driftThreshold ?? 0.12)) {
        this.setVolume(opts.volume);
        return; // in sync — leave it
      }
    }

    // (Re)schedule. Start a touch in the future and seek to where the song
    // should be at THAT moment, so it lands on the shared timeline.
    this.stop();
    const LEAD = 0.12; // seconds
    // Compensate for THIS device's own audio output latency so the sound
    // reaches the ears on the shared timeline (built-in speakers ~50-150ms,
    // and it differs phone-vs-laptop — that's the "slight echo"). Each device
    // cancels its own, so they line up at the ears without manual tuning.
    const outLat = (ctx.outputLatency || ctx.baseLatency || 0);
    const startOffset =
      this.offsetFor(opts.playStartedAtMs) + LEAD + outLat + this.nudgeMs / 1000;
    if (startOffset >= buffer.duration) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, opts.volume));
    src.connect(gain).connect(ctx.destination);
    src.start(ctx.currentTime + LEAD, Math.max(0, startOffset));

    this.source = src;
    this.gain = gain;
    this.playingVideoId = opts.videoId;
    this.startedCtxTime = ctx.currentTime + LEAD;
    this.startedOffset = startOffset;
  }

  private startedCtxTime = 0;
  private startedOffset = 0;

  // Where we believe local playback currently is (for drift checks).
  private estimatedOffset(_playStartedAtMs: number): number {
    if (!this.source) return 0;
    const ctx = getAudioContext();
    return this.startedOffset + Math.max(0, ctx.currentTime - this.startedCtxTime);
  }
}

// One shared engine instance for the app.
let engine: SyncedAudioEngine | null = null;
export function getSyncedEngine(): SyncedAudioEngine {
  if (!engine) engine = new SyncedAudioEngine();
  return engine;
}
