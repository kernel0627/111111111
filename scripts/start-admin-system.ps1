param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$AdminWebDir = Join-Path $RepoRoot "admin-web"
$CacheDir = Join-Path $RepoRoot ".gocache"
$TmpDir = Join-Path $CacheDir "tmp"
$ModCacheDir = Join-Path $RepoRoot ".gomodcache"
$BackendBinDir = Join-Path $BackendDir "bin"
$BackendExe = Join-Path $BackendBinDir "backend-server.exe"

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Wait-BackendHealthy {
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:8080/healthz" -Method Get -TimeoutSec 2
            if ($response.ok -eq $true) {
                return $true
            }
        } catch {
        }
    }
    return $false
}

Ensure-Directory $CacheDir
Ensure-Directory $TmpDir
Ensure-Directory $ModCacheDir
Ensure-Directory $BackendBinDir

$listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    throw "port 8080 is already in use. Please stop the existing backend before starting the admin stack."
}

$env:GOCACHE = $CacheDir
$env:GOTMPDIR = $TmpDir
$env:GOMODCACHE = $ModCacheDir

Push-Location $BackendDir
try {
    if (-not $SkipBuild) {
        Write-Host "[1/3] building backend..."
        & go build -o $BackendExe ./cmd/server
        if ($LASTEXITCODE -ne 0) {
            throw "go build failed"
        }
    } elseif (-not (Test-Path -LiteralPath $BackendExe)) {
        throw "backend binary not found. Run without -SkipBuild first."
    } else {
        Write-Host "[1/3] skipping backend build..."
    }
} finally {
    Pop-Location
}

$backendCommand = @"
Set-Location '$BackendDir'
`$env:GOCACHE = '$CacheDir'
`$env:GOTMPDIR = '$TmpDir'
`$env:GOMODCACHE = '$ModCacheDir'
if (-not `$env:BACKEND_ADDR) { `$env:BACKEND_ADDR = ':8080' }
if (-not `$env:USE_REDIS) { `$env:USE_REDIS = 'false' }
& '$BackendExe'
"@

$adminCommand = @"
Set-Location '$AdminWebDir'
npm run dev
"@

Write-Host "[2/3] starting backend window..."
Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand) `
    -WorkingDirectory $BackendDir | Out-Null

Write-Host "[3/3] starting admin-web window..."
Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $adminCommand) `
    -WorkingDirectory $AdminWebDir | Out-Null

if (Wait-BackendHealthy) {
    Write-Host ""
    Write-Host "Admin stack is up."
    Write-Host "Backend entry  : backend/cmd/server/main.go"
    Write-Host "Backend health : http://127.0.0.1:8080/healthz"
    Write-Host "Backend binary : $BackendExe"
} else {
    Write-Warning "backend did not become healthy on :8080 within 30 seconds"
}
