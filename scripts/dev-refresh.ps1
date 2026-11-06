# Brings a developer laptop up to date after a pull request is merged
# (docs/docs/07-installation.md, Running the server and the admin panel on a
# developer laptop): pulls main, installs, builds, migrates the development
# database, and prints the commands that restart what is running.
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-refresh.ps1
#
# It stops at the first step that fails. The stack (PostgreSQL, LiveKit,
# Caddy) must be up for the migration:
#   docker compose -f infra/docker-compose.yml up -d

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Invoke-Step([string] $Name, [scriptblock] $Command) {
  Write-Host ''
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Stopped: '$Name' failed (exit code $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

# Uncommitted work would be carried onto main or block the switch: stop first.
$changes = git status --porcelain
if ($changes) {
  Write-Host 'There are uncommitted changes. Commit or stash them, then run this again:' -ForegroundColor Red
  $changes | ForEach-Object { Write-Host "  $_" }
  exit 1
}

if ((git branch --show-current) -ne 'main') {
  Invoke-Step 'Switch to main' { git switch main }
}
Invoke-Step 'Pull main' { git pull --ff-only }
Invoke-Step 'Install dependencies' { pnpm install }
Invoke-Step 'Build' { pnpm build }
Invoke-Step 'Migrate the development database' { pnpm --filter @lingualab/server db:migrate }

$running = Get-NetTCPConnection -State Listen -LocalPort 3000, 4173 -ErrorAction SilentlyContinue
Write-Host ''
Write-Host 'Up to date. Restart what is running so it uses the new build:' -ForegroundColor Green
if ($running) {
  Write-Host '  (something is still listening on port 3000 or 4173: stop it with Ctrl+C in its window first)' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  Server, in its own window (http://localhost:3000):'
Write-Host "    `$env:JWT_SECRET = '<at least 32 characters>'; pnpm --filter @lingualab/server start"
Write-Host ''
Write-Host '  Admin panel, in its own window (http://localhost:4173):'
Write-Host '    pnpm --filter @lingualab/admin preview'
Write-Host ''
Write-Host '  Student app, if you use it (an ordinary window, not kiosk):'
Write-Host '    pnpm --filter @lingualab/student dev'
