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
- `g-fshield-api-dev`
- `g-fshield-front-dev`

Se voce ainda tiver uma stack antiga `gf-shield-*`, derrube-a antes de misturar os ambientes.

### Validacao rapida

```powershell
docker compose -p g-fshield ps
```

```powershell
docker compose -p g-fshield logs --tail=100
```

### Logs uteis

Stack principal:

```powershell
docker logs -f g-fshield-kafka-1
docker logs -f g-fshield-zookeeper-1
docker logs -f g-fshield-grasp-fs-dls-vnd-1
docker logs -f g-fshield-grasp-fs-dls-iwr-1
```

API e front em containers standalone:

```powershell
docker logs -f g-fshield-api-dev
docker logs -f g-fshield-front-dev
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

- se o dashboard parecer pesado, verifique se o browser esta com build antigo em cache
- se o `DLS Outcome Summary` mostrar menos algoritmos do que o esperado, cheque os logs de `VND` e `IWSSR` para confirmar se houve atividade real
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
- `g-fshield-api-dev`
- `g-fshield-front-dev`

If you still have an older `gf-shield-*` stack, stop it before mixing environments.

### Quick validation

```powershell
docker compose -p g-fshield ps
```

```powershell
docker compose -p g-fshield logs --tail=100
```

### Useful logs

Main stack:

```powershell
docker logs -f g-fshield-kafka-1
docker logs -f g-fshield-zookeeper-1
docker logs -f g-fshield-grasp-fs-dls-vnd-1
docker logs -f g-fshield-grasp-fs-dls-iwr-1
```

API and front-end standalone containers:

```powershell
docker logs -f g-fshield-api-dev
docker logs -f g-fshield-front-dev
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

- if the dashboard feels heavy, check whether the browser is still serving an older cached build
- if `DLS Outcome Summary` shows fewer algorithms than expected, inspect the `VND` and `IWSSR` logs to confirm actual activity
- if remote login fails, review `CORS_ORIGINS` and the public front-end port
