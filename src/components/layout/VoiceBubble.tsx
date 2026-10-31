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

import { useState } from 'react';
import { Mic, X, Volume2, VolumeX, Loader2, Square, ArrowUp, Sparkles } from 'lucide-react';
import { usePlayerStore } from '@/store/player';
import { useVoiceAssistant } from '@/store/voiceAssistant';
import { useSpeechInput } from '@/lib/useSpeechInput';
import { loadVoiceLibrary } from '@/lib/voiceExecute';

export function VoiceBubble() {
  const isNowPlayingOpen = usePlayerStore((s) => s.isNowPlayingOpen);
  const isPlayerVisible = usePlayerStore((s) => s.isPlayerVisible);

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

  const openAndListen = () => {
    setError('');
    openPanel();
    loadExamples();
    mic.start();
  };

  const toggleMic = () => {
    setError('');
    if (listening) mic.stop();
    else mic.start();
  };

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    setError('');
    submit(text);
  };

  return (
    <>
      {/* The bubble. Hidden while Now Playing is open: that sheet owns the
          whole screen and the bubble would sit on top of its controls. */}
      {!open && !isNowPlayingOpen && (
        <button
          onClick={openAndListen}
          aria-label="Ask EchoNest"
          className="fixed right-3 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-xl shadow-accent/30 transition-transform active:scale-95"
          style={{
            bottom: isPlayerVisible
              ? 'calc(var(--floating-bottom) + 48px)'
              : 'calc(var(--total-bottom-nav) + 16px)',
          }}
        >
          <Mic className="h-6 w-6" />
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm"
            onClick={closePanel}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[86] mx-auto flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl sm:right-4 sm:left-auto sm:bottom-4 sm:max-w-[400px] sm:rounded-2xl sm:border"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Sparkles className="h-4 w-4 text-accent" />
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
                onClick={closePanel}
                aria-label="Close"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {turns.length === 0 && !heard && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Tap the mic and say what to play.
                  </p>
                  {examples.map((e) => (
                    <button
                      key={e}
                      onClick={() => submit(e)}
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
                      onClick={() => pickChoice(i + 1)}
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
