param(
  [switch]$KeepDocker,
  [switch]$ResetDatabase
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "webservice/api"
$dbComposeFile = Join-Path $apiDir "docker-compose.db.yml"
$stateFile = Join-Path $repoRoot ".local-dev/processes.json"

function Invoke-Compose {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )

  Push-Location $WorkingDirectory
  try {
    & docker compose @Arguments
  }
  finally {
    Pop-Location
  }
}

if (Test-Path $stateFile) {
  $state = Get-Content -Raw -Path $stateFile | ConvertFrom-Json
  foreach ($processInfo in @($state.processes)) {
    if (-not $processInfo.pid) {
      continue
    }

    $existingProcess = Get-Process -Id $processInfo.pid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Stop-Process -Id $processInfo.pid -Force
    }
  }

  Remove-Item -Path $stateFile -Force
}

if (-not $KeepDocker) {
  Write-Host "Parando stack principal do GF-Shield..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments @("down")

  $dbDownArgs = @("-f", $dbComposeFile, "down")
  if ($ResetDatabase) {
    $dbDownArgs += "-v"
  }

  Write-Host "Parando banco local do webservice/api..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments $dbDownArgs
}

Write-Host "Ambiente encerrado."
