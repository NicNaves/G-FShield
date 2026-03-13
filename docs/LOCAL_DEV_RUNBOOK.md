# Local Development Runbook

## PT-BR

### Objetivo

Este guia descreve o fluxo recomendado para subir o GF-Shield localmente com Docker, API Node.js e front React.

### Pre-requisitos

- Docker Desktop
- Node.js com `npm.cmd`
- Java 17 para execucoes locais fora do Docker, quando necessario

### O que sobe no ambiente local

- stack principal via [`docker-compose.yml`](../docker-compose.yml)
- banco PostgreSQL da API via [`webservice/api/docker-compose.db.yml`](../webservice/api/docker-compose.db.yml)
- API Express na porta `4000`
- front React na porta `3000`

### Fluxo recomendado

#### 1. Iniciar tudo com o script

```powershell
.\scripts\start-local-dev.ps1
```

Esse script:

- sobe a stack principal do GF-Shield
- sobe o banco da API
- abre API e front em novas janelas
- pode disparar uma execucao de exemplo se chamado com `-DispatchSampleRun`

#### 2. Encerrar o ambiente

```powershell
.\scripts\stop-local-dev.ps1
```

Se quiser manter Docker de pe:

```powershell
.\scripts\stop-local-dev.ps1 -KeepDocker
```

Se quiser derrubar o banco da API e remover volumes:

```powershell
.\scripts\stop-local-dev.ps1 -ResetDatabase
```

### Fluxo manual

#### Stack principal

```powershell
docker compose up -d --build
```

#### Banco da API

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
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
- O catalogo de datasets da API usa `GRASP_DATASETS_DIR="../../datasets"` por padrao.
- O dashboard usa eventos persistidos da API, nao os CSVs de `metrics`.

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

This guide describes the recommended flow to start GF-Shield locally with Docker, the Node.js API, and the React front-end.

### Prerequisites

- Docker Desktop
- Node.js with `npm.cmd`
- Java 17 for local non-Docker Java runs when needed

### What starts in the local environment

- main stack via [`docker-compose.yml`](../docker-compose.yml)
- API PostgreSQL database via [`webservice/api/docker-compose.db.yml`](../webservice/api/docker-compose.db.yml)
- Express API on port `4000`
- React front-end on port `3000`

### Recommended flow

#### 1. Start everything with the script

```powershell
.\scripts\start-local-dev.ps1
```

This script:

- starts the main GF-Shield stack
- starts the API database
- opens API and front-end in new windows
- can dispatch a sample run if called with `-DispatchSampleRun`

#### 2. Stop the environment

```powershell
.\scripts\stop-local-dev.ps1
```

If you want to keep Docker running:

```powershell
.\scripts\stop-local-dev.ps1 -KeepDocker
```

If you want to stop the API database and remove volumes:

```powershell
.\scripts\stop-local-dev.ps1 -ResetDatabase
```

### Manual flow

#### Main stack

```powershell
docker compose up -d --build
```

#### API database

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
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
- The API dataset catalog uses `GRASP_DATASETS_DIR="../../datasets"` by default.
- The dashboard uses API-persisted execution events, not the CSV files under `metrics`.

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
