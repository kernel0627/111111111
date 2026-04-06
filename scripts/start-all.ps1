param(
    [switch]$Reseed,
    [switch]$RebuildRecommendations,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$BackendBinDir = Join-Path $BackendDir "bin"
$BackendExe = Join-Path $BackendBinDir "backend-server.exe"
$LogsDir = Join-Path $BackendDir "logs"
$BackendPidFile = Join-Path $BackendDir ".server.pid"
$WorkerPidFile = Join-Path $BackendDir ".worker.pid"
$BackendStdout = Join-Path $LogsDir "backend.out.log"
$BackendStderr = Join-Path $LogsDir "backend.err.log"
$WorkerStdout = Join-Path $LogsDir "recommender.out.log"
$WorkerStderr = Join-Path $LogsDir "recommender.err.log"

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Remove-FileIfExists([string]$Path) {
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function Stop-ProcessIfRunning([int]$ProcessIdToStop) {
    if ($ProcessIdToStop -le 0) {
        return
    }
    $process = Get-Process -Id $ProcessIdToStop -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $ProcessIdToStop -Force -ErrorAction SilentlyContinue
    }
}

function Stop-FromPidFile([string]$PidFile) {
    if (-not (Test-Path -LiteralPath $PidFile)) {
        return
    }
    $raw = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    [int]$processId = 0
    if ([int]::TryParse(($raw | Out-String).Trim(), [ref]$processId)) {
        Stop-ProcessIfRunning $processId
    }
    Remove-FileIfExists $PidFile
}

function Stop-Listener8080 {
    $listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

function Resolve-CondaExe {
    $cmd = Get-Command conda -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        return $cmd.Source
    }
    $candidates = @(
        "E:\\conda\\Scripts\\conda.exe",
        "$env:USERPROFILE\\miniconda3\\Scripts\\conda.exe",
        "$env:USERPROFILE\\anaconda3\\Scripts\\conda.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    throw "conda was not found. Please make sure homework_env exists."
}

function Resolve-WorkerPython([string]$CondaExe) {
    $condaRoot = Split-Path -Parent (Split-Path -Parent $CondaExe)
    $candidates = @(
        (Join-Path $condaRoot "envs\\homework_env\\python.exe"),
        "E:\\conda\\envs\\homework_env\\python.exe",
        "$env:USERPROFILE\\miniconda3\\envs\\homework_env\\python.exe",
        "$env:USERPROFILE\\anaconda3\\envs\\homework_env\\python.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    $pythonExe = & $CondaExe env list --json | ConvertFrom-Json
    $resolved = $pythonExe.envs | Where-Object { $_ -like "*\\envs\\homework_env" } | Select-Object -First 1
    if (-not $resolved) {
        throw "failed to resolve homework_env python"
    }
    return (Join-Path $resolved "python.exe")
}

function Start-LoggedProcess([string]$FilePath, [string[]]$ArgumentList, [string]$WorkingDirectory, [string]$StdoutPath, [string]$StderrPath) {
    Remove-FileIfExists $StdoutPath
    Remove-FileIfExists $StderrPath
    if ($ArgumentList -and $ArgumentList.Count -gt 0) {
        return Start-Process -FilePath $FilePath `
            -ArgumentList $ArgumentList `
            -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $StdoutPath `
            -RedirectStandardError $StderrPath `
            -WindowStyle Hidden `
            -PassThru
    }
    return Start-Process -FilePath $FilePath `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath `
        -WindowStyle Hidden `
        -PassThru
}

function Wait-BackendHealthy {
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:8080/healthz" -Method Get -TimeoutSec 2
            if ($response.ok -eq $true) {
                return
            }
        } catch {
        }
    }
    throw "backend did not become healthy on :8080 within 30 seconds"
}

Ensure-Directory $LogsDir
Ensure-Directory (Join-Path $RepoRoot ".gocache")
Ensure-Directory (Join-Path $RepoRoot ".gocache\\tmp")
Ensure-Directory (Join-Path $RepoRoot ".gomodcache")
Ensure-Directory (Join-Path $RepoRoot ".hf")
Ensure-Directory (Join-Path $RepoRoot ".hf\\transformers")
Ensure-Directory $BackendBinDir

$env:GOCACHE = Join-Path $RepoRoot ".gocache"
$env:GOTMPDIR = Join-Path $RepoRoot ".gocache\\tmp"
$env:GOMODCACHE = Join-Path $RepoRoot ".gomodcache"
$env:BACKEND_ADDR = ":8080"
$env:USE_REDIS = "true"
$env:REDIS_ADDR = "127.0.0.1:6379"
$env:HW_BACKEND_DIR = $BackendDir
$env:PYTHONPATH = $BackendDir
$env:HF_HOME = Join-Path $RepoRoot ".hf"
$env:TRANSFORMERS_CACHE = Join-Path $RepoRoot ".hf\\transformers"
$env:REC_DEVICE = "cuda"

Push-Location $BackendDir
try {
    Write-Host "[1/6] starting redis..."
    docker compose up -d redis | Out-Host

    Write-Host "[2/6] resolving homework_env..."
    $condaExe = Resolve-CondaExe
    $workerPython = Resolve-WorkerPython $condaExe

    if (-not $SkipBuild) {
        Write-Host "[3/6] building backend..."
        & go build -o $BackendExe ./cmd/server
        if ($LASTEXITCODE -ne 0) {
            throw "go build failed"
        }
    } else {
        Write-Host "[3/6] skipping backend build..."
    }

    if ($Reseed) {
        Write-Host "[4/6] reseeding database..."
        & go run ./cmd/seed-full -reset=true
        if ($LASTEXITCODE -ne 0) {
            throw "seed-full failed"
        }
    } else {
        Write-Host "[4/6] skipping reseed..."
    }

    if ($Reseed -or $RebuildRecommendations) {
        Write-Host "[5/6] rebuilding recommendation artifacts..."
        & $workerPython -m recommender.rebuild_all --device $env:REC_DEVICE
        if ($LASTEXITCODE -ne 0) {
            throw "recommendation rebuild failed"
        }
    } else {
        Write-Host "[5/6] skipping offline recommendation rebuild..."
    }

    Write-Host "[6/6] starting backend and recommender worker..."
    Stop-FromPidFile $WorkerPidFile
    Stop-FromPidFile $BackendPidFile
    Stop-Listener8080

    $backendProc = Start-LoggedProcess `
        -FilePath $BackendExe `
        -ArgumentList @() `
        -WorkingDirectory $BackendDir `
        -StdoutPath $BackendStdout `
        -StderrPath $BackendStderr
    Set-Content -LiteralPath $BackendPidFile -Value $backendProc.Id

    $workerProc = Start-LoggedProcess `
        -FilePath $workerPython `
        -ArgumentList @("-m", "recommender.worker") `
        -WorkingDirectory $BackendDir `
        -StdoutPath $WorkerStdout `
        -StderrPath $WorkerStderr
    Set-Content -LiteralPath $WorkerPidFile -Value $workerProc.Id

    Wait-BackendHealthy

    Write-Host ""
    Write-Host "All services are up."
    Write-Host "Backend PID : $($backendProc.Id)"
    Write-Host "Worker PID  : $($workerProc.Id)"
    Write-Host "Health URL  : http://127.0.0.1:8080/healthz"
    Write-Host "Logs        : $LogsDir"
} finally {
    Pop-Location
}
