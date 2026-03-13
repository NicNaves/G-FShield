# GF-Shield

GF-Shield is a distributed GRASP-FS platform for feature selection in IDS workloads.
The repository combines Java microservices for RCL generation and local search, Kafka
for orchestration, and a Node.js + React webservice for execution control, monitoring,
authentication, and dashboards.

## Architecture Summary

GF-Shield is organized in three major layers:

- `DRG` (Distributed RCL Generator): generates initial solutions using feature ranking algorithms.
- `DLS` (Distributed Local Search): improves those solutions and verifies the best result per `seedId`.
- `Webservice`: exposes the operational API, user management, Swagger, and the monitoring dashboard.

Main Kafka topics used by the pipeline:

- `INITIAL_SOLUTION_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`

The web monitor and dashboard are optimized to focus on initial solutions, local-search
final outcomes, and best solutions. Progress events are suppressed by default in the
web layer to avoid noise.

## Repository Layout

- [`docker-compose.yml`](./docker-compose.yml): main stack for Kafka, PostgreSQL, Conduktor, DRG, and DLS.
- [`datasets`](./datasets): shared `.arff` datasets mounted into the Java services.
- [`metrics`](./metrics): generated CSV metrics from DRG and DLS services.
- [`grasp-fs-rcl-generator`](./grasp-fs-rcl-generator): DRG microservices.
- [`grasp-fs-distributed-ls`](./grasp-fs-distributed-ls): DLS and verify services.
- [`webservice`](./webservice): API and React front-end.
- [`docs`](./docs): local runbook and operational documentation.
- [`scripts`](./scripts): helper scripts for local startup and shutdown.

## Service Map

### DRG

- RelieF: `http://localhost:8086`
- Symmetrical Uncertainty: `http://localhost:8087`
- Gain Ratio: `http://localhost:8088`
- Information Gain: `http://localhost:8089`

### DLS

- Bit Flip: `http://localhost:8082`
- IWSS: `http://localhost:8083`
- IWSSR: `http://localhost:8084`
- Verify: `http://localhost:8085`
- RVND: `http://localhost:8090`
- VND: `http://localhost:8091`

### Platform and Webservice

- Kafka: `localhost:9092`
- Conduktor: `http://localhost:8080`
- Web API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Front-end: `http://localhost:3000`

## Prerequisites

- Docker Desktop
- Java 17
- Node.js
- PowerShell on Windows

Important on Windows PowerShell:

- prefer `npm.cmd` instead of `npm` if script execution is blocked
- or set `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Quick Start

The fastest way to start the project locally is the helper script below.

### Real mode

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real
```

### Mock mode

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Mock
```

### Real mode plus a sample run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real -DispatchSampleRun
```

### Stop everything

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local-dev.ps1
```

## Manual Start

### Main stack

```powershell
docker compose up -d
```

### Webservice database

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
```

### Web API

```powershell
cd .\webservice\api
npm.cmd run migrate
npm.cmd run dev
```

### Front-end

```powershell
cd .\webservice\front
npm.cmd start
```

## Monitoring and Logs

Recent improvements in the repository:

- DRG services now log request receipt, dataset loading, classifier resolution, and total processing time.
- Verify logs are now centered around `SOLUTIONS_TOPIC` and `BEST_SOLUTION_TOPIC`, showing candidate evaluation and best-solution promotion.
- The dashboard was updated to display:
  - initial solutions
  - local-search final outcomes
  - best solutions
  - improvement-only notifications

## Authentication

In real mode, the webservice uses Prisma and PostgreSQL.

Default admin account:

- Email: `admin@admin.com`
- Password: `senhaSegura123`

Roles:

- `ADMIN`: can manage users and start GRASP executions
- `VIEWER`: can only access dashboard, monitor, and datasets

## Documentation Index

- [`docs/README.md`](./docs/README.md): documentation index
- [`docs/LOCAL_DEV_RUNBOOK.md`](./docs/LOCAL_DEV_RUNBOOK.md): local development runbook
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md): operational tasks, cleanup, replay, and troubleshooting
- [`webservice/README.md`](./webservice/README.md): API + front overview
- [`webservice/api/README.md`](./webservice/api/README.md): API details
- [`webservice/front/README.md`](./webservice/front/README.md): front-end details

## Notes for Commits

Before shipping or tagging a clean run:

- clear Kafka application topics if you want an empty execution history
- clear `metrics/*.csv` if you want fresh CSV outputs
- stop the stack with `scripts/stop-local-dev.ps1` or `docker compose down`
- if needed, clear browser `localStorage` for `localhost:3000`

## Contributors

- Silvio Ereno Quincozes
- Estevao Filipe Cardoso
