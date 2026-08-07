param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Test-Command($Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "Watch Party local setup" -ForegroundColor Yellow

if (-not (Test-Command "node")) {
    throw "Node.js is required. Install Node.js and rerun this script."
}

if (-not (Test-Command "npm.cmd")) {
    throw "npm is required. Install Node.js/npm and rerun this script."
}

if (-not (Test-Command "java")) {
    throw "Java is required by Firebase Emulator Suite. Install Java and rerun this script."
}

Write-Host "Node: $(node --version)"
Write-Host "npm: $(npm.cmd --version)"
Write-Host "Java detected."

if ($Install -or -not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies locally..." -ForegroundColor Yellow
    npm.cmd install
}

$configPath = "watch-party/firebase-config.js"
if (-not (Test-Path $configPath)) {
    Copy-Item "watch-party/firebase-config.example.js" $configPath
    Write-Host "Created $configPath from example. It is local-only; fill emulator values if needed."
}

$excludePath = ".git/info/exclude"
$excludeLines = @("watch-party/firebase-config.js", "test-assets/")
foreach ($line in $excludeLines) {
    $current = if (Test-Path $excludePath) { Get-Content $excludePath -ErrorAction SilentlyContinue } else { @() }
    if ($current -notcontains $line) {
        Add-Content -Path $excludePath -Value $line
    }
}

foreach ($required in @("firebase.json", ".firebaserc", "firebase/database.rules.json")) {
    if (-not (Test-Path $required)) {
        throw "Missing required local Firebase file: $required"
    }
}

Write-Host ""
Write-Host "Local setup is ready. No deploy, commit, push, pull, merge, rebase, or PR operation was run." -ForegroundColor Green
Write-Host ""
Write-Host "Terminal 1:"
Write-Host 'npm run watch-party:emulators'
Write-Host ""
Write-Host "Terminal 2:"
Write-Host 'npm run watch-party:serve'
Write-Host ""
Write-Host "Browser:"
Write-Host "http://127.0.0.1:8080/watch-party/"
Write-Host ""
Write-Host "Emulator UI:"
Write-Host "http://127.0.0.1:4000"
