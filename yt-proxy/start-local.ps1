# Start the yt-proxy locally on Windows.
# Run with: powershell -ExecutionPolicy Bypass -File start-local.ps1
# Or just: .\start-local.ps1 (after Set-ExecutionPolicy RemoteSigned -Scope CurrentUser)

$env:SHARED_SECRET = "echonest-bg-K7r2v9XmQ3pL8nT4wY6jH1sD5aF0gB"
$env:ALLOWED_ORIGIN = "*"   # tightened to https://echonest-app.vercel.app after tunnel is live
$env:YTDLP_PATH = "C:\Users\Krishna\Downloads\yt-dlp\yt-dlp.exe"
$env:PORT = "8080"

Write-Host "Starting yt-proxy on http://localhost:8080" -ForegroundColor Cyan
Write-Host "  Health check:    http://localhost:8080/health" -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

node server.mjs
