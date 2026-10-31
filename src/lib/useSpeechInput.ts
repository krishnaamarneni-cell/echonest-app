'use client';

/**
 * Getting words out of the microphone.
 *
 * Two routes, in this order:
 *
 *  1. The browser's own speech recognition. Free, no upload, and it streams
 *     partial text as you talk, which is what makes the bubble feel like it
 *     is listening rather than thinking. Available in Chrome, Android and
 *     Safari on iOS 14.5+, which covers the phone this is for.
 *
 *  2. Record a clip and transcribe it server side. Only used where (1) is
 *     missing — Firefox, mainly. Costs an upload and gives no partial text,
 *     and needs GROQ_API_KEY, so it is genuinely the fallback.
 *
 * Either way the output is a string, which is all the rest of the feature
 * wants. The typed box in the panel enters the same pipeline, so a denied
 * mic is an inconvenience rather than a dead end.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Deliberately local and minimally typed rather than relying on lib.dom:
 * SpeechRecognition's presence in TypeScript's DOM types has moved around
 * between versions, and only these few members are used.
 */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [i: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type MicState = 'idle' | 'listening' | 'transcribing';

interface Options {
  /** A complete utterance, ready to run. */
  onFinal: (text: string) => void;
  /** Partial text while talking, for the "I'm hearing you" line. */
  onPartial?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechInput({ onFinal, onPartial, onError }: Options) {
  const [state, setState] = useState<MicState>('idle');

  const recRef = useRef<Recognition | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Callbacks held in a ref so starting the mic does not depend on their
  // identity — otherwise every parent render would tear down a live
  // recogniser mid-sentence.
  //
  // Refreshed in an effect rather than during render: writing a ref while
  // rendering is what React's `refs` rule forbids, and it is unnecessary
  // here because every caller fires from a mic event, which is always
  // after a commit.
  const cb = useRef({ onFinal, onPartial, onError });
  useEffect(() => {
    cb.current = { onFinal, onPartial, onError };
  }, [onFinal, onPartial, onError]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // Already stopped; nothing to do.
    }
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      mediaRef.current.stop();
    }
  }, []);

  /** Path 2: record, upload, transcribe. */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      mediaRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        // Release the mic immediately — leaving the track live keeps the
        // recording indicator on and, on iOS, ducks other audio.
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 1200) {
          setState('idle');
          cb.current.onError?.("I didn't hear anything.");
          return;
        }
        setState('transcribing');
        try {
          const form = new FormData();
          form.append('audio', blob, 'clip.webm');
          const r = await fetch('/api/voice/transcribe', { method: 'POST', body: form });
          if (r.status === 501) {
            cb.current.onError?.('Voice typing needs a Groq key. Type it instead.');
          } else if (r.ok) {
            const d = (await r.json()) as { text?: string };
            if (d.text?.trim()) cb.current.onFinal(d.text.trim());
            else cb.current.onError?.("I couldn't make that out.");
          } else {
            cb.current.onError?.("I couldn't make that out.");
          }
        } catch {
          cb.current.onError?.('Transcription failed.');
        } finally {
          setState('idle');
        }
      };

      rec.start();
      setState('listening');
      // A command is short. This is a safety net for a tab left listening,
      // not the normal way a recording ends.
      window.setTimeout(() => {
        if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
      }, 10_000);
    } catch {
      setState('idle');
      cb.current.onError?.('I need microphone access to listen.');
    }
  }, []);

  const start = useCallback(async () => {
    const Ctor = recognitionCtor();

    if (!Ctor) {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        cb.current.onError?.("This browser can't listen. Type your command instead.");
        return;
      }
      await startRecording();
      return;
    }

    try {
      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = navigator.language || 'en-US';
      // One utterance per tap: a command is a sentence, and continuous mode
      // would keep the mic open through whatever else is said in the car.
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const text = r[0]?.transcript || '';
          if (r.isFinal) {
            const finalText = text.trim();
            // Release the mic BEFORE running the command, not after.
            //
            // On iOS a live recogniser holds the audio session in record
            // mode, and nothing can play out of the <audio> element while
            // it does — the track loads, the store says playing, and the
            // position sits at 0:00. `continuous = false` is not enough on
            // its own: Safari frequently never fires onend, so the session
            // stays open until it is stopped by hand.
            try {
              rec.stop();
              rec.abort();
            } catch {
              // Already finished; the mic is free either way.
            }
            setState('idle');
            if (finalText) cb.current.onFinal(finalText);
            return;
          }
          interim += text;
        }
        if (interim) cb.current.onPartial?.(interim.trim());
      };

      rec.onerror = (e) => {
        setState('idle');
        const kind = e.error;
        if (kind === 'not-allowed' || kind === 'service-not-allowed') {
          cb.current.onError?.('Microphone access is blocked for this site.');
        } else if (kind === 'no-speech') {
          cb.current.onError?.("I didn't hear anything.");
        } else if (kind !== 'aborted') {
          cb.current.onError?.("The mic didn't work that time.");
        }
      };

      rec.onend = () => setState('idle');

      rec.start();
      setState('listening');
    } catch {
      setState('idle');
      cb.current.onError?.("I couldn't start the microphone.");
    }
  }, [startRecording]);

  // Never leave a recogniser or a live mic track behind on unmount.
  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        // Nothing listening.
      }
      if (mediaRef.current?.state === 'recording') mediaRef.current.stop();
    },
    [],
  );

  return { state, start, stop };
}
