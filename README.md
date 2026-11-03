# EchoNest

A premium, personal music streaming app — like Spotify, but for *your* music library. Upload your own audio files, organize playlists, and stream from anywhere with a polished, mobile-first interface.

Built with Next.js 16, Tailwind CSS, Supabase, and a sticky bottom audio player that handles both your uploaded MP3s and embedded YouTube tracks.

> **Working on the code?** Read **[ARCHITECTURE.md](ARCHITECTURE.md)** first — it
> maps every page to its file, lists the API routes and stores, and records the
> conventions and the bugs that have already bitten us. **[RUNBOOK.md](RUNBOOK.md)**
> covers operations: when playback dies, it is almost always the tunnel, not the code.

---

## Highlights

- 🎵 **Your music** — upload MP3, WAV, FLAC, M4A, OGG and stream them anywhere
- 🎨 **Premium UI** — dark by default, gradient accents, smooth animations, glassmorphic player
- 📱 **Mobile-first** — sidebar on desktop, bottom nav on mobile, sticky audio player on both
- 📂 **Library** — songs, albums, artists, playlists, liked songs, recently played
- 🔍 **Search** — instant search across songs, albums, artists, and playlists
- 🎚️ **Full player** — play/pause, seek, skip, volume, shuffle, repeat (off/all/one), queue
- ❤️ **Liked songs** — one-click favorite, dedicated playlist
- 📺 **YouTube embed** — paste any video or playlist URL, plays inline via official YouTube iframe (no downloads, no API key)
- 🔐 **Auth** — email/password via Supabase with Row-Level Security
- ⚡ **Fast** — server components, edge middleware, optimistic UI

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Backend / DB / Auth | Supabase (Postgres + Storage + Auth) |
| State | Zustand (audio player) |
| Icons | Lucide React |
| Hosting | Vercel |

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/your-username/echonest.git
cd echonest
npm install
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. In the Supabase dashboard, go to **SQL Editor** → **New query**
3. Paste the entire contents of [`supabase-schema.sql`](./supabase-schema.sql) and run it
   - This creates all tables, RLS policies, storage buckets, and triggers
4. Then run each `supabase-migration-*.sql` in the repo root

Migrations are applied **by hand** — there is no runner and no ordering table.
They are written to be safe to re-run, so running them all is fine; a few build
on earlier ones, so if one fails because a table is missing, run the migration
that creates that table first and then re-run it.

**A feature whose migration has not been run fails at its first write**, and
usually looks like nothing happening at all, because an optimistic UI update
rolls back. When playback, following a channel or saving a setting silently
does not stick, check this first.

### 3. Environment variables

Copy `.env.local.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional — only needed for full YouTube playlist track-list import
YOUTUBE_API_KEY=your-google-cloud-youtube-data-api-key

# Optional — the voice bubble works WITHOUT this. It parses commands with
# local rules, so "play my sleep playlist" / "shuffle my liked songs" /
# "play songs from <film>" all work with no key. A key only adds a fallback
# for phrasing the rules can't place ("play something upbeat"), and
# server-side transcription on browsers with no speech recognition of their
# own (Firefox; Chrome, Android and iOS 14.5+ transcribe on the device).
GROQ_API_KEY=your-groq-api-key
```

Find the URL and anon key in **Supabase Dashboard → Settings → API**.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, and start uploading.

Both `dev` and `build` pass `--webpack`. Next 16 defaults the dev server to
Turbopack, which this Serwist config cannot use — remove the flag and the dev
server will not start.

---

## How the app works

### Pages

Routes live at `src/app/<url>/page.tsx` — `/library` is
`src/app/(app)/library/page.tsx`. The main ones:

| Route | What it does |
|---|---|
| `/` `/login` `/signup` | Landing page and authentication |
| `/dashboard` | Home — recently played, your music, podcasts, news, artists |
| `/library` | Your Library, tabbed: Songs / Playlists / Podcasts / News / Albums / Artists |
| `/search` | Search across your library and YouTube |
| `/liked` `/recent` `/on-repeat` `/for-you` | Liked, history, most-played, recommendations |
| `/playlist/[id]` `/album/[id]` `/artist/[id]` | Library detail pages |
| `/artists` `/podcasts` `/news` | Browse and follow channels; `/<section>/[handle]` opens one |
| `/charts/[region]` `/latest/[lang]` | Trending by place and language |
| `/upload` `/import` `/yt-playlist/[id]` | Add music: files, YouTube videos, YouTube playlists |
| `/downloads` `/listen/[code]` `/stats` `/settings` `/u/[username]` | Offline, listen-along, stats, settings, public profile |

**[ARCHITECTURE.md](ARCHITECTURE.md#pages)** has the full table, with the data
source behind each page.

### Audio player

A sticky bottom player handles both kinds of tracks transparently:

- **Uploaded files** → played via `<audio>` element streaming from Supabase Storage
- **YouTube embeds** → played via the YouTube IFrame Player API (hidden iframe, audio-only feel)

Same controls (play/pause/seek/skip/volume/shuffle/repeat) work for both. A small "YT" badge appears on the cover art when a YouTube track is playing.

### Upload flow

1. Drop one or more audio files onto `/upload`
2. EchoNest auto-fills title and artist from the filename (`Artist - Song.mp3` pattern)
3. Edit metadata, then click "Upload all"
4. Files are uploaded to Supabase Storage under `audio/{user_id}/...`
5. Artists and albums are auto-created or matched on the fly
6. Songs appear in your library immediately

### YouTube import (legitimate, no downloads)

EchoNest does **not** download or rehost YouTube content — that violates YouTube's ToS and copyright. Instead:

- Paste a video URL (`youtube.com/watch?v=...`) → adds one track that streams via YouTube's official embed
- Paste a playlist URL (`youtube.com/playlist?list=...`) → adds one entry that plays the whole playlist sequentially via embed

Title and thumbnail are pulled from YouTube's free oEmbed endpoint — no API key needed.

For a *full track list* of a playlist (each video as its own library entry), you can optionally add a YouTube Data API v3 key — that powers `/api/youtube-import` to fetch every video's metadata and match it against your uploaded library.

---

## Database schema

| Table | Purpose |
|---|---|
| `profiles` | User profile (extends `auth.users`) |
| `artists` | Artists (auto-created from uploads) |
| `albums` | Albums (auto-created from uploads) |
| `songs` | Tracks — both uploaded files (`source='upload'`) and YouTube embeds (`source='youtube_embed'`) |
| `playlists` | User-created playlists |
| `playlist_songs` | Junction table for playlist contents |
| `likes` | Liked songs |
| `recently_played` | Playback history |
| `youtube_imports` | Records of imported playlists |
| `youtube_import_items` | Individual videos within an import, matched against library |

Added by migration:

| Table | Purpose | Migration |
|---|---|---|
| `followed_channels` | News / podcast / artist channels you follow | `followed-channels`, plus `artist-channels` for artists |
| `playback_state` | Resume position, shared across devices | `playback-state` |
| `collection_shares` | Shared playlists and collections | `shared-collections` |
| `listening_rooms` | Listen-along sessions | `listening-rooms` |

All tables use **Row-Level Security** so users can only read/write their own data. Storage buckets (`audio`, `covers`) are similarly scoped per-user.

---

## File structure

```
echonest/
├─ src/
│  ├─ app/
│  │  ├─ (app)/              # Signed-in pages — one folder per URL
│  │  ├─ api/                # Server routes; every secret key lives here
│  │  ├─ login/ signup/ …    # Public pages
│  │  └─ layout.tsx  globals.css  sw.ts
│  ├─ components/
│  │  ├─ layout/             # AudioPlayer, NowPlayingScreen, nav, VoiceBubble
│  │  └─ ui/                 # Reusable pieces shared by 2+ pages
│  ├─ lib/                   # Domain logic, no JSX (parsers, API clients, queries)
│  │  └─ supabase/           # Browser client, server client, middleware
│  ├─ store/                 # Zustand — player, likes, followed channels, voice…
│  ├─ types/                 # Shared types; `Song` is the central one
│  └─ middleware.ts          # Refreshes the Supabase session on every request
├─ supabase-schema.sql       # Base schema
├─ supabase-migration-*.sql  # Run BY HAND in the Supabase SQL editor
├─ ARCHITECTURE.md           # The map — read this first
└─ RUNBOOK.md                # When it breaks in production
```

Each directory has exactly one job, listed in
**[ARCHITECTURE.md](ARCHITECTURE.md#where-the-code-lives)**. A file that does
not match its directory's job is in the wrong place.

---

## Deployment to Vercel

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. **Settings → Environment Variables** — add the same keys from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `YOUTUBE_API_KEY` (optional)
   - `GROQ_API_KEY` (optional — voice bubble works without it)
4. Deploy

After the first deploy, in **Supabase → Authentication → URL Configuration**, add your Vercel URL (e.g. `https://echonest.vercel.app`) to **Site URL** and **Redirect URLs**, otherwise sign-in won't redirect correctly on the live site.

---

## What this app does NOT do

For clarity (and to keep things legal):

- ❌ Does **not** download audio or video from YouTube
- ❌ Does **not** rip, scrape, or rehost copyrighted content
- ❌ Does **not** bypass YouTube ads, age restrictions, or DRM
- ❌ Does **not** offer offline downloads of streamed content

If you want to listen to a YouTube track inside EchoNest, the embed plays it from YouTube's servers (with whatever ads YouTube serves). The only audio files actually stored in your library are ones you upload yourself.

---

## License

MIT — do whatever you want with it for personal use. Don't redistribute as a paid service without checking with me first.

---

Built with ☕ and a love for music libraries that feel like *yours*.
