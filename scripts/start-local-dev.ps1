param(
  [ValidateSet("Real", "Mock")]
  [string]$AuthMode = "Real",
  [switch]$Rebuild,
  [switch]$DispatchSampleRun,
  [switch]$SkipInstall,
  [int]$ApiPort = 4000,
  [int]$FrontendPort = 3000,
  [string]$PublicFrontOrigin = "",
  [string]$CorsOrigins = "",
  [string]$ApiHealthcheckUrl = "",
  [string]$DevNodeImage = $env:DEV_NODE_IMAGE,
  [int]$MaxGenerations = 2,
  [int]$RclCutoff = 30,
  [int]$SampleSize = 5,
  [string]$TrainDataset = "ereno1ktrain.arff",
  [string]$TestDataset = "ereno1ktest.arff",
  [string]$Classifier = "J48",
  [ValidateSet("VND", "RVND")]
  [string]$NeighborhoodStrategy = "VND",
  [string[]]$LocalSearches = @("BIT_FLIP", "IWSS", "IWSSR")
)

$ErrorActionPreference = "Stop"

function Get-NormalizedProjectName {
  param(
    [string]$Name
  )

  return (($Name.ToLowerInvariant() -replace "[^a-z0-9]+", "-") -replace "^-+", "") -replace "-+$", ""
}

function Resolve-RepoRootPath {
  param(
    [string]$Path
  )

  $item = Get-Item -LiteralPath $Path
  if ($item.LinkType -and $item.Target) {
    return [string]($item.Target | Select-Object -First 1)
  }

  return $item.FullName
}

$scriptRepoRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Resolve-RepoRootPath -Path $scriptRepoRoot
$repoName = Split-Path -Leaf $repoRoot
$composeProjectName = Get-NormalizedProjectName -Name $repoName
$legacyRepoName = Split-Path -Leaf $scriptRepoRoot
$legacyComposeProjectName = Get-NormalizedProjectName -Name $legacyRepoName
$apiDir = Join-Path $repoRoot "webservice/api"
$frontDir = Join-Path $repoRoot "webservice/front"
$datasetsDir = Join-Path $repoRoot "datasets"
$rootComposeFile = Join-Path $repoRoot "docker-compose.yml"
$rootPresetComposeFile = Join-Path $repoRoot "docker-compose.local.yml"
$dbComposeFile = Join-Path $apiDir "docker-compose.db.yml"
$dbPresetComposeFile = Join-Path $apiDir "docker-compose.db.local.yml"
$stateDir = Join-Path $repoRoot ".local-dev"
$stateFile = Join-Path $stateDir "processes.json"
$bashStateFile = Join-Path $stateDir "processes.env"
$apiContainerName = "$composeProjectName-api-dev-local"
$frontContainerName = "$composeProjectName-front-dev-local"
$legacyApiContainerName = if ($legacyComposeProjectName -and $legacyComposeProjectName -ne $composeProjectName) { "$legacyComposeProjectName-api-dev-local" } else { $null }
$legacyFrontContainerName = if ($legacyComposeProjectName -and $legacyComposeProjectName -ne $composeProjectName) { "$legacyComposeProjectName-front-dev-local" } else { $null }
$apiNodeModulesVolume = "$composeProjectName-api-node-modules-local"
$frontNodeModulesVolume = "$composeProjectName-front-node-modules-local"
$apiHomeVolume = "$composeProjectName-api-home-local"
$frontHomeVolume = "$composeProjectName-front-home-local"
$apiCacheVolume = "$composeProjectName-api-cache-local"
$frontCacheVolume = "$composeProjectName-front-cache-local"
$composeNetworkName = "$composeProjectName`_default"
$useDockerNode = -not [string]::IsNullOrWhiteSpace($DevNodeImage)

function Get-NpmCommand {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) {
    return $npm.Source
  }

  $fallback = "D:\Program Files\Node\npm.cmd"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "npm.cmd nao encontrado. Instale o Node.js ou ajuste o PATH."
}

function Invoke-Compose {
  param(
    [string]$WorkingDirectory,
    [string[]]$Arguments,
    [string]$ProjectName = ""
  )

  Push-Location $WorkingDirectory
  try {
    if ($ProjectName) {
      & docker compose -p $ProjectName @Arguments
      return
    }

    & docker compose @Arguments
  }
  finally {
    Pop-Location
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
      return
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Tempo esgotado aguardando $Url"
}

function Wait-ForTcpPort {
  param(
    [string]$ComputerName = "localhost",
    [int]$Port,
    [int]$TimeoutSeconds = 240
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $tcpClient = $null
    try {
      $tcpClient = New-Object System.Net.Sockets.TcpClient
      $asyncResult = $tcpClient.BeginConnect($ComputerName, $Port, $null, $null)
      if ($asyncResult.AsyncWaitHandle.WaitOne(2000, $false) -and $tcpClient.Connected) {
        $tcpClient.EndConnect($asyncResult)
        return
      }
    }
    catch {
    }
    finally {
      if ($tcpClient) {
        $tcpClient.Dispose()
      }
    }

    Start-Sleep -Seconds 2
  }

  throw "Tempo esgotado aguardando ${ComputerName}:$Port"
}

function Invoke-SampleRun {
  param(
    [string]$BaseUrl
  )

  $payload = @{
    algorithms = @("IG", "GR", "RF", "SU")
    maxGenerations = $MaxGenerations
    rclCutoff = $RclCutoff
    sampleSize = $SampleSize
    datasetTrainingName = $TrainDataset
    datasetTestingName = $TestDataset
    classifier = $Classifier
    neighborhoodStrategy = $NeighborhoodStrategy
    localSearches = $LocalSearches
  } | ConvertTo-Json -Depth 4

  Invoke-RestMethod -Uri "$BaseUrl/api/grasp/run" -Method Post -ContentType "application/json" -Body $payload
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

function Print-ContainerLogs {
  param(
    [string]$Name,
    [int]$Lines = 60
  )

  if (-not $Name) {
    return
  }

  Write-Host ""
  Write-Host "Ultimas $Lines linhas de ${Name}:"
  & docker logs --tail $Lines $Name
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

function Stop-RecordedProcesses {
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

    Remove-Item -Path $stateFile -Force
  }

  Stop-BashManagedProcesses -Path $bashStateFile
}

function Start-ManagedShell {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand -WorkingDirectory $WorkingDirectory -PassThru

  return [PSCustomObject]@{
    name = $Name
    pid = $process.Id
    workingDirectory = $WorkingDirectory
  }
}

function Get-DockerNodeMounts {
  param(
    [string]$WorkingDirectory,
    [string]$NodeModulesVolume,
    [string]$HomeVolume,
    [string]$CacheVolume
  )

  return @(
    "${WorkingDirectory}:/workspace"
    "${NodeModulesVolume}:/workspace/node_modules"
    "${HomeVolume}:/tmp/codex-home"
    "${CacheVolume}:/tmp/codex-npm-cache"
  )
}

function Invoke-DockerNodeInstall {
  param(
    [string]$Image,
    [string]$WorkingDirectory,
    [string]$NodeModulesVolume,
    [string]$HomeVolume,
    [string]$CacheVolume,
    [string]$RequiredBinary
  )

  $installScript = @"
set -e
if [ ! -x '$RequiredBinary' ]; then
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
fi
"@

  $arguments = @(
    "run", "--rm",
    "-v", "${WorkingDirectory}:/workspace",
    "-v", "${NodeModulesVolume}:/workspace/node_modules",
    "-v", "${HomeVolume}:/tmp/codex-home",
    "-v", "${CacheVolume}:/tmp/codex-npm-cache",
    "-w", "/workspace",
    "-e", "HOME=/tmp/codex-home",
    "-e", "npm_config_cache=/tmp/codex-npm-cache",
    $Image,
    "bash", "-lc", $installScript
  )

  & docker @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao instalar dependencias em container para $WorkingDirectory"
  }
}

function Start-DockerNodeContainer {
  param(
    [string]$Name,
    [string]$Image,
    [string]$WorkingDirectory,
    [string[]]$Mounts,
    [hashtable]$Environment,
    [string[]]$PublishedPorts,
    [string]$NetworkName = "",
    [string]$ShellCommand
  )

  Remove-DockerContainerIfExists -Name $Name

  $arguments = @("run", "-d", "--name", $Name)

  if ($NetworkName) {
    $arguments += @("--network", $NetworkName)
  }

  foreach ($port in $PublishedPorts) {
    $arguments += @("-p", $port)
  }

  foreach ($mount in $Mounts) {
    $arguments += @("-v", $mount)
  }

  foreach ($entry in $Environment.GetEnumerator()) {
    $arguments += @("-e", ("{0}={1}" -f $entry.Key, $entry.Value))
  }

  $arguments += @(
    "-w", "/workspace",
    $Image,
    "bash", "-lc", $ShellCommand
  )

  $containerId = & docker @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao iniciar container $Name"
  }

  return $containerId.Trim()
}

if ([string]::IsNullOrWhiteSpace($CorsOrigins)) {
  $CorsOrigins = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort,http://localhost:$ApiPort"
  if (-not [string]::IsNullOrWhiteSpace($PublicFrontOrigin)) {
    $CorsOrigins = "$CorsOrigins,$PublicFrontOrigin"
  }
}

if ([string]::IsNullOrWhiteSpace($ApiHealthcheckUrl)) {
  $ApiHealthcheckUrl = "http://localhost:$ApiPort/api-docs"
}

$npmCommand = if ($useDockerNode) { $null } else { Get-NpmCommand }
$useMockAuth = $AuthMode -eq "Mock"
$apiAuthDisabled = if ($useMockAuth) { "true" } else { "false" }
$apiMockDataEnabled = if ($useMockAuth) { "true" } else { "false" }
$frontAuthDisabled = if ($useMockAuth) { "true" } else { "false" }

if (-not (Test-Path $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir | Out-Null
}

Stop-RecordedProcesses
Remove-DockerContainerIfExists -Name $apiContainerName
Remove-DockerContainerIfExists -Name $frontContainerName
Remove-DockerContainerIfExists -Name $legacyApiContainerName
Remove-DockerContainerIfExists -Name $legacyFrontContainerName

if ($legacyComposeProjectName -and $legacyComposeProjectName -ne $composeProjectName) {
  Write-Host "Encerrando stack compose legada ($legacyComposeProjectName)..."
  Invoke-Compose -WorkingDirectory $repoRoot -Arguments @("-f", $rootComposeFile, "-f", $rootPresetComposeFile, "down") -ProjectName $legacyComposeProjectName
}

$rootComposeArgs = @("-f", $rootComposeFile, "-f", $rootPresetComposeFile, "up", "-d")
if ($Rebuild) {
  $rootComposeArgs += "--build"
}

Write-Host "Subindo stack principal do G-FShield..."
Invoke-Compose -WorkingDirectory $repoRoot -Arguments $rootComposeArgs -ProjectName $composeProjectName

Write-Host "Subindo banco local do webservice/api..."
Invoke-Compose -WorkingDirectory $repoRoot -Arguments @("-f", $dbComposeFile, "-f", $dbPresetComposeFile, "up", "-d")

$state = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  authMode = $AuthMode
  processes = @()
  dockerContainers = @()
  dockerVolumes = @()
}

if ($useDockerNode) {
  $apiMounts = Get-DockerNodeMounts -WorkingDirectory $apiDir -NodeModulesVolume $apiNodeModulesVolume -HomeVolume $apiHomeVolume -CacheVolume $apiCacheVolume
  $apiMounts += @(
    "${repoRoot}:/workspace-root"
    "${datasetsDir}:/datasets"
    "/var/run/docker.sock:/var/run/docker.sock"
  )

  $frontMounts = Get-DockerNodeMounts -WorkingDirectory $frontDir -NodeModulesVolume $frontNodeModulesVolume -HomeVolume $frontHomeVolume -CacheVolume $frontCacheVolume

  if (-not $SkipInstall) {
    Write-Host "Instalando dependencias de webservice/api em container..."
    Invoke-DockerNodeInstall -Image $DevNodeImage -WorkingDirectory $apiDir -NodeModulesVolume $apiNodeModulesVolume -HomeVolume $apiHomeVolume -CacheVolume $apiCacheVolume -RequiredBinary "node_modules/.bin/nodemon"

    Write-Host "Instalando dependencias de webservice/front em container..."
    Invoke-DockerNodeInstall -Image $DevNodeImage -WorkingDirectory $frontDir -NodeModulesVolume $frontNodeModulesVolume -HomeVolume $frontHomeVolume -CacheVolume $frontCacheVolume -RequiredBinary "node_modules/.bin/react-scripts"
  }

  $apiEnvironment = @{
    HOME = "/tmp/codex-home"
    npm_config_cache = "/tmp/codex-npm-cache"
    API_PORT = "$ApiPort"
    AUTH_DISABLED = $apiAuthDisabled
    MOCK_DATA_ENABLED = $apiMockDataEnabled
    CORS_ORIGINS = $CorsOrigins
    GRASP_DATASETS_DIR = "/datasets"
    GF_SHIELD_PROJECT_ROOT = "/workspace-root"
    GF_SHIELD_METRICS_DIR = "/workspace-root/metrics"
    GF_SHIELD_DOCKER_BIN = "/usr/bin/docker"
    GF_SHIELD_COMPOSE_PROJECT_NAME = $composeProjectName
    GF_SHIELD_COMPOSE_FILES = "docker-compose.yml,docker-compose.local.yml"
    KAFKA_BROKERS = "kafka:29092"
    DATABASE_URL = "postgresql://postgres:password@host.docker.internal:5432/g-fshield?schema=public"
    GRASP_FS_IG_URL = "http://grasp-fs-rcl-ig:8089"
    GRASP_FS_GR_URL = "http://grasp-fs-rcl-gr:8088"
    GRASP_FS_RF_URL = "http://grasp-fs-rcl-rf:8086"
    GRASP_FS_SU_URL = "http://grasp-fs-rcl-su:8087"
  }

  $frontEnvironment = @{
    HOME = "/tmp/codex-home"
    npm_config_cache = "/tmp/codex-npm-cache"
    PORT = "$FrontendPort"
    HOST = "0.0.0.0"
    BROWSER = "none"
    CHOKIDAR_USEPOLLING = "true"
    WATCHPACK_POLLING = "true"
    REACT_APP_API_URL = "http://localhost:$ApiPort/api"
    REACT_APP_AUTH_DISABLED = $frontAuthDisabled
  }

  $apiShellCommand = @"
set -e
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update >/dev/null
  apt-get install -y --no-install-recommends ca-certificates curl docker.io >/dev/null
fi
if ! docker compose version >/dev/null 2>&1; then
  mkdir -p "`$HOME/.docker/cli-plugins"
  curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" -o "`$HOME/.docker/cli-plugins/docker-compose"
  chmod +x "`$HOME/.docker/cli-plugins/docker-compose"
fi
npm run dev
"@

  $frontShellCommand = @"
set -e
npm start
"@

  Write-Host "Iniciando API local em container..."
  Start-DockerNodeContainer -Name $apiContainerName -Image $DevNodeImage -WorkingDirectory $apiDir -Mounts $apiMounts -Environment $apiEnvironment -PublishedPorts @("${ApiPort}:${ApiPort}") -NetworkName $composeNetworkName -ShellCommand $apiShellCommand | Out-Null

  Write-Host "Iniciando front local em container..."
  Start-DockerNodeContainer -Name $frontContainerName -Image $DevNodeImage -WorkingDirectory $frontDir -Mounts $frontMounts -Environment $frontEnvironment -PublishedPorts @("${FrontendPort}:${FrontendPort}") -ShellCommand $frontShellCommand | Out-Null

  $state.dockerContainers = @(
    [PSCustomObject]@{ name = $apiContainerName; role = "api" },
    [PSCustomObject]@{ name = $frontContainerName; role = "front" }
  )
  $state.dockerVolumes = @(
    $apiNodeModulesVolume,
    $frontNodeModulesVolume,
    $apiHomeVolume,
    $frontHomeVolume,
    $apiCacheVolume,
    $frontCacheVolume
  )
}
else {
  $apiCommand = @"
Set-Location '$apiDir'
`$env:API_PORT = '$ApiPort'
`$env:AUTH_DISABLED = '$apiAuthDisabled'
`$env:MOCK_DATA_ENABLED = '$apiMockDataEnabled'
`$env:CORS_ORIGINS = '$CorsOrigins'
& '$npmCommand' run dev
"@

  $frontCommand = @"
Set-Location '$frontDir'
`$env:BROWSER = 'none'
`$env:PORT = '$FrontendPort'
`$env:REACT_APP_API_URL = 'http://localhost:$ApiPort/api'
`$env:REACT_APP_AUTH_DISABLED = '$frontAuthDisabled'
& '$npmCommand' start
"@

  Write-Host "Abrindo API em nova janela..."
  $apiProcess = Start-ManagedShell -Name "webservice-api" -WorkingDirectory $apiDir -Command $apiCommand

  Write-Host "Abrindo front em nova janela..."
  $frontProcess = Start-ManagedShell -Name "webservice-front" -WorkingDirectory $frontDir -Command $frontCommand

  $state.processes = @($apiProcess, $frontProcess)
}

$state | ConvertTo-Json -Depth 4 | Set-Content -Path $stateFile

Write-Host "Aguardando API responder em $ApiHealthcheckUrl ..."
try {
  Wait-ForHttp -Url $ApiHealthcheckUrl
}
catch {
  if ($useDockerNode) {
    Print-ContainerLogs -Name $apiContainerName
    Print-ContainerLogs -Name $frontContainerName
  }

  throw
}

if ($DispatchSampleRun) {
  foreach ($port in @(8086, 8087, 8088, 8089)) {
    Write-Host "Aguardando servico DRG na porta $port ..."
    Wait-ForTcpPort -Port $port
  }

  Write-Host "Disparando execucao de exemplo pelo gateway..."
  $runResponse = Invoke-SampleRun -BaseUrl "http://localhost:$ApiPort"
  $runResponse | ConvertTo-Json -Depth 6
}

Write-Host ""
Write-Host "Ambiente iniciado."
Write-Host "Front: http://localhost:$FrontendPort"
Write-Host "API: http://localhost:$ApiPort"
Write-Host "Swagger: http://localhost:$ApiPort/api-docs"
Write-Host "Conduktor: http://localhost:8080"
Write-Host "Modo de autenticacao: $AuthMode"
if ($useDockerNode) {
  Write-Host "Node em Docker: $DevNodeImage"
}
