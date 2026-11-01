'use client';

/**
 * Unlocking the <audio> element so the voice assistant can start playback.
 *
 * Browsers only allow audio to start from a user gesture. Tapping a song
 * row calls play() synchronously inside the click handler, so the gesture
 * is still live and it works. A voice command cannot do that: the chain is
 * tap the bubble → speech recognition opens → several seconds of talking →
 * a Supabase read → maybe a YouTube search → play(). By then the gesture
 * has expired (Chrome's transient activation lasts about five seconds;
 * Safari is stricter), and the element is back under autoplay rules.
 *
 * It fails invisibly, which is the nasty part. AudioPlayer calls
 * `audio.play().catch(() => {})`, so the rejection is swallowed while the
 * store still flips to "playing" — the playlist appears to start, the UI
 * shows a current track, and there is simply no sound.
 *
 * The fix is the long-standing audio-unlock trick: during the real tap,
 * play a zero-length silent clip on that same element. Once an element has
 * played once from a gesture, the browser marks it user-activated for the
 * lifetime of the page and every later programmatic play() is allowed.
 */

/**
 * A valid 44-byte WAV header with zero samples — the shortest thing that
 * counts as audio. Deliberately played UNMUTED: on iOS the activation is
 * granted by playing audible-capable content from a gesture, and a muted
 * element can be treated as the separate (freely allowed, and therefore
 * non-unlocking) muted-autoplay case. Silence here comes from the content
 * having no samples, not from the volume.
 */
import { usePlayerStore } from '@/store/player';

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let unlocked = false;

/**
 * Whether this page has already earned the right to start audio.
 *
 * Resets on every load, which is exactly what a caller needs to know: a
 * cold launch — from the home screen, or from a Siri shortcut — carries no
 * activation, so a command that arrives before any touch cannot produce
 * sound and must ask for one tap first.
 */
export function isAudioUnlocked(): boolean {
  return unlocked;
}

/**
 * Call from a real tap, before anything async. Cheap and idempotent: it
 * does nothing once the element has demonstrably played.
 */
export function primeAudioPlayback(): void {
  if (unlocked || typeof document === 'undefined') return;

  const audio = document.querySelector('audio');
  if (!audio) return;

  // Already playing, or has played before — the element already carries
  // the activation and touching it would only interrupt something.
  if (!audio.paused || audio.currentTime > 0) {
    unlocked = true;
    return;
  }

  const savedSrc = audio.getAttribute('src');

  try {
    audio.src = SILENT_WAV;
    const started = audio.play();
    if (!started) return;

    const restore = () => {
      // Only undo if the silent clip is still what is loaded. By the time
      // this resolves a real track could have taken over, and clearing its
      // src would stop the very playback this exists to enable.
      if (audio.src !== SILENT_WAV) return;
      audio.pause();
      if (savedSrc) {
        audio.src = savedSrc;
      } else {
        // Removing the attribute rather than assigning '' — an empty src
        // resolves to the page URL and makes the browser fetch the HTML
        // document as audio.
        audio.removeAttribute('src');
        audio.load();
      }
    };

    started
      .then(() => {
        unlocked = true;
        restore();
      })
      .catch(() => {
        // Refused even from the gesture. Nothing more to try; the command
        // will still fail, but silently failing here changes nothing.
        restore();
      });
  } catch {
    // Some browsers throw synchronously on an unsupported src.
  }
}

/**
 * Make the element agree with the store after a voice command.
 *
 * AudioPlayer starts playback with `audio.play().catch(() => {})`, so a
 * refusal leaves the store saying "playing" and the element paused, with
 * nothing anywhere that retries. Two things cause that refusal on the
 * voice path, and both clear on their own within a second or two:
 *
 *  - iOS keeps the audio session in record mode for a moment after the
 *    recogniser lets go of the microphone.
 *  - The source may not have finished resolving when play() first ran.
 *
 * So this re-asks a few times over about three seconds and stops the
 * instant the element is actually playing, the store no longer wants to,
 * or the track changes under it.
 */
export function nudgeAudioPlayback(): void {
  if (typeof document === 'undefined') return;

  let tries = 0;
  const started = usePlayerStore.getState().currentSong?.id;

  const tick = () => {
    const state = usePlayerStore.getState();
    // Something else took over — a skip, a pause, a new command. Leave it.
    if (!state.isPlaying || state.currentSong?.id !== started) return;

    const audio = document.querySelector('audio');
    if (!audio) return;
    if (!audio.paused) return; // Playing: nothing to repair.

    // No source yet; the React effect has not pointed it anywhere. Waiting
    // is right — calling play() on an empty element only fails again.
    if (audio.getAttribute('src')) audio.play().catch(() => {});

    if (++tries < 9) window.setTimeout(tick, 320);
  };

  window.setTimeout(tick, 160);
}
