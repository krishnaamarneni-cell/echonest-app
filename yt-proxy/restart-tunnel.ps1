# EchoNest — restart Cloudflare quick tunnel for the local yt-proxy.
# Run this WHEN downloads / playback / search start failing in production
# ("music proxy may be offline", song downloads fail, background play stops).
#
# It kills any stale cloudflared processes, spins up a fresh quick tunnel,
# prints the new public URL, and copies it to your clipboard.
#
# After running, paste the URL into Vercel and redeploy (instructions printed
# at the end).
#
# Usage (PowerShell, in this folder):
#   .\restart-tunnel.ps1
#   .\restart-tunnel.ps1 -SkipChecks   # if you know yt-dlp / proxy are fine

param([switch]$SkipChecks)

$ErrorActionPreference = "Stop"

$YTDLP = "C:\Users\Krishna\Downloads\yt-dlp\yt-dlp.exe"
$CFD   = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$LOG   = Join-Path $PSScriptRoot "new-tunnel.log"

function Write-Step($n, $msg) { Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)        { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Bad($msg)       { Write-Host "    XX  $msg" -ForegroundColor Red }
function Write-Hint($msg)      { Write-Host "        $msg" -ForegroundColor Yellow }

# ---- 1) Prerequisite checks ------------------------------------------------
if (-not $SkipChecks) {
  Write-Step "1/4" "Checking prerequisites"

  if (-not (Test-Path $YTDLP)) {
    Write-Bad "yt-dlp.exe missing at $YTDLP"
    Write-Hint "Fix: download yt-dlp.exe to that exact path."
    Write-Hint "     iwr 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile '$YTDLP'"
    exit 1
  }
  Write-Ok "yt-dlp.exe present"

  if (-not (Test-Path $CFD)) {
    Write-Bad "cloudflared.exe missing at $CFD"
    Write-Hint "Install from https://github.com/cloudflare/cloudflared/releases"
    exit 1
  }
  Write-Ok "cloudflared.exe present"

  try {
    $r = Invoke-WebRequest -Uri "http://localhost:8080/health" -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 200) { Write-Ok "local proxy alive on :8080" }
  } catch {
    Write-Bad "local proxy NOT running on :8080"
    Write-Hint "Fix: open another PowerShell in this folder and run:  .\start-local.ps1"
    Write-Hint "     (keep that window open; come back here and re-run me)"
    exit 1
  }
}

# ---- 2) Kill stale cloudflared processes -----------------------------------
Write-Step "2/4" "Stopping any old cloudflared processes"
$old = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($old) {
  $old | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
  Write-Ok "stopped $($old.Count) process(es)"
} else {
  Write-Ok "none running"
}

# ---- 3) Spawn fresh quick tunnel -------------------------------------------
Write-Step "3/4" "Starting fresh Cloudflare quick tunnel"
Remove-Item $LOG -ErrorAction SilentlyContinue
Start-Process -FilePath $CFD `
  -ArgumentList "tunnel --url http://localhost:8080" `
  -RedirectStandardOutput $LOG `
  -RedirectStandardError "$LOG.err" `
  -WindowStyle Hidden

Write-Host "    waiting for URL..." -ForegroundColor Gray
$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep 1
  if (Test-Path $LOG) {
    $m = Select-String -Path $LOG -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value; break }
    $m2 = Select-String -Path "$LOG.err" -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m2) { $url = $m2.Matches[0].Value; break }
  }
}

if (-not $url) {
  Write-Bad "could not get tunnel URL within 40s — check $LOG and $LOG.err"
  exit 1
}

# ---- 4) Verify the new tunnel actually serves the audio endpoint -----------
Write-Step "4/4" "Verifying tunnel serves /audio (CORS + 206 Partial Content)"
Start-Sleep 3
$secret = "echonest-bg-K7r2v9XmQ3pL8nT4wY6jH1sD5aF0gB"
try {
  $resp = Invoke-WebRequest -Uri "$url/audio/jefPa3v3SWY?s=$secret" `
    -Headers @{ "Range" = "bytes=0-0" } -TimeoutSec 30 -UseBasicParsing
  if ($resp.StatusCode -eq 206 -or $resp.StatusCode -eq 200) {
    Write-Ok "audio endpoint returned $($resp.StatusCode)"
  } else {
    Write-Bad "unexpected status $($resp.StatusCode)"
  }
} catch {
  Write-Bad "audio probe failed: $($_.Exception.Message)"
  Write-Hint "Tunnel is up but audio path failed — usually means yt-dlp can't resolve."
}

# ---- Done — print the URL and next steps -----------------------------------
Write-Host ""
Write-Host "  NEW TUNNEL URL:" -ForegroundColor Green
Write-Host "    $url" -ForegroundColor White -BackgroundColor DarkGreen
Write-Host ""
try { $url | Set-Clipboard; Write-Host "  (copied to clipboard)" -ForegroundColor Gray } catch {}
Write-Host ""
Write-Host "NEXT STEPS — update Vercel so the deployed app uses the new URL:" -ForegroundColor Yellow
Write-Host "  1. https://vercel.com/dashboard  ->  echonest-app"
Write-Host "  2. Settings  ->  Environment Variables"
Write-Host "  3. Edit  NEXT_PUBLIC_YT_PROXY_URL  =  $url"
Write-Host "  4. Deployments  ->  latest  ->  the  ...  menu  ->  Redeploy"
Write-Host "     (must redeploy; NEXT_PUBLIC_* is baked at BUILD time, not runtime)"
Write-Host ""
Write-Host "The new cloudflared is running in the background." -ForegroundColor Gray
Write-Host "To stop the tunnel:   Get-Process cloudflared | Stop-Process -Force" -ForegroundColor Gray
Write-Host "Log file:             $LOG" -ForegroundColor Gray
