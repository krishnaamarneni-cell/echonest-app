# EchoNest — Architecture

The map of this codebase: where each screen lives, what talks to what, and the
rules a change has to follow. Read this before the first edit.

- **New to the repo?** Start at [Where the code lives](#where-the-code-lives),
  then find your screen in [Pages](#pages).
- **Running it?** [Build, run, deploy](#build-run-deploy) and `RUNBOOK.md`.
- **About to write code?** [Conventions](#conventions) and
  [Gotchas](#gotchas-that-have-cost-us-time) are the two sections that prevent
  real bugs. Everything in Gotchas has already broken production once.

---

## What EchoNest is

A personal music, podcast and news player. Next.js 16 (App Router, React 19,
TypeScript, Tailwind) deployed on Vercel, with Supabase for auth, database and
file storage. It is a PWA: installable, offline-capable, and it plays in the
background on a phone.

One thing about it is unusual and explains a lot of the code: **audio for
YouTube-sourced tracks is streamed through a small Node proxy running on
Krishna's laptop**, reached over a Cloudflare named tunnel. There is no
licensed music backend. That single fact is why `yt-audio`, the proxy search
path and most of `RUNBOOK.md` exist.

```
                 ┌───────────────────────────────┐
 Browser / PWA ──┤ Next.js on Vercel             │
                 │  app routes + /api routes     │
                 └───┬─────────┬─────────┬───────┘
                     │         │         │
            Supabase │  YouTube│ Data API│ Groq (optional)
         auth, DB,   │  quota- │ metadata│ voice fallback only
         storage, RLS│  budgeted         │
                     │                   │
                 ┌───▼───────────────────▼───┐
                 │ Laptop proxy (yt-dlp)     │  ← audio streams
                 │ via Cloudflare tunnel     │     come from here
                 └───────────────────────────┘
```

---

## Where the code lives

Each directory has one job. If a file does not match its directory's job, it is
in the wrong place.

| Directory | Holds | Must not |
|---|---|---|
| `src/app/(app)/` | Signed-in pages. One folder per route, matching the URL. | Contain shared logic — extract to `lib/` or `components/`. |
| `src/app/api/` | Server-side routes. Anything needing a secret key lives here. | Read the browser Supabase client. |
| `src/components/layout/` | Chrome present across pages: player, nav, sidebar, voice bubble. | Be page-specific. |
| `src/components/ui/` | Reusable presentational pieces. Shared by 2+ pages. | Fetch its own page data (props, or a store). |
| `src/lib/` | Domain logic with no JSX. Parsers, API clients, query helpers. | Import from `components/`. |
| `src/store/` | Zustand stores — client state that outlives a page. | Hold data a single page could own in `useState`. |
| `src/types/` | Shared TypeScript types, chiefly `Song`. | — |
| `*.sql` (repo root) | Schema and migrations, applied by hand. | — |

**Secrets split along one line:** `NEXT_PUBLIC_*` is in the browser bundle and
is public. Everything else (`YOUTUBE_API_KEY`, `GROQ_API_KEY`) is server-only
and may only be read inside `src/app/api/`.

---

## Pages

Every route is `src/app/<path>/page.tsx`. The URL *is* the path — `/library`
is `src/app/(app)/library/page.tsx`. `(app)` is a route group: it adds the
shared layout (nav, player, voice bubble) without appearing in the URL.

### Public

| URL | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing page |
| `/login` `/signup` | `app/login`, `app/signup` | Email + password auth |
| `/forgot-password` `/reset-password` | same names | Password recovery |
| `/privacy` `/terms` | same names | Legal |
| `/offline` | `app/offline` | Shown by the service worker with no network |

### Main app — all under `src/app/(app)/`

| URL | Folder | What it shows | Data from |
|---|---|---|---|
| `/dashboard` | `dashboard/` | **Home.** Tabbed: All, Songs, Podcasts, News, Albums, Artists, Playlists | Supabase + `ChannelFeed` |
| `/library` | `library/` | **Your Library.** Same tabs, full lists | Supabase + `followedChannels` |
| `/search` | `search/` | Search across library and YouTube | Supabase + laptop proxy |
| `/liked` | `liked/` | Liked songs, reorderable | `likes` table |
| `/recent` | `recent/` | Listening history | `recently_played` |
| `/on-repeat` | `on-repeat/` | Most-played | `recently_played`, aggregated |
| `/for-you` | `for-you/` | Recommendations | `lib/autoplayQueue.ts` + `listeningStats.ts` |
| `/playlist/[id]` | `playlist/[id]/` | Playlist detail | `playlists`, `playlist_songs` |
| `/album/[id]` | `album/[id]/` | Album detail | `albums` |
| `/artist/[id]` | `artist/[id]/` | **Library** artist — songs you hold | `artists`, `songs` |
| `/artists` | `artists/` | Browse + add artist channels | `ChannelBrowser` |
| `/artists/[handle]` | `artists/[handle]/` | **Live** artist channel — top songs | YouTube Data API |
| `/podcasts` `/podcasts/[handle]` | `podcasts/` | Browse / one show | `ChannelBrowser`, `ChannelEpisodes` |
| `/news` `/news/[handle]` | `news/` | Browse / one channel | same components |
| `/charts/[region]` `/charts/lang/[lang]` | `charts/` | Trending by place or language | `/api/youtube-trending` |
| `/latest/[lang]` | `latest/[lang]/` | New releases per language | laptop proxy |
| `/upload` | `upload/` | Upload audio files + edit tags | Supabase Storage |
| `/import` | `import/` | Add YouTube videos and playlists | `/api/youtube-*` |
| `/yt-playlist/[id]` | `yt-playlist/[id]/` | A YouTube playlist as a playlist | `/api/youtube-playlist-extract` |
| `/downloads` | `downloads/` | Offline tracks | IndexedDB via `store/offline.ts` |
| `/listen/[code]` | `listen/[code]/` | Listen-along room | `listening_rooms` |
| `/u/[username]` | `u/[username]/` | Public profile | `profiles` |
| `/stats` | `stats/` | Listening statistics | `lib/listeningStats.ts` |
| `/settings` | `settings/` | Profile, sync, account | `profiles` |

**Three artist pages exist on purpose.** `/artist/[id]` is a row in your own
library, built from uploads and pulled songs. `/artists` is the browse-and-add
page. `/artists/[handle]` is a live YouTube channel read fresh on every visit.
They answer different questions and none replaces another.

---

## API routes

All under `src/app/api/`. These hold the keys; nothing here is in the browser
bundle.

| Route | Purpose | Depends on |
|---|---|---|
| `auth/signout` | Clears the session | Supabase |
| `public-session` | Signs a visitor into the shared demo account | Supabase |
| `me/export` `me/delete` | GDPR-style data export and account delete | Supabase |
| `youtube-search` | Song search | laptop proxy (yt-dlp) |
| `youtube-trending` | Charts | YouTube Data API |
| `youtube-add` | Add one video or playlist | YouTube Data API |
| `youtube-import` | Bulk playlist import | YouTube Data API |
| `youtube-playlist-extract` | Read a playlist's track list | YouTube Data API |
| `youtube-meta/[id]` | Authoritative duration for one video | YouTube Data API |
| `youtube/channel` | Video id → its channel (handle, uploads) | YouTube Data API |
| `youtube/connect` `youtube/oauth-callback` `youtube/refresh` | OAuth for a user's own YouTube account | Google OAuth |
| `yt-audio/[id]` | **The audio stream itself** | laptop proxy |
| `podcasts/channels` | Resolve or search channels | YouTube Data API |
| `podcasts/episodes` | One channel's uploads | YouTube Data API |
| `podcasts/feed` | Merged feed across followed channels | YouTube Data API |
| `voice/intent` | Optional LLM fallback for voice | Groq — **501 without a key** |
| `voice/transcribe` | Optional server-side speech-to-text | Groq — **501 without a key** |
| `lyrics` | Lyrics lookup | LRCLIB (lrclib.net) |
| `rooms/create` | Open a listen-along room | Supabase |

**YouTube quota is a real budget, and the route design reflects it.**
`search.list` costs 100 units; `channels.list` and `playlistItems` cost 1 and
take up to 50 ids per call. That is why channel feeds resolve an uploads
playlist and read it, rather than searching — 3 units instead of 100. Keep that
property when editing these routes, and prefer adding a `part` to a call that
is already being made over making a second call.

---

## State — `src/store/`

Zustand. A store is for state that outlives one page or is read by the player.

| Store | Owns |
|---|---|
| `player.ts` | **The player.** Current song, queue, shuffle, repeat, volume, progress |
| `likes.ts` | Liked song ids (library and YouTube kept apart) |
| `followedChannels.ts` | News / podcast / artist channels you follow |
| `voiceAssistant.ts` | The voice bubble's conversation and command pipeline |
| `offline.ts` | Downloaded tracks, backed by IndexedDB |
| `autoplay.ts` | Whether a finished queue extends itself |
| `playlistDialog.ts` | The "add to playlist" dialog target |
| `sleepTimer.ts` | Countdown to pause |
| `listenAlong.ts` `syncMode.ts` `crossDeviceSync.ts` | Listening rooms and multi-device sync |
| `backgroundMode.ts` `musicLanguages.ts` | Per-device preferences |

**`player.ts` is the only thing that starts playback.** Every feature that
plays something — a tapped row, a voice command, a channel page — ends in the
same `play(song, queue, source)`. Never add a second playback path.

---

## Shared logic — `src/lib/`

| File | Responsibility |
|---|---|
| `supabase/` | Browser client, server client, middleware session refresh |
| `channelCategory.ts` | Per-category config for news / podcasts / artists |
| `podcasts.ts` | Channel + episode types, `episodeToSong`, featured lists |
| `ytSearch.ts` | Proxy search, `ytVideoToSong`, `isCompilation`, `isLikelySong` |
| `youtubeImport.ts` `syncYouTubePlaylist.ts` `extractYouTubePlaylist.ts` | Import paths |
| `importArtistSongs.ts` | Bulk-pull an artist's or album's top songs |
| `playlistQueue.ts` `autoplayQueue.ts` `songSort.ts` `reorder.ts` | Queue building and ordering |
| `voiceIntent.ts` | **Rules** that turn a sentence into an action. Pure, no imports |
| `voiceExecute.ts` | Runs a parsed voice action against real data |
| `audioUnlock.ts` | Browser autoplay-gate workarounds |
| `useSpeechInput.ts` | Microphone → text |
| `groq.ts` | Optional LLM client; resolves model ids live |
| `offline-storage.ts` | IndexedDB for downloads |
| `shares.ts` `publicAccount.ts` `profile.ts` `admin.ts` | Sharing, public access, profiles |
| `listeningStats.ts` `coverFor.ts` `lyrics.ts` `utils.ts` | Supporting helpers |

---

## Data

Supabase Postgres. **Row Level Security is on for every table** — a query is
automatically scoped to the signed-in user, which is why most client code can
select without a `user_id` filter.

Core tables (`supabase-schema.sql`): `profiles`, `artists`, `albums`, `songs`,
`playlists`, `playlist_songs`, `likes`, `recently_played`, `youtube_imports`,
`youtube_import_items`.

Added by migration: `followed_channels`, `playback_state`, `collection_shares`,
`listening_rooms`.

`songs` is the central table. A row is either an uploaded file (`file_url`) or
a YouTube reference (`youtube_id`), and `content_type` (`music` | `podcast` |
`news`) decides where it appears and **whether the player shows video or plays
audio alone**.

### Migration discipline

Migrations are plain `.sql` files at the repo root, named
`supabase-migration-<topic>.sql`, **run by hand in the Supabase SQL editor**.
There is no migration runner and no ordering table.

So: a migration must be safe to run twice (`if not exists`, `drop ... if
exists` before `create`), and a feature needing one is not finished until the
file is written, mentioned in the PR, and run. A deployed app whose migration
has not been run fails at the first write — usually silently, because an
optimistic UI update rolls back.

---

## Conventions

**Server by default, `'use client'` when needed.** A page needs it for state,
effects or browser APIs; most pages here are client components because they
read Zustand. Keep `lib/` server-safe where possible so API routes can import it.

**Zustand selectors must return a stable value.** Select the stored value and
derive outside the selector:

```ts
// WRONG — new array every call; zustand v5 compares by identity through
// useSyncExternalStore, so this re-renders forever and React throws
// "Maximum update depth exceeded".
const mine = useStore((s) => s.items.filter((i) => i.kind === 'music'));

// RIGHT
const items = useStore((s) => s.items);
const mine = useMemo(() => items.filter((i) => i.kind === 'music'), [items]);
```

A selector returning a primitive (`.length`, `.some(...)`) is always fine.

**Per-category behaviour belongs in a table, not a ternary.**
`category === 'news' ? a : b` silently treats any new third case as the
fallback. `lib/channelCategory.ts` is the pattern.

**Comments explain why, not what.** The code says what it does; a comment earns
its place by recording the constraint, the failure it prevents, or the
alternative that was rejected.

### Adding things

| To add | Do this |
|---|---|
| A page | `src/app/(app)/<url>/page.tsx`. Add it to the Pages table above. |
| An API route | `src/app/api/<name>/route.ts`. Server-only keys stay here. |
| A shared component | `components/ui/` once a second page needs it. |
| Client state | A page's `useState` first. A store only when it outlives the page. |
| A DB column or table | A new `supabase-migration-*.sql`, idempotent, and say it must be run. |

---

## Gotchas that have cost us time

- **Autoplay gate.** Browsers only start audio from a user gesture, and
  `AudioPlayer` swallows the rejection with `.catch(() => {})`. Anything that
  starts playback after an `await` must prime the element first — see
  `lib/audioUnlock.ts`. Symptom: the UI says playing, the position sits at 0:00.
- **iOS record mode.** A live speech recogniser holds the audio session, and
  nothing plays while it does. Stop *and* abort it before acting on a command.
- **`next dev` needs `--webpack`.** Next 16 defaults dev to Turbopack, which
  this Serwist config cannot use. Both `dev` and `build` pass the flag; if you
  remove it the dev server will not start.
- **PostgREST `.order()` on an unknown column rejects the whole query** with
  400, not just the clause. Code ordering by a column added in a migration must
  check `error` and retry without it.
- **Never hardcode a Groq model id.** They are retired without notice;
  `lib/groq.ts` resolves from the live model list.
- **Vercel's image optimizer** has a monthly quota on the Hobby plan, and
  exhausting it blanks every cover. `images.unoptimized` is set deliberately.

---

## Build, run, deploy

```bash
npm install
npm run dev        # http://localhost:3000 (webpack — see Gotchas)
npm run build      # production build; run before every push
npx tsc --noEmit   # types
npm run lint       # eslint
```

Environment variables are in `README.md`. `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are required; `YOUTUBE_API_KEY` powers channels
and charts; `GROQ_API_KEY` is optional and the voice assistant works without it.

Deployment is Vercel on push to `main`. **Operational problems — a dead tunnel,
a stopped proxy, missing yt-dlp — are in `RUNBOOK.md`, with a symptom → fix
table.** Most "EchoNest is broken" reports are the tunnel, not the code.
