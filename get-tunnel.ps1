# Get fresh EchoNest tunnel URL after laptop reboot.
# Usage: .\get-tunnel.ps1

$logPath = "C:\Users\Krishna\OneDrive\Documents\Codes\echonest\yt-proxy\tunnel.log"

Get-Service EchoNestTunnel | Format-Table -AutoSize

$url = (Select-String -Path $logPath -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1).Matches.Value

if ($url) {
  Write-Host ""
  Write-Host "=== Current tunnel URL ===" -ForegroundColor Cyan
  Write-Host $url -ForegroundColor Green
  Write-Host ""
  Write-Host "Health check..." -ForegroundColor Gray
  try {
    $r = Invoke-WebRequest -Uri "$url/health" -TimeoutSec 8 -UseBasicParsing
    Write-Host "  OK $($r.StatusCode) - alive" -ForegroundColor Green
    Set-Clipboard $url
    Write-Host ""
    Write-Host "Copied to clipboard. Paste into Vercel." -ForegroundColor Yellow
  } catch {
    Write-Host "  DEAD - $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Tunnel may need a moment to come up. Wait 30s and re-run." -ForegroundColor Yellow
  }
} else {
  Write-Host "No URL found. Tunnel service may not have started yet - wait 30s." -ForegroundColor Yellow
}
