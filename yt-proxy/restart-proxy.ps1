# Restart the EchoNest proxy so code changes in server.mjs take effect.
#
# Node reads server.mjs once at process start, so editing the file does
# nothing until the service restarts. The service runs as LocalSystem, so
# this needs admin rights — the script elevates itself, just click Yes.
#
# Usage: right-click this file -> "Run with PowerShell"

$ErrorActionPreference = 'Stop'

# Re-launch elevated if we aren't already.
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "Elevating (click Yes on the UAC prompt)..." -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit',
    '-File', "`"$PSCommandPath`""
  )
  return
}

Write-Host "Restarting EchoNestProxy..." -ForegroundColor Cyan
Restart-Service EchoNestProxy -Force
Start-Sleep -Seconds 3

$svc = Get-Service EchoNestProxy
Write-Host "  service state: $($svc.Status)" -ForegroundColor Green

try {
  $h = Invoke-WebRequest -Uri 'http://localhost:8080/health' -TimeoutSec 10 -UseBasicParsing
  Write-Host "  health: $($h.StatusCode) $($h.Content)" -ForegroundColor Green
} catch {
  Write-Host "  health check FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  check yt-proxy\service.log for startup errors" -ForegroundColor Yellow
  return
}

Write-Host ""
Write-Host "Done. New code is live once you see 'chunked stream complete'" -ForegroundColor Cyan
Write-Host "in service.log after playing a song." -ForegroundColor Cyan
