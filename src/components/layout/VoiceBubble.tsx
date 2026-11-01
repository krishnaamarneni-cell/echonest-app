'use client';

/**
 * The voice bubble: a floating mic above the player that takes a spoken
 * command and plays something.
 *
 * Designed for the case it exists for — a glance at arm's length, one
 * thumb, while driving. That drives most of what looks unusual here:
 *
 *  - Tapping the bubble opens the panel AND starts listening. Two taps to
 *    talk is one tap too many, and the tap itself is the user gesture that
 *    browsers require before opening a mic.
 *  - Replies are spoken by default. Reading is the thing you cannot do.
 *  - Choices are numbered and full-width, so "second one" and a thumb jab
 *    are equally good ways to pick.
 *  - Hint chips are built from your actual playlist names, so the examples
 *    are commands that will genuinely work rather than invented ones.
 */

import { useEffect, useState } from 'react';
import { Mic, X, Volume2, VolumeX, Loader2, Square, ArrowUp, Play } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { useVoiceAssistant } from '@/store/voiceAssistant';
import { useSpeechInput } from '@/lib/useSpeechInput';
import { loadVoiceLibrary } from '@/lib/voiceExecute';
import { primeAudioPlayback, isAudioUnlocked } from '@/lib/audioUnlock';
import { FloatingOrb } from './FloatingOrb';
import { VoiceOrb } from '@/components/ui/VoiceOrb';

export function VoiceBubble() {
  const isNowPlayingOpen = usePlayerStore((s) => s.isNowPlayingOpen);

  const open = useVoiceAssistant((s) => s.open);
  const phase = useVoiceAssistant((s) => s.phase);
  const heard = useVoiceAssistant((s) => s.heard);
  const turns = useVoiceAssistant((s) => s.turns);
  const choices = useVoiceAssistant((s) => s.choices);
  const speakReplies = useVoiceAssistant((s) => s.speakReplies);
  const openPanel = useVoiceAssistant((s) => s.openPanel);
  const closePanel = useVoiceAssistant((s) => s.closePanel);
  const setHeard = useVoiceAssistant((s) => s.setHeard);
  const toggleSpeak = useVoiceAssistant((s) => s.toggleSpeak);
  const submit = useVoiceAssistant((s) => s.submit);
  const pickChoice = useVoiceAssistant((s) => s.pickChoice);

  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  /** A command that arrived in the URL and is waiting for one tap. */
  const [pendingAsk, setPendingAsk] = useState('');

  const mic = useSpeechInput({
    onFinal: (text) => {
      setError('');
      submit(text);
    },
    onPartial: setHeard,
    onError: (message) => {
      setHeard('');
      setError(message);
    },
  });

  const listening = mic.state === 'listening';
  const busy = mic.state === 'transcribing' || phase === 'thinking';

  /**
   * Commands arriving in the URL: /?ask=play%20my%20liked%20songs
   *
   * This is the door Siri comes through. iOS will not let a voice assistant
   * talk to a web app, but it will open a URL — so an Apple Shortcut named
   * "EchoNest" opens this one, and the command runs on arrival rather than
   * being typed.
   *
   * A cold launch carries no user activation, so audio cannot start by
   * itself. When that is the case the command is staged behind one big
   * button instead of being run into silence; if the app is already open
   * and has played something, it just runs.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const ask = url.searchParams.get('ask');
    if (!ask?.trim()) return;

    // Drop it from the URL so a refresh — or coming back to the tab — does
    // not replay the command.
    url.searchParams.delete('ask');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);

    const text = ask.trim().slice(0, 200);
    // Deferred out of the effect body: these are state writes, and running
    // them synchronously inside an effect is both a lint error here and an
    // extra render before first paint.
    const t = window.setTimeout(() => {
      openPanel();
      if (isAudioUnlocked()) submit(text);
      else setPendingAsk(text);
    }, 0);
    return () => window.clearTimeout(t);
  }, [openPanel, submit]);

  /**
   * Build hints from the library. Done on open rather than in an effect so
   * nothing is fetched for a bubble that is never tapped.
   */
  const loadExamples = () => {
    loadVoiceLibrary()
      .then((lib) => {
        const names = lib.playlists
          .filter((p) => p.songs.length > 0)
          .slice(0, 2)
          .map((p) => `Play my ${p.playlist.title} playlist`);
        setExamples([
          ...(lib.liked.length ? ['Shuffle my liked songs'] : []),
          ...names,
          'Play songs from Dilwale',
        ]);
      })
      .catch(() => setExamples([]));
  };

  /**
   * Every entry point primes the audio element FIRST, before anything
   * async. These handlers are the only real user gestures in the whole
   * flow — by the time a command finishes being spoken, interpreted and
   * searched, the gesture has expired and the browser will refuse to start
   * audio. See audioUnlock.ts.
   */
  const openAndListen = () => {
    primeAudioPlayback();
    setError('');
    openPanel();
    loadExamples();
    mic.start();
  };

  const toggleMic = () => {
    primeAudioPlayback();
    setError('');
    if (listening) mic.stop();
    else mic.start();
  };

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    primeAudioPlayback();
    setTyped('');
    setError('');
    submit(text);
  };

  const choose = (n: number) => {
    primeAudioPlayback();
    pickChoice(n);
  };

  const runExample = (text: string) => {
    primeAudioPlayback();
    submit(text);
  };

  /** The one tap a Siri launch needs before the browser will make sound. */
  const runPendingAsk = () => {
    primeAudioPlayback();
    const text = pendingAsk;
    setPendingAsk('');
    submit(text);
  };

  return (
    <>
      {/* The bubble. Hidden while Now Playing is open: that sheet owns the
          whole screen and the bubble would sit on top of its controls. */}
      {!open && !isNowPlayingOpen && (
        <FloatingOrb active={listening} busy={busy} onTap={openAndListen} />
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm"
            onClick={() => closePanel()}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[86] mx-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl sm:right-4 sm:left-auto sm:bottom-4 sm:max-w-[400px] sm:rounded-2xl sm:border"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <VoiceOrb size={26} active={listening} busy={busy} />
              <p className="flex-1 text-sm font-semibold">Ask EchoNest</p>
              <button
                onClick={toggleSpeak}
                aria-label={speakReplies ? 'Mute spoken replies' : 'Speak replies'}
                title={speakReplies ? 'Mute spoken replies' : 'Speak replies'}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {speakReplies ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => closePanel()}
                aria-label="Close"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {pendingAsk && (
                <button
                  onClick={runPendingAsk}
                  className="flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-4 text-left text-white transition-transform active:scale-[0.98]"
                >
                  <Play className="h-5 w-5 shrink-0 fill-current" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">Tap to play</span>
                    <span className="block truncate text-xs text-white/80">
                      “{pendingAsk}”
                    </span>
                  </span>
                </button>
              )}

              {turns.length === 0 && !heard && !pendingAsk && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Tap the mic and say what to play.
                  </p>
                  {examples.map((e) => (
                    <button
                      key={e}
                      onClick={() => runExample(e)}
                      className="block w-full rounded-lg bg-background px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      “{e}”
                    </button>
                  ))}
                </div>
              )}

              {turns.map((t) => (
                <div
                  key={t.id}
                  className={t.from === 'you' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <p
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      t.from === 'you'
                        ? 'bg-accent text-white'
                        : 'bg-background text-foreground'
                    }`}
                  >
                    {t.text}
                  </p>
                </div>
              ))}

              {heard && (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-accent/40 px-3 py-2 text-sm text-white">
                    {heard}
                  </p>
                </div>
              )}

              {choices.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {choices.map((c, i) => (
                    <button
                      key={`${c.song.id}-${i}`}
                      onClick={() => choose(i + 1)}
                      className="flex w-full items-center gap-3 rounded-xl bg-background px-3 py-3 text-left transition-colors hover:bg-card-hover"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.subtitle}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              {/* Keeps the newest line in view without reading a ref during
                  render — a callback ref fires after the node is attached. */}
              <div ref={(el) => el?.scrollIntoView({ block: 'end' })} />
            </div>

            <div className="flex items-center gap-2 border-t border-border px-3 py-3">
              <button
                onClick={toggleMic}
                disabled={busy && !listening}
                aria-label={listening ? 'Stop listening' : 'Start listening'}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-60 ${
                  listening ? 'bg-destructive' : 'bg-accent'
                } ${listening ? 'animate-pulse' : ''}`}
              >
                {busy && !listening ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : listening ? (
                  <Square className="h-4 w-4 fill-current" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>

              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendTyped();
                }}
                placeholder={listening ? 'Listening…' : 'or type a command'}
                className="min-w-0 flex-1 rounded-full bg-background px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-accent"
              />

              {typed.trim() && (
                <button
                  onClick={sendTyped}
                  aria-label="Send"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
