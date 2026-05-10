# EchoNest

A premium, personal music streaming app — like Spotify, but for *your* music library. Upload your own audio files, organize playlists, and stream from anywhere with a polished, mobile-first interface.

Built with Next.js 16, Tailwind CSS, Supabase, and a sticky bottom audio player that handles both your uploaded MP3s and embedded YouTube tracks.

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
4. (If you previously ran an older version of the schema) also run [`supabase-migration-youtube-embed.sql`](./supabase-migration-youtube-embed.sql)

### 3. Environment variables

Copy `.env.local.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional — only needed for full YouTube playlist track-list import
YOUTUBE_API_KEY=your-google-cloud-youtube-data-api-key
```

Find the URL and anon key in **Supabase Dashboard → Settings → API**.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, and start uploading.

---

## How the app works

### Pages

| Route | What it does |
|---|---|
| `/` | Landing page — sign up / log in CTAs |
| `/login` `/signup` | Email/password authentication |
| `/dashboard` | Greeting, recently played, your playlists, your albums |
| `/library` | Tabbed view: Songs / Albums / Artists / Playlists |
| `/search` | Instant search across everything |
| `/upload` | Drag-and-drop audio upload with metadata editing |
| `/playlist/[id]` | Playlist detail with play/shuffle |
| `/playlist/new` | Create a new playlist |
| `/album/[id]` | Album detail with tracklist |
| `/artist/[id]` | Artist profile + albums + songs |
| `/liked` | Liked songs (auto-playlist) |
| `/recent` | Last 50 tracks you played |
| `/import` | Add YouTube videos & playlists (embed-only, no downloads) |
| `/settings` | Profile, sign out |

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

All tables use **Row-Level Security** so users can only read/write their own data. Storage buckets (`audio`, `covers`) are similarly scoped per-user.

---

## File structure

```
echonest/
├─ src/
│  ├─ app/
│  │  ├─ (app)/              # Authenticated pages with shared layout
│  │  │  ├─ dashboard/
│  │  │  ├─ library/
│  │  │  ├─ search/
│  │  │  ├─ upload/
│  │  │  ├─ playlist/[id]/
│  │  │  ├─ album/[id]/
│  │  │  ├─ artist/[id]/
│  │  │  ├─ liked/
│  │  │  ├─ recent/
│  │  │  ├─ import/
│  │  │  └─ settings/
│  │  ├─ api/
│  │  │  ├─ youtube-add/     # Single video / playlist embed
│  │  │  └─ youtube-import/  # Bulk playlist track-list (needs API key)
│  │  ├─ login/  signup/  page.tsx (landing)
│  │  ├─ layout.tsx
│  │  └─ globals.css
│  ├─ components/
│  │  ├─ layout/             # Sidebar, BottomNav, AudioPlayer, AppLayout
│  │  └─ ui/                 # Button, Input, MediaCard, SongRow, Logo, Skeleton, EmptyState
│  ├─ lib/
│  │  ├─ supabase/           # Browser client, server client, middleware
│  │  └─ utils.ts
│  ├─ store/
│  │  └─ player.ts           # Zustand audio player state
│  ├─ types/
│  │  └─ index.ts
│  └─ middleware.ts
├─ supabase-schema.sql
├─ supabase-migration-youtube-embed.sql
├─ next.config.ts
└─ package.json
```

---

## Deployment to Vercel

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. **Settings → Environment Variables** — add the same keys from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `YOUTUBE_API_KEY` (optional)
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
