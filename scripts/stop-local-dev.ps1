param(
  [switch]$KeepDocker,
  [switch]$ResetDatabase,
  [switch]$ResetNodeVolumes
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$repoName = Split-Path -Leaf $repoRoot
$composeProjectName = (($repoName.ToLowerInvariant() -replace "[^a-z0-9]+", "-") -replace "^-+", "") -replace "-+$", ""
$apiDir = Join-Path $repoRoot "webservice/api"
$rootComposeFile = Join-Path $repoRoot "docker-compose.yml"
$rootPresetComposeFile = Join-Path $repoRoot "docker-compose.local.yml"
$dbComposeFile = Join-Path $apiDir "docker-compose.db.yml"
$dbPresetComposeFile = Join-Path $apiDir "docker-compose.db.local.yml"
$stateFile = Join-Path $repoRoot ".local-dev/processes.json"
$bashStateFile = Join-Path $repoRoot ".local-dev/processes.env"
$defaultDockerContainers = @(
  "$composeProjectName-api-dev-local",
  "$composeProjectName-front-dev-local"
)

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

function Remove-DockerContainerIfExists {
  param(
    [string]$Name
  )

  if (-not $Name) {
    return
  }

  $existing = & docker ps -a --format "{{.Names}}" 2>$null | Where-Object { $_ -eq $Name }
  if ($existing) {
    & docker rm -f $Name 2>$null | Out-Null
  }
}

function Remove-DockerVolumeIfExists {
  param(
    [string]$Name
  )

  if (-not $Name) {
    return
  }

  $existing = & docker volume ls --format "{{.Name}}" 2>$null | Where-Object { $_ -eq $Name }
  if ($existing) {
    & docker volume rm $Name 2>$null | Out-Null
  }
}

function Stop-BashManagedProcesses {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return
  }

  $content = Get-Content -Path $Path
  foreach ($line in $content) {
    if ($line -match "^(API_PID|FRONT_PID)='?([^']+)'?$") {
      $managedPid = $matches[2]
      if (-not $managedPid) {
        continue
      }

      $existingProcess = Get-Process -Id $managedPid -ErrorAction SilentlyContinue
      if ($existingProcess) {
        Stop-Process -Id $managedPid -Force -ErrorAction SilentlyContinue
        continue
      }

      $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
      if ($wsl) {
        & $wsl.Source bash -lc "kill $managedPid >/dev/null 2>&1 || true" *> $null
      }
    }
  }

  Remove-Item -Path $Path -Force
}

$state = $null
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

  foreach ($containerInfo in @($state.dockerContainers)) {
    if ($containerInfo.name) {
      Remove-DockerContainerIfExists -Name $containerInfo.name
    }
  }

  if ($ResetNodeVolumes) {
    foreach ($volumeName in @($state.dockerVolumes)) {
      Remove-DockerVolumeIfExists -Name $volumeName
    }
  }

  Remove-Item -Path $stateFile -Force
}

Stop-BashManagedProcesses -Path $bashStateFile

foreach ($containerName in $defaultDockerContainers) {
  Remove-DockerContainerIfExists -Name $containerName
}

if (-not $KeepDocker) {
  Write-Host "Parando stack principal do GF-Shield..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments @("-f", $rootComposeFile, "-f", $rootPresetComposeFile, "down")

  $dbDownArgs = @("-f", $dbComposeFile, "-f", $dbPresetComposeFile, "down")
  if ($ResetDatabase) {
    $dbDownArgs += "-v"
  }

  Write-Host "Parando banco local do webservice/api..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments $dbDownArgs
}

Write-Host "Ambiente encerrado."
