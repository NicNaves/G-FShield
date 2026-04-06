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
- `g-fshield-api-dev-local` e `g-fshield-front-dev-local` quando o modo local usa Node em Docker

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

API e front no modo local com Node em Docker:

```powershell
docker logs -f g-fshield-api-dev-local
docker logs -f g-fshield-front-dev-local
```

Logs gravados pelos scripts:

- local: `.local-dev/api.log`, `.local-dev/front.log`
- server: `.server-dev/api.log`, `.server-dev/front.log`

### Subir e parar pelos scripts

Windows:

- start local: `.\scripts\start-local-dev.ps1`
- stop local: `.\scripts\stop-local-dev.ps1`
- start local com Node em Docker: `.\scripts\start-local-dev.ps1 -DevNodeImage node:24`
- start server: `.\scripts\start-server-dev.ps1`

Ubuntu:

- start local: `bash scripts/start-local-dev.sh`
- stop local: `bash scripts/stop-local-dev.sh`
- start server com Node em Docker:

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

### Banco da API

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

### Reset do monitor e reset completo

No dashboard:

- `Settings > Operations > Reset monitor`
- `Settings > Operations > Restart and clean environment`

Observacao importante:

- o reset completo exige que a API esteja rodando no modo Docker dos scripts, com acesso ao Docker/Compose do host

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

- se o dashboard parecer pesado, verifique se o browser esta com build antigo em cache e consulte `monitor/bootstrap` e `monitor/projection`
- se o `DLS Outcome Summary` mostrar menos algoritmos do que o esperado, cheque os logs de `VND` e `IWSSR` para confirmar se houve atividade real
- se o cache nao estiver surtindo efeito, confirme `REDIS_ENABLED=true` e `docker exec g-fshield-redis redis-cli ping`
- se o login falhar em acesso remoto, revise `CORS_ORIGINS` e a porta publica do front

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
- `g-fshield-api-dev-local` and `g-fshield-front-dev-local` when local mode uses Docker Node

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

API and front-end in local Docker-Node mode:

```powershell
docker logs -f g-fshield-api-dev-local
docker logs -f g-fshield-front-dev-local
```

Script-managed logs:

- local: `.local-dev/api.log`, `.local-dev/front.log`
- server: `.server-dev/api.log`, `.server-dev/front.log`

### Start and stop through scripts

Windows:

- local start: `.\scripts\start-local-dev.ps1`
- local stop: `.\scripts\stop-local-dev.ps1`
- local start with Docker Node: `.\scripts\start-local-dev.ps1 -DevNodeImage node:24`
- server start: `.\scripts\start-server-dev.ps1`

Ubuntu:

- local start: `bash scripts/start-local-dev.sh`
- local stop: `bash scripts/stop-local-dev.sh`
- server start with Docker Node:

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

### API database

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

### Monitor reset and full reset

From the dashboard:

- `Settings > Operations > Reset monitor`
- `Settings > Operations > Restart and clean environment`

Important note:

- the full reset requires the API to run in the Docker script mode, with access to the host Docker/Compose runtime

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

- if the dashboard feels heavy, check whether the browser is still serving an older cached build and inspect `monitor/bootstrap` and `monitor/projection`
- if `DLS Outcome Summary` shows fewer algorithms than expected, inspect the `VND` and `IWSSR` logs to confirm actual activity
- if caching does not seem effective, confirm `REDIS_ENABLED=true` and `docker exec g-fshield-redis redis-cli ping`
- if remote login fails, review `CORS_ORIGINS` and the public front-end port
