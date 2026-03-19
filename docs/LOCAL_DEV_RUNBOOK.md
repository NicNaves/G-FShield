# Local Development Runbook

## PT-BR

### Objetivo

Este guia descreve o fluxo recomendado para subir o GF-Shield com Docker, API Node.js e front React, tanto no preset `local` quanto no preset `server`.

### Pre-requisitos

- Docker Desktop
- Node.js com `npm.cmd`
- Java 17 para execucoes locais fora do Docker, quando necessario

### O que sobe no ambiente

- stack principal via [`docker-compose.yml`](../docker-compose.yml)
- preset local via [`docker-compose.local.yml`](../docker-compose.local.yml)
- preset server via [`docker-compose.server.yml`](../docker-compose.server.yml)
- banco PostgreSQL da API via [`webservice/api/docker-compose.db.yml`](../webservice/api/docker-compose.db.yml)
- preset local via [`webservice/api/docker-compose.db.local.yml`](../webservice/api/docker-compose.db.local.yml)
- preset server via [`webservice/api/docker-compose.db.server.yml`](../webservice/api/docker-compose.db.server.yml)
- API Express na porta `4000`
- front React na porta `3000`

### Fluxo recomendado

#### 1. Iniciar tudo com o script

Windows local:

```powershell
.\scripts\start-local-dev.ps1
```

Windows server:

```powershell
.\scripts\start-server-dev.ps1
```

Ubuntu local:

```bash
bash scripts/start-local-dev.sh
```

Ubuntu server:

```bash
bash scripts/start-server-dev.sh
```

Esses scripts:

- sobe a stack principal do GF-Shield
- sobe o banco da API
- iniciam API e front fora do Docker
- separam estado entre `local` e `server`
- podem disparar uma execucao de exemplo

#### 2. Encerrar o ambiente

Windows local:

```powershell
.\scripts\stop-local-dev.ps1
```

Windows server:

```powershell
.\scripts\stop-server-dev.ps1
```

Ubuntu local:

```bash
bash scripts/stop-local-dev.sh
```

Ubuntu server:

```bash
bash scripts/stop-server-dev.sh
```

Para manter Docker de pe:

- PowerShell: `-KeepDocker`
- Shell: `--keep-docker`

Para derrubar o banco da API e remover volumes:

- PowerShell: `-ResetDatabase`
- Shell: `--reset-database`

### Fluxo manual

#### Stack principal

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Ou com o preset server:

```powershell
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

#### Banco da API

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml -f .\docker-compose.db.local.yml up -d
```

Ou com o preset server:

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml -f .\docker-compose.db.server.yml up -d
```

#### Migracao e seed

```powershell
cd .\webservice\api
npm.cmd run migrate
```

#### API

```powershell
cd .\webservice\api
npm.cmd run dev
```

#### Front

```powershell
cd .\webservice\front
npm.cmd start
```

### URLs principais

- Front: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Conduktor: `http://localhost:8080`

### Observacoes importantes

- No PowerShell, prefira `npm.cmd` em vez de `npm` se a execution policy bloquear scripts.
- No Ubuntu, os scripts `.sh` gravam logs em `.local-dev` ou `.server-dev`.
- O catalogo de datasets da API usa `GRASP_DATASETS_DIR="../../datasets"` por padrao.
- O dashboard usa eventos persistidos da API, nao os CSVs de `metrics`.
- a aba `Settings > Operations` mostra o `Request Summary` das launches persistidas.
- a fila da API suporta cancelamento best-effort.

### Troubleshooting

#### `npm` bloqueado no PowerShell

Use:

```powershell
npm.cmd run dev
```

ou:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

#### API nao enxerga mensagens antigas do Kafka

Verifique em [`webservice/api/.env`](../webservice/api/.env):

- `KAFKA_MONITOR_FROM_BEGINNING=true`
- `KAFKA_MONITOR_GROUP_ID` com um grupo novo para replay

#### Front com cache antigo

Use `Ctrl + F5` no navegador.

## EN-US

### Goal

This guide describes the recommended flow to start GF-Shield with Docker, the Node.js API, and the React front-end using either the `local` or `server` preset.

### Prerequisites

- Docker Desktop
- Node.js with `npm.cmd`
- Java 17 for local non-Docker Java runs when needed

### What starts in the environment

- main stack via [`docker-compose.yml`](../docker-compose.yml)
- local preset via [`docker-compose.local.yml`](../docker-compose.local.yml)
- server preset via [`docker-compose.server.yml`](../docker-compose.server.yml)
- API PostgreSQL database via [`webservice/api/docker-compose.db.yml`](../webservice/api/docker-compose.db.yml)
- local preset via [`webservice/api/docker-compose.db.local.yml`](../webservice/api/docker-compose.db.local.yml)
- server preset via [`webservice/api/docker-compose.db.server.yml`](../webservice/api/docker-compose.db.server.yml)
- Express API on port `4000`
- React front-end on port `3000`

### Recommended flow

#### 1. Start everything with the script

Windows local:

```powershell
.\scripts\start-local-dev.ps1
```

Windows server:

```powershell
.\scripts\start-server-dev.ps1
```

Ubuntu local:

```bash
bash scripts/start-local-dev.sh
```

Ubuntu server:

```bash
bash scripts/start-server-dev.sh
```

These scripts:

- starts the main GF-Shield stack
- starts the API database
- starts the API and front-end outside Docker
- keeps `local` and `server` state separated
- can dispatch a sample run

#### 2. Stop the environment

Windows local:

```powershell
.\scripts\stop-local-dev.ps1
```

Windows server:

```powershell
.\scripts\stop-server-dev.ps1
```

Ubuntu local:

```bash
bash scripts/stop-local-dev.sh
```

Ubuntu server:

```bash
bash scripts/stop-server-dev.sh
```

To keep Docker running:

- PowerShell: `-KeepDocker`
- Shell: `--keep-docker`

To stop the API database and remove volumes:

- PowerShell: `-ResetDatabase`
- Shell: `--reset-database`

### Manual flow

#### Main stack

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Or with the server preset:

```powershell
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build
```

#### API database

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml -f .\docker-compose.db.local.yml up -d
```

Or with the server preset:

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml -f .\docker-compose.db.server.yml up -d
```

#### Migration and seed

```powershell
cd .\webservice\api
npm.cmd run migrate
```

#### API

```powershell
cd .\webservice\api
npm.cmd run dev
```

#### Front-end

```powershell
cd .\webservice\front
npm.cmd start
```

### Main URLs

- Front-end: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Conduktor: `http://localhost:8080`

### Important notes

- In PowerShell, prefer `npm.cmd` instead of `npm` if execution policy blocks scripts.
- On Ubuntu, the `.sh` scripts write logs to `.local-dev` or `.server-dev`.
- The API dataset catalog uses `GRASP_DATASETS_DIR="../../datasets"` by default.
- The dashboard uses API-persisted execution events, not the CSV files under `metrics`.
- `Settings > Operations` shows the persisted `Request Summary` for launches.
- the API queue supports best-effort cancellation.

### Troubleshooting

#### `npm` blocked in PowerShell

Use:

```powershell
npm.cmd run dev
```

or:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

#### API does not see older Kafka messages

Check [`webservice/api/.env`](../webservice/api/.env):

- `KAFKA_MONITOR_FROM_BEGINNING=true`
- `KAFKA_MONITOR_GROUP_ID` set to a new group for replay

#### Front-end shows stale cache

Use `Ctrl + F5` in the browser.
