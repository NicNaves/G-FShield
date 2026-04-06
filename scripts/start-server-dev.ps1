param(
  [ValidateSet("Real", "Mock")]
  [string]$AuthMode = "Real",
  [switch]$Rebuild,
  [switch]$DispatchSampleRun,
  [int]$ApiPort = 4000,
  [int]$FrontendPort = 3000,
  [string]$PublicFrontOrigin = "",
  [string]$CorsOrigins = "",
  [string]$ApiHealthcheckUrl = "",
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
$apiDir = Join-Path $repoRoot "webservice/api"
$frontDir = Join-Path $repoRoot "webservice/front"
$datasetsDir = Join-Path $repoRoot "datasets"
$metricsDir = Join-Path $repoRoot "metrics"
$rootComposeFile = Join-Path $repoRoot "docker-compose.yml"
$rootPresetComposeFile = Join-Path $repoRoot "docker-compose.server.yml"
$dbComposeFile = Join-Path $apiDir "docker-compose.db.yml"
$dbPresetComposeFile = Join-Path $apiDir "docker-compose.db.server.yml"
$stateDir = Join-Path $repoRoot ".server-dev"
$stateFile = Join-Path $stateDir "processes.json"
$frontHealthcheckUrl = "http://localhost:$FrontendPort"

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

function Stop-RecordedProcesses {
  if (-not (Test-Path $stateFile)) {
    return
  }

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

$npmCommand = Get-NpmCommand
$useMockAuth = $AuthMode -eq "Mock"
$apiAuthDisabled = if ($useMockAuth) { "true" } else { "false" }
$apiMockDataEnabled = if ($useMockAuth) { "true" } else { "false" }
$frontAuthDisabled = if ($useMockAuth) { "true" } else { "false" }

if ([string]::IsNullOrWhiteSpace($CorsOrigins)) {
  $CorsOrigins = "http://localhost:$FrontendPort,http://127.0.0.1:$FrontendPort,http://localhost:$ApiPort"
  if (-not [string]::IsNullOrWhiteSpace($PublicFrontOrigin)) {
    $CorsOrigins = "$CorsOrigins,$PublicFrontOrigin"
  }
}

if ([string]::IsNullOrWhiteSpace($ApiHealthcheckUrl)) {
  $ApiHealthcheckUrl = "http://localhost:$ApiPort/api-docs"
}

if (-not (Test-Path $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir | Out-Null
}

Stop-RecordedProcesses

$rootComposeArgs = @("-f", $rootComposeFile, "-f", $rootPresetComposeFile, "up", "-d")
if ($Rebuild) {
  $rootComposeArgs += "--build"
}

Write-Host "Subindo stack server do GF-Shield..."
Invoke-Compose -WorkingDirectory $repoRoot -Arguments $rootComposeArgs -ProjectName $composeProjectName

Write-Host "Subindo banco server do webservice/api..."
Invoke-Compose -WorkingDirectory $repoRoot -Arguments @("-f", $dbComposeFile, "-f", $dbPresetComposeFile, "up", "-d")

$apiLog = Join-Path $stateDir "api.log"
$frontLog = Join-Path $stateDir "front.log"
Set-Content -Path $apiLog -Value ""
Set-Content -Path $frontLog -Value ""

Write-Host "Gerando build estatico do front..."
Push-Location $frontDir
try {
  $env:REACT_APP_API_URL = "http://localhost:$ApiPort/api"
  $env:REACT_APP_AUTH_DISABLED = $frontAuthDisabled
  & $npmCommand run build *>&1 | Tee-Object -FilePath $frontLog -Append | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar o build do front."
  }
}
finally {
  Remove-Item Env:REACT_APP_API_URL -ErrorAction SilentlyContinue
  Remove-Item Env:REACT_APP_AUTH_DISABLED -ErrorAction SilentlyContinue
  Pop-Location
}

$apiCommand = @"
Set-Location '$apiDir'
`$env:API_PORT = '$ApiPort'
`$env:AUTH_DISABLED = '$apiAuthDisabled'
`$env:MOCK_DATA_ENABLED = '$apiMockDataEnabled'
`$env:CORS_ORIGINS = '$CorsOrigins'
`$env:GRASP_DATASETS_DIR = '$datasetsDir'
`$env:GF_SHIELD_PROJECT_ROOT = '$repoRoot'
`$env:GF_SHIELD_METRICS_DIR = '$metricsDir'
`$env:GF_SHIELD_COMPOSE_PROJECT_NAME = '$composeProjectName'
`$env:GF_SHIELD_COMPOSE_FILES = 'docker-compose.yml,docker-compose.server.yml'
& '$npmCommand' run dev
"@

$frontCommand = @"
Set-Location '$frontDir'
& '$npmCommand' exec --yes --package=serve -- serve -s build -l $FrontendPort
"@

Write-Host "Abrindo API em nova janela..."
$apiProcess = Start-ManagedShell -Name "webservice-api-server" -WorkingDirectory $apiDir -Command $apiCommand

Write-Host "Abrindo front em nova janela..."
$frontProcess = Start-ManagedShell -Name "webservice-front-server" -WorkingDirectory $frontDir -Command $frontCommand

$state = [PSCustomObject]@{
  startedAt = (Get-Date).ToString("o")
  authMode = $AuthMode
  processes = @($apiProcess, $frontProcess)
}

$state | ConvertTo-Json -Depth 4 | Set-Content -Path $stateFile

Write-Host "Aguardando API responder em $ApiHealthcheckUrl ..."
Wait-ForHttp -Url $ApiHealthcheckUrl

Write-Host "Aguardando front responder em $frontHealthcheckUrl ..."
Wait-ForHttp -Url $frontHealthcheckUrl

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
Write-Host "Ambiente server iniciado."
Write-Host "Front: http://localhost:$FrontendPort"
Write-Host "API: http://localhost:$ApiPort"
Write-Host "Swagger: http://localhost:$ApiPort/api-docs"
Write-Host "Kafbat: http://localhost:8080"
Write-Host "Modo de autenticacao: $AuthMode"
