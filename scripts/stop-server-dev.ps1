param(
  [switch]$KeepDocker,
  [switch]$ResetDatabase
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "webservice/api"
$rootComposeFile = Join-Path $repoRoot "docker-compose.yml"
$rootPresetComposeFile = Join-Path $repoRoot "docker-compose.server.yml"
$dbComposeFile = Join-Path $apiDir "docker-compose.db.yml"
$dbPresetComposeFile = Join-Path $apiDir "docker-compose.db.server.yml"
$stateFile = Join-Path $repoRoot ".server-dev/processes.json"

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
  Write-Host "Parando stack server do GF-Shield..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments @("-f", $rootComposeFile, "-f", $rootPresetComposeFile, "down")

  $dbDownArgs = @("-f", $dbComposeFile, "-f", $dbPresetComposeFile, "down")
  if ($ResetDatabase) {
    $dbDownArgs += "-v"
  }

  Write-Host "Parando banco server do webservice/api..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments $dbDownArgs
}

Write-Host "Ambiente server encerrado."
