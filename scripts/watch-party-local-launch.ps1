$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "Dependencies are missing. Run scripts/watch-party-local-setup.ps1 -Install first." -ForegroundColor Yellow
    exit 1
}

$emulatorCommand = "cd `"$root`"; npm run watch-party:emulators"
$serverCommand = "cd `"$root`"; npm run watch-party:serve"

Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $emulatorCommand
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $serverCommand

Write-Host "Started two local terminals:"
Write-Host "Firebase Emulators: http://127.0.0.1:4000"
Write-Host "Static server: http://127.0.0.1:8080/watch-party/"
