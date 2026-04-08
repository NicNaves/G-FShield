# Local Development Runbook

## PT-BR

### Objetivo

Este guia descreve o fluxo recomendado para subir o GF-Shield localmente e no servidor de desenvolvimento com os scripts atuais.

### Pre-requisitos

Minimo recomendado:

- Docker ou Docker Desktop
- `docker compose`
- PowerShell no Windows ou `bash` no Ubuntu

Opcional:

- Node.js no host, se voce nao quiser usar `DEV_NODE_IMAGE=node:24`

### Modos de execucao

#### 1. Modo recomendado: Node em Docker

Use este modo quando voce quiser:

- alinhar local e servidor
- evitar instalacao de Node/npm no host
- manter o `Restart and clean environment` funcional no dashboard

Windows:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

Para analisar a interface com carregamento mais rapido e sem watcher agressivo do Vite em Docker:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
```

Ubuntu:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh
```

Para revisar o front em modo estatico:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh --frontend-mode Preview
```

#### 2. Modo alternativo: Node no host

Use este modo quando sua maquina ja tiver Node configurado.

Windows:

```powershell
.\scripts\start-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/start-local-dev.sh
```

### Fluxo recomendado no servidor de desenvolvimento

Quando o host nao tem Node/npm instalados e voce quer rodar tudo com Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://SEU_IP:3001
```

Se precisar trocar as portas:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --api-port 4001 --frontend-port 3001 --public-front-origin http://SEU_IP:3001
```

### O que os scripts fazem

Os scripts de start:

- sobem a stack principal (`docker-compose.yml` + preset)
- sobem o PostgreSQL e o Redis opcional da API
- podem instalar dependencias automaticamente
- iniciam API e front (`Vite` no modo `Dev` e `Nginx` com build estatico/cache no modo `Preview`; no servidor o front sobe estatico)
- esperam a API responder no healthcheck
- injetam `GRASP_DATASETS_DIR`, `GF_SHIELD_PROJECT_ROOT`, `GF_SHIELD_METRICS_DIR`, `GF_SHIELD_COMPOSE_PROJECT_NAME` e `GF_SHIELD_COMPOSE_FILES`
- no modo Docker, montam datasets, repo root e configuracao de reset
- aceitam `FrontendMode/--frontend-mode` com `Dev` ou `Preview`
- no modo estatico, configuram proxy `/api`, preservam SSE em `/api/grasp/monitor/stream`, habilitam `gzip` e cache de assets

Os scripts de stop:

- param API e front
- podem manter a stack Docker ligada
- podem derrubar o banco da API
- no PowerShell local, podem limpar volumes de `node_modules` usados pelo modo Docker

### Comandos de parada

Windows:

```powershell
.\scripts\stop-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/stop-local-dev.sh
```

Servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/stop-server-dev.sh
```

Flags uteis:

- manter Docker ligado
  PowerShell: `-KeepDocker`
  Shell: `--keep-docker`
- resetar o banco da API
  PowerShell: `-ResetDatabase`
  Shell: `--reset-database`
- limpar volumes locais do modo Docker
  PowerShell: `-ResetNodeVolumes`

### URLs principais

Local padrao:

- Front: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Kafbat: `http://localhost:8080`

Servicos auxiliares:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Servidor, exemplo com front em `3001`:

- Front: `http://SEU_IP:3001`
- API: `http://SEU_IP:4000`
- Swagger: `http://SEU_IP:4000/api-docs`

### CORS e acesso remoto

Se o front for acessado por IP ou dominio remoto, passe a origem publica no start do servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://200.156.91.194:3001
```

Se precisar definir tudo manualmente:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --cors-origins "http://200.156.91.194:3001,http://localhost:3001"
```

Se a porta publica do servidor nao estiver exposta, use um tunel SSH para validar o front/API sem alterar firewall:

```bash
ssh -p 2289 -L 3001:localhost:3001 -L 4000:localhost:4000 idscps@200.156.91.194
```

### Credencial seedada

Modo real com seed:

- email: `admin@admin.com`
- senha: `senhaSegura123`

### Dashboard: o que mudou

O front atual inclui:

- bootstrap agregado do monitor em `GET /api/grasp/monitor/bootstrap`
- projecao incremental em `GET /api/grasp/monitor/projection`
- aggregate materializado do dashboard em `GET /api/grasp/monitor/dashboard`
- cache remoto com `TanStack Query`
- read model persistido no PostgreSQL para o aggregate principal do dashboard
- buckets materializados de timeline no Postgres
- feed paginado e filtravel em `GET /api/grasp/monitor/feed`
- tabelas virtualizadas para listas densas
- busca remota com debounce e menos trabalho por pagina nas tabelas compartilhadas
- decimation nos graficos de serie temporal e limite de seeds visiveis na timeline
- jobs assincronos de exportacao em `POST /api/grasp/monitor/export-jobs`
- exportacao em CSV/JSON nas tabelas compartilhadas, requests, runs e timeline
- exportacao de tabela respeitando o conjunto filtrado completo, nao apenas a pagina visivel
- filtros por algoritmo, dataset, status, busca textual e faixa de `F1`
- filtro temporal com calendario e busca por timestamp
- grafico de atividade por horario
- `DLS Outcome Summary`, que mostra os algoritmos de busca local visiveis no recorte atual
- `Run Details` com historico paginado e timeline agregada por janela
- comparacao de execucoes em modo resumido para reduzir payload inicial

### Troubleshooting

#### API sobe, mas o front nao consegue logar

Verifique:

- `CORS_ORIGINS`
- porta publica do front
- firewall do servidor

#### Datasets nao aparecem quando a API roda em container

Use o modo Docker dos scripts. Ele monta a pasta `datasets` e ajusta `GRASP_DATASETS_DIR` automaticamente.

#### O dashboard ficou pesado

As versoes mais recentes do front ja reduzem o volume inicial de historico carregado, usam cache de consulta, projecao incremental, read model materializado, paginacao server-side e virtualizacao de tabelas. Mesmo assim, um `Ctrl+F5` apos deploy ajuda a limpar cache antigo.

Se ainda ficar lento, valide:

- `GET /api/grasp/monitor/bootstrap` para o carregamento inicial
- `GET /api/grasp/monitor/projection` para os agregados vivos
- `GET /api/grasp/monitor/dashboard` para confirmar o aggregate pronto do dashboard
- `GET /api/grasp/monitor/feed` para tabelas com paginacao/filtros
- se `REDIS_ENABLED=true`, confirme se o container `g-fshield-redis` esta ativo
- se estiver rodando local com Node em Docker no Windows, prefira `-FrontendMode Preview`, que agora gera o build e serve pelo `Nginx` com proxy `/api`, `gzip` e cache de assets

#### Botao `Restart and clean environment` retorna erro

Use o modo Docker dos scripts para API/front. Nesse modo a API sobe com acesso ao Compose do host e consegue executar o reset completo. Se o binario `docker` nao existir dentro do container da API, o reset faz fallback via Docker socket.

## EN-US

### Goal

This guide describes the recommended way to start GF-Shield locally and on the development server using the current scripts.

### Prerequisites

Recommended minimum:

- Docker or Docker Desktop
- `docker compose`
- PowerShell on Windows or `bash` on Ubuntu

Optional:

- Node.js on the host, if you do not want to use `DEV_NODE_IMAGE=node:24`

### Runtime modes

#### 1. Recommended mode: Node in Docker

Use this mode when you want to:

- align local and server behavior
- avoid installing Node/npm on the host
- keep `Restart and clean environment` working from the dashboard

Windows:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

To validate the UI with faster loading and without the aggressive Vite watcher inside Docker:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
```

Ubuntu:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh
```

To review the front-end in static mode:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh --frontend-mode Preview
```

#### 2. Alternative mode: Node on the host

Use this mode when the machine already has Node configured.

Windows:

```powershell
.\scripts\start-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/start-local-dev.sh
```

### Recommended flow on the development server

When the host does not have Node/npm installed and you want everything through Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://YOUR_IP:3001
```

To change ports:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --api-port 4001 --frontend-port 3001 --public-front-origin http://YOUR_IP:3001
```

### What the scripts do

The start scripts:

- start the main stack (`docker-compose.yml` + preset)
- start the API PostgreSQL database and optional Redis cache
- can install dependencies automatically
- start the API and front-end (`Vite` in `Dev` mode and `Nginx` with a static build in `Preview`; the server flow always uses the static front-end)
- wait for the API healthcheck
- inject `GRASP_DATASETS_DIR`, `GF_SHIELD_PROJECT_ROOT`, `GF_SHIELD_METRICS_DIR`, `GF_SHIELD_COMPOSE_PROJECT_NAME`, and `GF_SHIELD_COMPOSE_FILES`
- in Docker mode, mount datasets, repo root, and reset-related runtime settings
- accept `FrontendMode/--frontend-mode` with `Dev` or `Preview`
- in static mode, configure `/api` proxying, preserve SSE on `/api/grasp/monitor/stream`, and enable `gzip` plus asset caching

The stop scripts:

- stop the API and front-end
- can keep the Docker stack running
- can stop the API database
- on Windows local mode, can clear Docker `node_modules` volumes

### Stop commands

Windows:

```powershell
.\scripts\stop-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/stop-local-dev.sh
```

Server:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/stop-server-dev.sh
```

Useful flags:

- keep Docker running
  PowerShell: `-KeepDocker`
  Shell: `--keep-docker`
- reset the API database
  PowerShell: `-ResetDatabase`
  Shell: `--reset-database`
- clear local Docker-mode Node volumes
  PowerShell: `-ResetNodeVolumes`

### Main URLs

Default local:

- Front: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Kafbat: `http://localhost:8080`

Supporting services:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Server example with front on `3001`:

- Front: `http://YOUR_IP:3001`
- API: `http://YOUR_IP:4000`
- Swagger: `http://YOUR_IP:4000/api-docs`

### CORS and remote access

If the front-end is opened through a remote IP or domain, pass the public origin on server startup:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://200.156.91.194:3001
```

To define all origins manually:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --cors-origins "http://200.156.91.194:3001,http://localhost:3001"
```

If the public server ports are not exposed yet, validate through an SSH tunnel instead of changing firewall rules immediately:

```bash
ssh -p 2289 -L 3001:localhost:3001 -L 4000:localhost:4000 idscps@200.156.91.194
```

### Seeded credential

Real mode with seed:

- email: `admin@admin.com`
- password: `senhaSegura123`

### Dashboard changes now in place

The current front-end includes:

- aggregated monitor bootstrap at `GET /api/grasp/monitor/bootstrap`
- incremental projection at `GET /api/grasp/monitor/projection`
- materialized dashboard aggregate at `GET /api/grasp/monitor/dashboard`
- remote caching with `TanStack Query`
- persisted PostgreSQL read model for the main dashboard aggregate
- materialized timeline buckets in Postgres
- paginated and filterable feed at `GET /api/grasp/monitor/feed`
- virtualized tables for dense lists
- remote search with debounce and lower per-page work in shared tables
- time-series decimation and visible-seed limits in the timeline
- async export jobs at `POST /api/grasp/monitor/export-jobs`
- CSV/JSON export in shared tables, requests, runs, and timeline slices
- table export of the full filtered dataset, not just the visible page
- filters by algorithm, dataset, status, free-text search, and `F1` range
- time filters with calendar inputs and timestamp search
- hourly activity chart
- `DLS Outcome Summary`, showing local-search algorithms visible in the current slice
- `Run Details` with paginated history and time-windowed timeline aggregates
- execution comparison in summary mode to reduce initial payload

### Troubleshooting

#### API starts, but the front-end cannot log in

Check:

- `CORS_ORIGINS`
- the public front-end port
- the server firewall

#### Datasets do not show up when the API runs in a container

Use the Docker mode from the scripts. It mounts the `datasets` folder and adjusts `GRASP_DATASETS_DIR` automatically.

#### The dashboard feels heavy

Recent front-end changes already reduce the initial history volume and combine query caching, incremental projection, materialized read models, server-side pagination, and table virtualization. Even so, a `Ctrl+F5` after deploy helps clear stale cache.

If it still feels slow, validate:

- `GET /api/grasp/monitor/bootstrap` for the initial payload
- `GET /api/grasp/monitor/projection` for the live aggregates
- `GET /api/grasp/monitor/dashboard` for the ready-made dashboard aggregate
- `GET /api/grasp/monitor/feed` for paginated/filtered table payloads
- when `REDIS_ENABLED=true`, confirm the `g-fshield-redis` container is running
- when using Docker Node on Windows, prefer `-FrontendMode Preview`, which now serves the front-end through `Nginx` with `/api` proxying, `gzip`, and asset caching

#### `Restart and clean environment` returns an error

Use the Docker script mode for the API/front-end. In that mode the API starts with access to the host Compose runtime and can perform the full reset. If the `docker` binary is not available inside the API container, the reset falls back to the Docker socket.
