# EchoNest — Operations Runbook

When something stops working in production, find the symptom below and run the
matching fix. Everything you need is on **this laptop** — the Vercel deploy
just calls back to a local proxy on this machine through a Cloudflare tunnel.

---

## The stack at a glance

```
  iPhone / Browser  -->  Vercel-hosted Next.js app
                              |
                              |  fetch("<NEXT_PUBLIC_YT_PROXY_URL>/audio/<id>?s=...")
                              v
            Cloudflare tunnel  (random *.trycloudflare.com URL)
                              |
                              v
            Laptop:  node yt-proxy/server.mjs  on  http://localhost:8080
                              |
                              v
            Laptop:  C:\Users\Krishna\Downloads\yt-dlp\yt-dlp.exe
```

If any link breaks, the whole chain stops. Most failures = tunnel died.

| Where it runs | What |
|---|---|
| `C:\Users\Krishna\OneDrive\Documents\Codes\echonest\yt-proxy\` | Node proxy + tunnel scripts |
| `C:\Users\Krishna\Downloads\yt-dlp\yt-dlp.exe` | yt-dlp binary (do not move) |
| `C:\Program Files (x86)\cloudflared\cloudflared.exe` | Cloudflare tunnel client |
| Vercel dashboard → `NEXT_PUBLIC_YT_PROXY_URL` | Deployed app's pointer to the tunnel |

---

## Symptom -> Fix table

| Symptom | What's broken | Run this |
|---|---|---|
| Downloads fail / songs won't play / search says "music proxy may be offline" | Tunnel URL died (most common) | **Fix A** below |
| `localhost:8080/health` doesn't respond | Proxy server is down | **Fix B** below |
| Proxy logs `spawn yt-dlp ENOENT` or playback fails locally too | yt-dlp.exe missing | **Fix C** below |
| Vercel deploys but app still uses old proxy URL | Env var updated but no redeploy | **Fix D** below |
| Cover images blank | Vercel image-optimizer quota | already fixed via `next.config.ts` `images.unoptimized=true` — re-deploy if it regresses |

---

## Fix A — Tunnel URL died (THE common one)

**Symptom:** downloads fail, search says "music proxy may be offline",
background play stops, but **only on your phone / on Vercel**, not on
`localhost:3000`. The Cloudflare quick tunnel URL is ephemeral — it dies
periodically and after every laptop reboot if cloudflared restarted.

**Where to run:** PowerShell, in
`C:\Users\Krishna\OneDrive\Documents\Codes\echonest\yt-proxy`

```powershell
.\restart-tunnel.ps1
```

The script:
1. Checks yt-dlp + local proxy are alive (bails with a clear message if not).
2. Kills any stale cloudflared processes.
3. Spawns a fresh quick tunnel.
4. Verifies `/audio` actually returns 206 + CORS.
5. Prints the new URL **and copies it to your clipboard**.

**Then you must update Vercel** (because `NEXT_PUBLIC_*` env vars are baked
into the client bundle at **build time**, not read at runtime):

1. https://vercel.com/dashboard → **echonest-app**
2. **Settings → Environment Variables**
3. Edit `NEXT_PUBLIC_YT_PROXY_URL` → paste the new URL → **Save**
4. **Deployments** tab → latest deployment → **⋯ menu → Redeploy**

Wait ~1-2 min for the redeploy. Hard-refresh the app. Fixed.

> **Leave the PowerShell window open.** The tunnel dies when cloudflared
> exits. To stop it later:
> ```powershell
> Get-Process cloudflared | Stop-Process -Force
> ```

---

## Fix B — Local proxy is down

**Symptom:** even `curl http://localhost:8080/health` from this laptop fails.

**Where to run:** PowerShell, in
`C:\Users\Krishna\OneDrive\Documents\Codes\echonest\yt-proxy`

```powershell
.\start-local.ps1
```

Leave that window open. Then run Fix A from a **second** PowerShell window to
get a fresh tunnel pointing at it.

---

## Fix C — yt-dlp.exe missing

**Symptom:** proxy `service.log` shows `spawn yt-dlp ENOENT`, or
`/audio` returns 502 even on localhost.

**Where to run:** any PowerShell window.

```powershell
$dir = "C:\Users\Krishna\Downloads\yt-dlp"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
Invoke-WebRequest `
  -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" `
  -OutFile "$dir\yt-dlp.exe"
```

Don't move it — the proxy's `YTDLP_PATH` in `start-local.ps1` is hard-coded to
that exact path.

After this, restart the proxy (Fix B) and the tunnel (Fix A).

---

## Fix D — Vercel uses old URL after env update

**Cause:** `NEXT_PUBLIC_YT_PROXY_URL` is a public/client env var. Next.js
inlines its value into the JS bundle **at build time**. Updating it in the
Vercel dashboard does nothing until you **redeploy**.

**Fix:** Vercel → **Deployments** → latest → **⋯ → Redeploy** (no need to
push a new commit; just redeploy the existing one).

---

## Diagnostic one-liners

Run these from any PowerShell or Git Bash:

```powershell
# Is yt-dlp present?
Test-Path "C:\Users\Krishna\Downloads\yt-dlp\yt-dlp.exe"

# Is local proxy alive?
curl http://localhost:8080/health

# What URL does the deployed bundle THINK it should call?
#   View page source on https://echonest-app.vercel.app/search and search for "trycloudflare"
#   Or:
$page = (Invoke-WebRequest "https://echonest-app.vercel.app/search" -UseBasicParsing).Content
($page -match "/_next/static/chunks/[^""]+\.js") | Out-Null
# then fetch one of those .js files and grep for trycloudflare.com

# What tunnel URL is cloudflared currently serving?
Get-Content "C:\Users\Krishna\OneDrive\Documents\Codes\echonest\yt-proxy\new-tunnel.log" `
  | Select-String "trycloudflare.com"

# Is cloudflared running?
Get-Process cloudflared -ErrorAction SilentlyContinue
```

---

## The permanent fix (one-time, ~15 min, kills this whole class of problem)

Quick tunnels (`*.trycloudflare.com`) are ephemeral — that's why this keeps
happening. The real fix is a **named tunnel** with a stable hostname on your
own domain:

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels** → **Create tunnel**
2. Pick a name (e.g. `echonest-proxy`), grab the install command, run on this laptop
3. Add a **Public Hostname** like `proxy.yourdomain.com` → service
   `http://localhost:8080`
4. Update `NEXT_PUBLIC_YT_PROXY_URL` to that hostname in Vercel, redeploy **once**, never again

Needs: a domain on Cloudflare (free Cloudflare account is fine; the domain
itself is the only paid bit).

The Windows service `cloudflared` on this laptop was once configured for a
named tunnel (`sc qc cloudflared` still shows a token) but that tunnel was
deleted on Cloudflare's side. Recreating it through the dashboard would
restore stable operation.

---

## Project layout cheat sheet

```
C:\Users\Krishna\OneDrive\Documents\Codes\echonest\
├── RUNBOOK.md                         <-- this file
├── next.config.ts
├── src/                               (Next.js app)
└── yt-proxy/
    ├── server.mjs                     (the Node proxy)
    ├── start-local.ps1                (Fix B — start the proxy)
    ├── restart-tunnel.ps1             (Fix A — get fresh tunnel URL)
    ├── service.log                    (proxy stdout)
    ├── tunnel.log                     (the Windows-service tunnel's log; mostly errors right now)
    └── new-tunnel.log                 (the latest quick tunnel's log; created by restart-tunnel.ps1)
```
