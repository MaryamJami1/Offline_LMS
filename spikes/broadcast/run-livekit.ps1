# Starts livekit-server.exe for the broadcast spike using the settings in
# livekit.yaml plus LAN_IP and the API key/secret from .env, so the spike runs
# the same version and ports as infra/docker-compose.yml.
#
#   .\run-livekit.ps1        Ctrl+C to stop.

$ErrorActionPreference = 'Stop'

$exe = Join-Path $PSScriptRoot 'bin\livekit-server.exe'
$config = Join-Path $PSScriptRoot 'livekit.yaml'
$envFile = Join-Path $PSScriptRoot '.env'

if (-not (Test-Path $exe)) {
    throw "No livekit-server.exe at $exe. See the README section 'Get the LiveKit server'."
}
if (-not (Test-Path $envFile)) {
    throw "No .env at $envFile. Copy .env.example to .env and set LAN_IP."
}

$settings = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*(#|$)') { continue }
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim()
    }
}

foreach ($key in 'LAN_IP', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET') {
    if (-not $settings[$key]) { throw ".env is missing $key" }
}

$lanIp = $settings['LAN_IP']
if ($lanIp -eq '127.0.0.1' -or $lanIp -eq 'localhost') {
    throw "LAN_IP is $lanIp. It must be this PC's LAN address, or the student PC cannot connect."
}

# Passed as an env var rather than on the command line so the secret stays out
# of the process list.
$env:LIVEKIT_KEYS = "$($settings['LIVEKIT_API_KEY']): $($settings['LIVEKIT_API_SECRET'])"

Write-Host ""
Write-Host "  LiveKit 1.13.11 ->  ws://${lanIp}:7880" -ForegroundColor Cyan
Write-Host "  Put this in config.json on BOTH PCs as livekitWsUrl." -ForegroundColor DarkGray
Write-Host "  Allow it on Private networks if Windows Firewall asks. Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

& $exe --config $config --node-ip $lanIp
