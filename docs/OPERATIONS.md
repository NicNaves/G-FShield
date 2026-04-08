# Operations Guide

## PT-BR

### Objetivo

Este guia reune os comandos operacionais mais comuns para logs, reset, rebuild, limpeza e verificacao do ambiente GF-Shield.

### Nome do projeto Compose

Os scripts atuais resolvem o nome do repositorio real e normalmente sobem a stack com o projeto Compose:

```text
g-fshield
```

Por isso, os containers mais recentes tendem a aparecer como:

- `g-fshield-zookeeper-1`
- `g-fshield-kafka-1`
- `g-fshield-grasp-fs-dls-vnd-1`
- `g-fshield-postgres`
- `g-fshield-redis`
- `g-fshield-api-dev-local`
- `g-fshield-front-dev-local`
- `g-fshield-front-server-static`

Se voce ainda tiver uma stack antiga `gf-shield-*`, derrube-a antes de misturar os ambientes.

### Validacao rapida

```powershell
docker compose -p g-fshield ps
```

```powershell
docker compose -p g-fshield logs --tail=100
```

```powershell
docker compose -f .\webservice\api\docker-compose.db.yml ps
```

```powershell
curl.exe -I http://localhost:3000
```

### Logs uteis

Stack principal:

```powershell
docker logs -f g-fshield-kafka-1
docker logs -f g-fshield-zookeeper-1
docker logs -f g-fshield-grasp-fs-dls-vnd-1
docker logs -f g-fshield-grasp-fs-dls-iwr-1
```

Banco e cache da API:

```powershell
docker logs -f g-fshield-postgres
docker logs -f g-fshield-redis
```

API e front:

```powershell
docker logs -f g-fshield-api-dev-local
docker logs -f g-fshield-front-dev-local
docker logs -f g-fshield-front-server-static
```

Logs gravados pelos scripts:

- local: `.local-dev/api.log`, `.local-dev/front.log`
- server: `.server-dev/api.log`, `.server-dev/front.log`

### Subir e parar pelos scripts

Windows:

- start local: `.\scripts\start-local-dev.ps1`
- stop local: `.\scripts\stop-local-dev.ps1`
- start local com Node em Docker: `.\scripts\start-local-dev.ps1 -DevNodeImage node:24`
- start local com front estatico/Nginx: `.\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview`
- start server: `.\scripts\start-server-dev.ps1`

Ubuntu:

- start local: `bash scripts/start-local-dev.sh`
- stop local: `bash scripts/stop-local-dev.sh`

Start local com front estatico:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh --frontend-mode Preview
```

Start server com Node em Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh
```

Autostart no boot do servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/install-server-autostart.sh --frontend-port 3001 --public-front-origin http://SEU_IP:3001
```

O agendamento e registrado no `crontab` do usuario e chama `scripts/start-server-autostart.sh` a cada reboot.

### Derrubar a stack principal

```powershell
docker compose -p g-fshield down
```

Para tambem remover volumes:

```powershell
docker compose -p g-fshield down -v
```

### Banco da API, cache e read model

Reset do banco:

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml down -v
docker compose -f .\docker-compose.db.yml up -d
npm.cmd run migrate
npm.cmd run seed
```

Validacao rapida do cache opcional:

```powershell
docker exec g-fshield-redis redis-cli ping
```

Para usar o cache Redis na API, habilite em [`webservice/api/.env`](../webservice/api/.env):

```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

Observacao de funcionamento:

- o `AppCacheService` sempre usa memoria local primeiro
- quando `REDIS_ENABLED=true`, a API replica as entradas tambem no Redis
- se o Redis ficar indisponivel, a API cai automaticamente para memoria local

Read model materializado do dashboard:

- `GraspDashboardReadModel`
- `GraspDashboardTopicMetric`
- `GraspDashboardActivityBucket`
- `GraspDashboardResourceMetric`
- `GraspDashboardAlgorithmMetric`
- `GraspDashboardTimelineBucket`

### Reset do monitor e reset completo

No dashboard:

- `Settings > Operations > Reset monitor`
- `Settings > Operations > Restart and clean environment`

Observacoes importantes:

- o reset completo exige que a API esteja rodando no modo Docker dos scripts, com acesso ao Docker/Compose do host
- se o binario `docker` nao existir dentro do container da API, o reset faz fallback para o Docker socket do host

### Kafka e replay

Topicos mais usados:

- `INITIAL_SOLUTION_TOPIC`
- `NEIGHBORHOOD_RESTART_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`
- `BIT_FLIP_TOPIC`
- `IWSS_TOPIC`
- `IWSSR_TOPIC`

Exemplo de delete:

```powershell
docker exec g-fshield-kafka-1 kafka-topics --bootstrap-server localhost:19092 --delete --if-exists --topic BEST_SOLUTION_TOPIC
```

Nao remova `__consumer_offsets`.

Para replay do monitor, ajuste em [`webservice/api/.env`](../webservice/api/.env):

```env
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

Depois reinicie a API. Para um replay novo no futuro, troque o `KAFKA_MONITOR_GROUP_ID`.

### Endpoints operacionais do monitor

Os endpoints abaixo ajudam a distinguir payload bruto de agregado:

- `GET /api/grasp/monitor/bootstrap`
- `GET /api/grasp/monitor/projection`
- `GET /api/grasp/monitor/summary`
- `GET /api/grasp/monitor/dashboard`
- `GET /api/grasp/monitor/feed`
- `POST /api/grasp/monitor/export-jobs`
- `GET /api/grasp/monitor/export-jobs/:jobId`
- `GET /api/grasp/monitor/export-jobs/:jobId/download`

### Rebuild seletivo

DRG:

```powershell
docker compose -p g-fshield build grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
docker compose -p g-fshield up -d --no-deps --force-recreate grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
```

DLS:

```powershell
docker compose -p g-fshield build grasp-fs-dls-bf grasp-fs-dls-iw grasp-fs-dls-iwr grasp-fs-dls-vnd grasp-fs-dls-rvnd grasp-fs.dls.verify
docker compose -p g-fshield up -d --no-deps --force-recreate grasp-fs-dls-bf grasp-fs-dls-iw grasp-fs-dls-iwr grasp-fs-dls-vnd grasp-fs-dls-rvnd grasp-fs.dls.verify
```

### Limpeza de metricas e browser

Metricas CSV:

```powershell
Get-ChildItem .\metrics -File | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Force
```

Estado do browser:

```js
localStorage.clear()
```

Isso remove:

- `token`
- `role`
- `userId`
- `darkMode`
- notificacoes do monitor

### Dicas de diagnostico

- se o dashboard parecer pesado, verifique se o browser esta com build antigo em cache e consulte `monitor/bootstrap`, `monitor/projection` e `monitor/dashboard`
- se o front estiver abrindo devagar, prefira `Preview` ou o fluxo de servidor, que servem o build por `Nginx` com `gzip`, cache de assets e proxy `/api`
- se o `DLS Outcome Summary` mostrar menos algoritmos do que o esperado, cheque os logs de `VND` e `IWSSR` para confirmar se houve atividade real
- se o cache nao estiver surtindo efeito, confirme `REDIS_ENABLED=true` e `docker exec g-fshield-redis redis-cli ping`
- se a tabela estiver grande demais, valide se ela esta lendo `GET /api/grasp/monitor/feed` com paginacao server-side
- se a exportacao estiver demorando, acompanhe o status do job em `GET /api/grasp/monitor/export-jobs/:jobId`
- se o login falhar em acesso remoto, revise `CORS_ORIGINS` e a porta publica do front
- se `3001` e `4000` nao estiverem acessiveis externamente, use tunel SSH: `ssh -p 2289 -L 3001:localhost:3001 -L 4000:localhost:4000 idscps@200.156.91.194`

## EN-US

### Goal

This guide gathers the most common operational commands for logs, reset, rebuild, cleanup, and validation in GF-Shield.

### Compose project name

The current scripts resolve the real repository name and typically start the stack with the Compose project:

```text
g-fshield
```

Because of that, the latest containers usually look like:

- `g-fshield-zookeeper-1`
- `g-fshield-kafka-1`
- `g-fshield-grasp-fs-dls-vnd-1`
- `g-fshield-postgres`
- `g-fshield-redis`
- `g-fshield-api-dev-local`
- `g-fshield-front-dev-local`
- `g-fshield-front-server-static`

If you still have an older `gf-shield-*` stack, stop it before mixing environments.

### Quick validation

```powershell
docker compose -p g-fshield ps
```

```powershell
docker compose -p g-fshield logs --tail=100
```

```powershell
docker compose -f .\webservice\api\docker-compose.db.yml ps
```

```powershell
curl.exe -I http://localhost:3000
```

### Useful logs

Main stack:

```powershell
docker logs -f g-fshield-kafka-1
docker logs -f g-fshield-zookeeper-1
docker logs -f g-fshield-grasp-fs-dls-vnd-1
docker logs -f g-fshield-grasp-fs-dls-iwr-1
```

API database and cache:

```powershell
docker logs -f g-fshield-postgres
docker logs -f g-fshield-redis
```

API and front-end:

```powershell
docker logs -f g-fshield-api-dev-local
docker logs -f g-fshield-front-dev-local
docker logs -f g-fshield-front-server-static
```

Script-managed logs:

- local: `.local-dev/api.log`, `.local-dev/front.log`
- server: `.server-dev/api.log`, `.server-dev/front.log`

### Start and stop through scripts

Windows:

- local start: `.\scripts\start-local-dev.ps1`
- local stop: `.\scripts\stop-local-dev.ps1`
- local start with Docker Node: `.\scripts\start-local-dev.ps1 -DevNodeImage node:24`
- local start with a static/Nginx front-end: `.\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview`
- server start: `.\scripts\start-server-dev.ps1`

Ubuntu:

- local start: `bash scripts/start-local-dev.sh`
- local stop: `bash scripts/stop-local-dev.sh`

Local start with a static front-end:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh --frontend-mode Preview
```

Server start with Docker Node:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh
```

Server boot autostart:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/install-server-autostart.sh --frontend-port 3001 --public-front-origin http://YOUR_IP:3001
```

The scheduler is registered in the user's `crontab` and calls `scripts/start-server-autostart.sh` after each reboot.

### Stop the main stack

```powershell
docker compose -p g-fshield down
```

To also remove volumes:

```powershell
docker compose -p g-fshield down -v
```

### API database, cache, and read model

Database reset:

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml down -v
docker compose -f .\docker-compose.db.yml up -d
npm.cmd run migrate
npm.cmd run seed
```

Quick optional-cache validation:

```powershell
docker exec g-fshield-redis redis-cli ping
```

To enable Redis-backed API caching, set the following in [`webservice/api/.env`](../webservice/api/.env):

```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

Runtime behavior:

- `AppCacheService` always serves local memory first
- when `REDIS_ENABLED=true`, the API mirrors entries to Redis as a second cache layer
- if Redis becomes unavailable, the API automatically falls back to local memory

Materialized dashboard read model tables:

- `GraspDashboardReadModel`
- `GraspDashboardTopicMetric`
- `GraspDashboardActivityBucket`
- `GraspDashboardResourceMetric`
- `GraspDashboardAlgorithmMetric`
- `GraspDashboardTimelineBucket`

### Monitor reset and full reset

From the dashboard:

- `Settings > Operations > Reset monitor`
- `Settings > Operations > Restart and clean environment`

Important notes:

- the full reset requires the API to run in the Docker script mode, with access to the host Docker/Compose runtime
- if the `docker` binary is unavailable inside the API container, the reset falls back to the host Docker socket

### Kafka and replay

Most common topics:

- `INITIAL_SOLUTION_TOPIC`
- `NEIGHBORHOOD_RESTART_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`
- `BIT_FLIP_TOPIC`
- `IWSS_TOPIC`
- `IWSSR_TOPIC`

Delete example:

```powershell
docker exec g-fshield-kafka-1 kafka-topics --bootstrap-server localhost:19092 --delete --if-exists --topic BEST_SOLUTION_TOPIC
```

Do not remove `__consumer_offsets`.

For monitor replay, adjust [`webservice/api/.env`](../webservice/api/.env):

```env
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

Then restart the API. For another replay later, change `KAFKA_MONITOR_GROUP_ID`.

### Monitor operational endpoints

These endpoints help distinguish raw payloads from aggregated data:

- `GET /api/grasp/monitor/bootstrap`
- `GET /api/grasp/monitor/projection`
- `GET /api/grasp/monitor/summary`
- `GET /api/grasp/monitor/dashboard`
- `GET /api/grasp/monitor/feed`
- `POST /api/grasp/monitor/export-jobs`
- `GET /api/grasp/monitor/export-jobs/:jobId`
- `GET /api/grasp/monitor/export-jobs/:jobId/download`

### Selective rebuild

DRG:

```powershell
docker compose -p g-fshield build grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
docker compose -p g-fshield up -d --no-deps --force-recreate grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
```

DLS:

```powershell
docker compose -p g-fshield build grasp-fs-dls-bf grasp-fs-dls-iw grasp-fs-dls-iwr grasp-fs-dls-vnd grasp-fs-dls-rvnd grasp-fs.dls.verify
docker compose -p g-fshield up -d --no-deps --force-recreate grasp-fs-dls-bf grasp-fs-dls-iw grasp-fs-dls-iwr grasp-fs-dls-vnd grasp-fs-dls-rvnd grasp-fs.dls.verify
```

### Metrics and browser cleanup

CSV metrics:

```powershell
Get-ChildItem .\metrics -File | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Force
```

Browser state:

```js
localStorage.clear()
```

This removes:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications

### Diagnostic hints

- if the dashboard feels heavy, check whether the browser is still serving an older cached build and inspect `monitor/bootstrap`, `monitor/projection`, and `monitor/dashboard`
- if the site opens slowly, prefer `Preview` or the server flow, which serve the front-end through `Nginx` with `gzip`, asset caching, and `/api` proxying
- if `DLS Outcome Summary` shows fewer algorithms than expected, inspect the `VND` and `IWSSR` logs to confirm actual activity
- if caching does not seem effective, confirm `REDIS_ENABLED=true` and `docker exec g-fshield-redis redis-cli ping`
- if a table is too large, verify that it is reading `GET /api/grasp/monitor/feed` with server-side pagination
- if export takes time, follow the async job status at `GET /api/grasp/monitor/export-jobs/:jobId`
- if remote login fails, review `CORS_ORIGINS` and the public front-end port
- if `3001` and `4000` are not exposed publicly yet, use an SSH tunnel: `ssh -p 2289 -L 3001:localhost:3001 -L 4000:localhost:4000 idscps@200.156.91.194`
