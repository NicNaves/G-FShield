# Operations Guide

## PT-BR

### Objetivo

Este guia concentra os comandos operacionais mais comuns para reset, limpeza, replay e verificacao do ambiente GF-Shield.

### Validacao rapida do ambiente

```powershell
docker compose ps
```

```powershell
docker compose logs --tail=100
```

### Logs uteis

#### DRG

```powershell
docker logs -f gf-shield-grasp-fs-rcl-ig-1
docker logs -f gf-shield-grasp-fs-rcl-gr-1
docker logs -f gf-shield-grasp-fs-rcl-su-1
docker logs -f gf-shield-grasp-fs-rcl-rf-1
```

#### Verify

```powershell
docker logs -f gf-shield-grasp-fs.dls.verify-1
```

### Limpar metricas CSV

```powershell
Get-ChildItem .\metrics -File | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Force
```

### Limpar topicos Kafka da aplicacao

Exemplo de topicos normalmente usados:

- `INITIAL_SOLUTION_TOPIC`
- `NEIGHBORHOOD_RESTART_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`
- `BIT_FLIP_TOPIC`
- `IWSS_TOPIC`
- `IWSSR_TOPIC`

Recrie ou apague conforme sua rotina operacional. Nao remova `__consumer_offsets`.

Exemplo:

```powershell
docker exec gf-shield-kafka-1 kafka-topics --bootstrap-server localhost:9092 --delete --if-exists --topic BEST_SOLUTION_TOPIC
```

### Parar toda a stack

```powershell
docker compose down
```

### Presets de recursos

- stack local: `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d`
- stack server: `docker compose -f docker-compose.yml -f docker-compose.server.yml up -d`
- banco API local: `docker compose -f docker-compose.db.yml -f docker-compose.db.local.yml up -d`
- banco API server: `docker compose -f docker-compose.db.yml -f docker-compose.db.server.yml up -d`

### Scripts operacionais

Windows:

- local start: `.\scripts\start-local-dev.ps1`
- local stop: `.\scripts\stop-local-dev.ps1`
- server start: `.\scripts\start-server-dev.ps1`
- server stop: `.\scripts\stop-server-dev.ps1`

Ubuntu:

- local start: `bash scripts/start-local-dev.sh`
- local stop: `bash scripts/stop-local-dev.sh`
- server start: `bash scripts/start-server-dev.sh`
- server stop: `bash scripts/stop-server-dev.sh`

### Resetar o banco da API

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml down -v
docker compose -f .\docker-compose.db.yml up -d
npm.cmd run migrate
```

### Replay de dados antigos do Kafka para o monitor

Em [`webservice/api/.env`](../webservice/api/.env):

```env
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

Depois reinicie a API. Para novo replay futuro, troque o `KAFKA_MONITOR_GROUP_ID`.

### Limpar o estado do monitor web

O monitor persistido fica nas tabelas:

- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

Se necessario, limpe essas tabelas no PostgreSQL da API para zerar o dashboard.

`GraspExecutionLaunch` tambem guarda os parametros da request usados na fila do webservice.

### Limpar estado do navegador

No console do browser:

```js
localStorage.clear()
```

Isso remove:

- `token`
- `role`
- `userId`
- `darkMode`
- notificacoes do monitor

### Rebuild seletivo

```powershell
docker compose build grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
docker compose build grasp-fs-dls-bf grasp-fs-dls-iw grasp-fs-dls-iwr grasp-fs-dls-vnd grasp-fs-dls-rvnd grasp-fs.dls.verify
```

## EN-US

### Goal

This guide gathers the most common operational commands for reset, cleanup, replay, and environment checks in GF-Shield.

### Quick environment validation

```powershell
docker compose ps
```

```powershell
docker compose logs --tail=100
```

### Useful logs

#### DRG

```powershell
docker logs -f gf-shield-grasp-fs-rcl-ig-1
docker logs -f gf-shield-grasp-fs-rcl-gr-1
docker logs -f gf-shield-grasp-fs-rcl-su-1
docker logs -f gf-shield-grasp-fs-rcl-rf-1
```

#### Verify

```powershell
docker logs -f gf-shield-grasp-fs.dls.verify-1
```

### Clear CSV metrics

```powershell
Get-ChildItem .\metrics -File | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Force
```

### Clear application Kafka topics

Examples of commonly used topics:

- `INITIAL_SOLUTION_TOPIC`
- `NEIGHBORHOOD_RESTART_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`
- `BIT_FLIP_TOPIC`
- `IWSS_TOPIC`
- `IWSSR_TOPIC`

Recreate or delete them according to your operational workflow. Do not remove `__consumer_offsets`.

Example:

```powershell
docker exec gf-shield-kafka-1 kafka-topics --bootstrap-server localhost:9092 --delete --if-exists --topic BEST_SOLUTION_TOPIC
```

### Stop the full stack

```powershell
docker compose down
```

### Resource presets

- local stack: `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d`
- server stack: `docker compose -f docker-compose.yml -f docker-compose.server.yml up -d`
- local API DB: `docker compose -f docker-compose.db.yml -f docker-compose.db.local.yml up -d`
- server API DB: `docker compose -f docker-compose.db.yml -f docker-compose.db.server.yml up -d`

### Operational scripts

Windows:

- local start: `.\scripts\start-local-dev.ps1`
- local stop: `.\scripts\stop-local-dev.ps1`
- server start: `.\scripts\start-server-dev.ps1`
- server stop: `.\scripts\stop-server-dev.ps1`

Ubuntu:

- local start: `bash scripts/start-local-dev.sh`
- local stop: `bash scripts/stop-local-dev.sh`
- server start: `bash scripts/start-server-dev.sh`
- server stop: `bash scripts/stop-server-dev.sh`

### Reset the API database

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml down -v
docker compose -f .\docker-compose.db.yml up -d
npm.cmd run migrate
```

### Replay older Kafka data into the monitor

In [`webservice/api/.env`](../webservice/api/.env):

```env
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

Then restart the API. For another replay later, change `KAFKA_MONITOR_GROUP_ID`.

### Clear the web monitor state

Persisted monitor data lives in these tables:

- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

If needed, clear those tables in the API PostgreSQL database to reset the dashboard.

`GraspExecutionLaunch` also stores the request parameters used by the webservice queue.

### Clear browser state

In the browser console:

```js
localStorage.clear()
```

This removes:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications

### Selective rebuild

```powershell
docker compose build grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
docker compose build grasp-fs-dls-bf grasp-fs-dls-iw grasp-fs-dls-iwr grasp-fs-dls-vnd grasp-fs-dls-rvnd grasp-fs.dls.verify
```
