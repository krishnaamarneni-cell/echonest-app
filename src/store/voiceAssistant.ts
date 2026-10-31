'use client';

/**
 * State for the voice bubble.
 *
 * In a store rather than the component so a command survives navigation —
 * the bubble is mounted in AppLayout, but a route change still remounts
 * enough of the tree that holding a half-finished conversation in local
 * state would lose it mid-sentence.
 *
 * The pipeline a command goes through lives here too: rules first, the
 * optional model second, execute, speak. Keeping it out of the component
 * means the same path can be driven by the mic or by the typed box with no
 * duplicate logic.
 */

import { create } from 'zustand';
import { parseLocally, validateCommand, VoiceCommand } from '@/lib/voiceIntent';
import { buildVoiceContext, runVoiceAction, Choice, invalidateVoiceLibrary } from '@/lib/voiceExecute';

export type Phase = 'idle' | 'listening' | 'thinking' | 'done';

export interface Turn {
  id: number;
  from: 'you' | 'nest';
  text: string;
}

interface VoiceState {
  open: boolean;
  phase: Phase;
  /** Live partial transcript while the mic is open. */
  heard: string;
  turns: Turn[];
  choices: Choice[];
  /** Spoken replies. On by default — the whole point is not looking down. */
  speakReplies: boolean;

  openPanel: () => void;
  closePanel: () => void;
  setPhase: (p: Phase) => void;
  setHeard: (s: string) => void;
  toggleSpeak: () => void;
  say: (text: string) => void;
  /** Run one utterance all the way through to playback. */
  submit: (transcript: string) => Promise<void>;
  pickChoice: (index: number) => Promise<void>;
  reset: () => void;
}

let turnId = 0;

/**
 * Whether the optional model fallback is worth calling.
 *
 * Starts as unknown and is settled by the first reply from the route. Once
 * the route has said it has no key, nothing asks again — otherwise every
 * unparseable sentence would pay for a round trip to learn the same thing.
 */
let modelAvailable: boolean | null = null;

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch {
    // Some browsers throw if speech is used before any user gesture. The
    // text is on screen regardless, so this is not worth surfacing.
  }
}

/** Ask the route to interpret what the rules could not. */
async function askModel(
  transcript: string,
  context: Awaited<ReturnType<typeof buildVoiceContext>>,
): Promise<VoiceCommand | null> {
  if (modelAvailable === false) return null;
  try {
    const r = await fetch('/api/voice/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, context }),
    });
    if (r.status === 501) {
      modelAvailable = false;
      return null;
    }
    if (!r.ok) return null;
    const d = (await r.json()) as { command?: unknown };
    modelAvailable = true;
    if (!d.command) return null;
    return validateCommand(d.command, context);
  } catch {
    return null;
  }
}

export const useVoiceAssistant = create<VoiceState>((set, get) => ({
  open: false,
  phase: 'idle',
  heard: '',
  turns: [],
  choices: [],
  speakReplies:
    typeof window === 'undefined'
      ? true
      : localStorage.getItem('echonest-voice-speak') !== '0',

  openPanel: () => {
    // A playlist created since the last command should be findable.
    invalidateVoiceLibrary();
    set({ open: true });
  },
  closePanel: () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    set({ open: false, phase: 'idle', heard: '' });
  },
  setPhase: (phase) => set({ phase }),
  setHeard: (heard) => set({ heard }),

  toggleSpeak: () =>
    set((s) => {
      const next = !s.speakReplies;
      if (typeof window !== 'undefined') {
        localStorage.setItem('echonest-voice-speak', next ? '1' : '0');
        if (!next) window.speechSynthesis?.cancel();
      }
      return { speakReplies: next };
    }),

  say: (text) => {
    set((s) => ({ turns: [...s.turns, { id: ++turnId, from: 'nest', text }] }));
    if (get().speakReplies) speak(text);
  },

  reset: () => set({ turns: [], choices: [], heard: '', phase: 'idle' }),

  submit: async (transcript) => {
    const text = transcript.trim();
    if (!text) return;

    set((s) => ({
      turns: [...s.turns, { id: ++turnId, from: 'you', text }],
      heard: '',
      phase: 'thinking',
    }));

    try {
      const context = await buildVoiceContext(get().choices.map((c) => c.title));

      // Rules first. They answer everything the feature was asked for, cost
      // nothing, and come back in the same tick.
      let command = parseLocally(text, context);

      // Only an utterance the rules could not place is worth a round trip.
      if (command.action.kind === 'unknown') {
        const fromModel = await askModel(text, context);
        if (fromModel && fromModel.action.kind !== 'unknown') command = fromModel;
      }

      const outcome = await runVoiceAction(command.action, command.say, get().choices);

      // A new list replaces the old one; an action that produced no list
      // clears it, so a stale "second one" cannot land on last week's
      // search results.
      set({ choices: outcome.choices ?? [], phase: 'done' });
      get().say(outcome.say);
    } catch {
      set({ phase: 'done' });
      get().say('Something went wrong there. Try again?');
    }
  },

  pickChoice: async (index) => {
    const choices = get().choices;
    const choice = choices[index - 1];
    if (!choice) return;
    set((s) => ({
      turns: [...s.turns, { id: ++turnId, from: 'you', text: choice.title }],
      phase: 'thinking',
    }));
    const outcome = await runVoiceAction({ kind: 'choose', index }, '', choices);
    set({ choices: [], phase: 'done' });
    get().say(outcome.say);
  },
}));
