$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$BackendPidFile = Join-Path $BackendDir ".server.pid"
$WorkerPidFile = Join-Path $BackendDir ".worker.pid"

function Read-Pid([string]$PidFile) {
    if (-not (Test-Path -LiteralPath $PidFile)) {
        return ""
    }
    return ((Get-Content -LiteralPath $PidFile | Select-Object -First 1) | Out-String).Trim()
}

function Test-PidRunning([string]$PidText) {
    [int]$processId = 0
    if (-not [int]::TryParse($PidText, [ref]$processId)) {
        return $false
    }
    return [bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

$backendPid = Read-Pid $BackendPidFile
$workerPid = Read-Pid $WorkerPidFile
$listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$redisStatus = "unknown"

Push-Location $BackendDir
try {
    $raw = cmd /c "docker compose ps redis --format json 2>nul"
    if ($LASTEXITCODE -eq 0 -and $raw) {
        $redisStatus = (($raw | Select-Object -Last 1) | Out-String).Trim()
    }
} finally {
    Pop-Location
}

Write-Host "Backend PID file : $backendPid"
Write-Host "Backend running  : $(Test-PidRunning $backendPid)"
Write-Host "8080 listening   : $([bool]$listener)"
Write-Host "Worker PID file  : $workerPid"
Write-Host "Worker running   : $(Test-PidRunning $workerPid)"
Write-Host "Redis status     : $redisStatus"

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8080/healthz" -Method Get -TimeoutSec 2
    Write-Host "Health payload   : $(($health | ConvertTo-Json -Compress))"
} catch {
    Write-Host "Health payload   : unavailable"
}
