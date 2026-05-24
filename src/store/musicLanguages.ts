import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';

// Languages offered for music recommendations. Add more here to expand the
// picker — each one drives a "Latest <lang> songs" row on Home.
export const ALL_LANGUAGES = [
  'Telugu', 'Tamil', 'Hindi', 'English',
  'Punjabi', 'Malayalam', 'Kannada', 'Marathi', 'Bengali',
  'Korean', 'Spanish', 'Japanese',
] as const;
export type MusicLanguage = (typeof ALL_LANGUAGES)[number];

// Sensible default when we can't infer anything from listening — keeps Home
// to a few rows instead of one per language.
const DEFAULT_LANGUAGES: MusicLanguage[] = ['Telugu', 'Tamil', 'Hindi', 'English'];

const KEY = 'echonest-music-languages';

interface MusicLanguagesState {
  languages: MusicLanguage[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (lang: MusicLanguage) => void;
}

function readStored(): MusicLanguage[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const valid = arr.filter((l): l is MusicLanguage => (ALL_LANGUAGES as readonly string[]).includes(l));
      return valid;
    }
  } catch {}
  return null;
}

function persist(langs: MusicLanguage[]) {
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(KEY, JSON.stringify(langs)); } catch {}
  }
}

// Hybrid auto-guess: scan recent plays + playlist titles for language hints.
// Many titles/playlists literally name the language ("Latest Telugu Songs",
// "TAMIL PARTY SONGS"), so a keyword scan is a decent first guess. Falls back
// to all languages when there's no signal.
async function guessFromListening(): Promise<MusicLanguage[]> {
  try {
    const sb = createClient();
    const [{ data: rp }, { data: pls }] = await Promise.all([
      sb.from('recently_played').select('song:songs(title, artist_name)').limit(60),
      sb.from('playlists').select('title').limit(60),
    ]);
    const texts: string[] = [];
    for (const r of (rp || []) as { song: { title?: string; artist_name?: string } | { title?: string; artist_name?: string }[] | null }[]) {
      const s = Array.isArray(r.song) ? r.song[0] : r.song;
      if (s) texts.push(`${s.title || ''} ${s.artist_name || ''}`);
    }
    for (const p of (pls || []) as { title?: string }[]) texts.push(p.title || '');
    const blob = texts.join(' ').toLowerCase();

    const found: MusicLanguage[] = [];
    if (/telugu|tollywood/.test(blob)) found.push('Telugu');
    if (/tamil|kollywood/.test(blob)) found.push('Tamil');
    if (/hindi|bollywood/.test(blob)) found.push('Hindi');
    if (/punjabi|punjab/.test(blob)) found.push('Punjabi');
    if (/malayalam|mollywood/.test(blob)) found.push('Malayalam');
    if (/kannada|sandalwood/.test(blob)) found.push('Kannada');
    if (/marathi/.test(blob)) found.push('Marathi');
    if (/bengali|bangla/.test(blob)) found.push('Bengali');
    if (/korean|k-pop|kpop/.test(blob)) found.push('Korean');
    if (/spanish|latino|reggaeton/.test(blob)) found.push('Spanish');
    if (/japanese|j-pop|jpop|anime/.test(blob)) found.push('Japanese');
    if (/english|pop|edm|hits|remix/.test(blob)) found.push('English');
    return found.length > 0 ? found : [...DEFAULT_LANGUAGES];
  } catch {
    return [...DEFAULT_LANGUAGES];
  }
}

export const useMusicLanguages = create<MusicLanguagesState>((set) => ({
  languages: [...DEFAULT_LANGUAGES],
  hydrated: false,

  hydrate: async () => {
    // Explicit user choice always wins.
    const stored = readStored();
    if (stored) {
      set({ languages: stored, hydrated: true });
      return;
    }
    // No saved choice yet → guess from listening (hybrid default) and save it.
    const guess = await guessFromListening();
    persist(guess);
    set({ languages: guess, hydrated: true });
  },

  toggle: (lang) =>
    set((s) => {
      const next = s.languages.includes(lang)
        ? s.languages.filter((l) => l !== lang)
        : [...s.languages, lang];
      persist(next);
      return { languages: next };
    }),
}));
