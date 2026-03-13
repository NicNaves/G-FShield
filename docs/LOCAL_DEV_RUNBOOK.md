# Local Development Runbook

This runbook describes the recommended local workflow for GF-Shield on Windows.

## What This Flow Starts

- the main Docker stack from [`docker-compose.yml`](../docker-compose.yml)
- the local PostgreSQL used by `webservice/api`
- the Node.js API at `http://localhost:4000`
- the React front-end at `http://localhost:3000`

## Prerequisites

- Docker Desktop running
- Java 17 installed
- Node.js installed
- PowerShell available

Windows PowerShell note:

- use `npm.cmd` if `npm` is blocked by script execution policy
- or enable scripts with:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Recommended Startup

### Real mode

Use this when you want real login, Prisma, PostgreSQL, and the full monitor flow.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real
```

### Mock mode

Use this when you want to open the UI quickly without depending on the real auth/database path.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Mock
```

### Real mode with sample execution

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real -DispatchSampleRun
```

## What The Startup Script Does

1. Starts the main GF-Shield Docker stack.
2. Starts the PostgreSQL used by `webservice/api`.
3. Opens the API in a separate PowerShell window.
4. Opens the front-end in a separate PowerShell window.
5. Saves process IDs in [`.local-dev/processes.json`](../.local-dev/processes.json).
6. Optionally dispatches a sample GRASP execution through the API.

## Main URLs

- Front-end: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Conduktor: `http://localhost:8080`

## Default Real-Mode Login

- Email: `admin@admin.com`
- Password: `senhaSegura123`

## Startup Options

### Rebuild Java images before start

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real -Rebuild
```

### Dispatch a custom sample run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 `
  -AuthMode Real `
  -DispatchSampleRun `
  -MaxGenerations 10 `
  -RclCutoff 20 `
  -SampleSize 5 `
  -TrainDataset "ereno1ktrain.arff" `
  -TestDataset "ereno1ktest.arff" `
  -Classifier "J48" `
  -NeighborhoodStrategy "VND" `
  -LocalSearches "BIT_FLIP","IWSS","IWSSR"
```

## Manual Startup

### 1. Main stack

```powershell
docker compose up -d
```

### 2. Webservice database

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
```

### 3. Prisma migration + seed

```powershell
cd .\webservice\api
npm.cmd run migrate
```

### 4. API

```powershell
cd .\webservice\api
npm.cmd run dev
```

### 5. Front-end

```powershell
cd .\webservice\front
npm.cmd start
```

## Stop Everything

### Normal stop

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local-dev.ps1
```

### Stop only API/front and keep Docker running

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local-dev.ps1 -KeepDocker
```

### Stop and remove the local API database volume

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local-dev.ps1 -ResetDatabase
```

## Datasets

The Java services read `.arff` files from the shared [`datasets`](../datasets) folder.

For the API to expose dataset names to the front, keep this value in `webservice/api/.env`:

```env
GRASP_DATASETS_DIR="../../datasets"
```

## Notes About The Monitor

The web monitor is built around these stages:

- `INITIAL_SOLUTION_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`

`LOCAL_SEARCH_PROGRESS_TOPIC` is still available in Kafka, but it is hidden by default in the web monitor to avoid noisy dashboards.

## Troubleshooting

- `npm : ... npm.ps1 cannot be loaded`
  Use `npm.cmd` instead of `npm`.

- `schema-engine-windows.exe spawn EPERM`
  Run Prisma from a normal PowerShell session, outside a restricted sandbox, with PostgreSQL already started.

- Front opens but the API does not respond
  Test `http://localhost:4000/api/grasp/services`.

- Login fails in real mode
  Run:

```powershell
cd .\webservice\api
npm.cmd run migrate
```

- API started after Kafka already had messages
  See [`OPERATIONS.md`](./OPERATIONS.md) for monitor replay instructions.
