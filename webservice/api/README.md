# GF-Shield API

## PT-BR

Esta API concentra autenticacao, usuarios, fila de execucoes GRASP-FS, persistencia do monitor e endpoints usados pelo dashboard.

### Stack

- Express
- Prisma
- PostgreSQL
- KafkaJS
- Swagger UI

### Rotas principais

Auth e usuarios:

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`

GRASP:

- `GET /api/grasp/services`
- `GET /api/grasp/datasets`
- `POST /api/grasp/run`
- `GET /api/grasp/executions`
- `GET /api/grasp/executions/:requestId`
- `POST /api/grasp/executions/:requestId/cancel`
- `GET /api/grasp/monitor/runs`
- `GET /api/grasp/monitor/runs/:seedId`
- `GET /api/grasp/monitor/compare`
- `GET /api/grasp/monitor/summary`
- `GET /api/grasp/monitor/events`
- `GET /api/grasp/monitor/stream`
- `POST /api/grasp/monitor/reset`
- `POST /api/grasp/environment/reset`

Swagger:

- `GET /api-docs`

### Persistencia

As tabelas principais sao:

- `User`
- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

`GraspExecutionLaunch` guarda:

- parametros da request
- algoritmos, datasets e classificador
- `queueState`
- `status`
- historico de dispatch
- contadores de seeds esperadas, observadas e concluidas

### Endpoints importantes para o front atual

- `GET /api/grasp/executions/:requestId?includeMonitor=true`
  retorna o bundle completo da request, usado pela exportacao do dashboard
- `POST /api/grasp/environment/reset`
  executa reset do ambiente distribuido quando a API roda com acesso ao Docker/Compose do host

### Variaveis de ambiente principais

Exemplo de base:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/g-fshield?schema=public"
JWT_SECRET="teste"
SERVER_URL="http://localhost:4000"
API_PORT=4000
GRASP_DATASETS_DIR="../../datasets"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:4000"
GRASP_PERSIST_PROGRESS_EVENTS=true
GRASP_EXPOSE_PROGRESS_EVENTS=true
GRASP_MONITOR_HISTORY_LIMIT=500
GRASP_MONITOR_EVENT_LIMIT=300
GRASP_MONITOR_SNAPSHOT_LIMIT=200
GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT=200
GRASP_RUN_SUMMARY_HISTORY_LIMIT=30
GRASP_RUN_HISTORY_LIMIT=2000
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
GF_SHIELD_PROJECT_ROOT=/workspace-repo
GF_SHIELD_COMPOSE_PROJECT_NAME=g-fshield
GF_SHIELD_COMPOSE_FILES=docker-compose.yml,docker-compose.server.yml
GF_SHIELD_DOCKER_BIN=docker
```

### Reset completo do ambiente

Para `POST /api/grasp/environment/reset` funcionar, a API precisa:

- conhecer a raiz real do repo
- conhecer o projeto Compose
- ter acesso ao Docker/Compose do host

No fluxo atual dos scripts em modo Docker, isso e configurado automaticamente.

### Inicializacao

Modo recomendado pelo projeto:

```powershell
..\..\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

Fluxo manual minimo:

```powershell
docker compose -f docker-compose.db.yml up -d
npm.cmd run migrate
npm.cmd run seed
npm.cmd run dev
```

### Semantica operacional

- `queueState`: estado do despacho da request
- `status`: estado real monitorado da pipeline
- `completedAt`: conclusao real das seeds esperadas

### Monitor

O monitor assina:

- `INITIAL_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`

A API expoe:

- runs consolidadas por `seedId`
- eventos visiveis do monitor
- resumo estatistico
- bundles por request
- reconciliacao real do status das launches

## EN-US

This API handles authentication, users, GRASP-FS execution queueing, persisted monitor state, and the endpoints used by the dashboard.

### Stack

- Express
- Prisma
- PostgreSQL
- KafkaJS
- Swagger UI

### Main routes

Auth and users:

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`

GRASP:

- `GET /api/grasp/services`
- `GET /api/grasp/datasets`
- `POST /api/grasp/run`
- `GET /api/grasp/executions`
- `GET /api/grasp/executions/:requestId`
- `POST /api/grasp/executions/:requestId/cancel`
- `GET /api/grasp/monitor/runs`
- `GET /api/grasp/monitor/runs/:seedId`
- `GET /api/grasp/monitor/compare`
- `GET /api/grasp/monitor/summary`
- `GET /api/grasp/monitor/events`
- `GET /api/grasp/monitor/stream`
- `POST /api/grasp/monitor/reset`
- `POST /api/grasp/environment/reset`

Swagger:

- `GET /api-docs`

### Persistence

Main tables:

- `User`
- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

`GraspExecutionLaunch` stores:

- request parameters
- algorithms, datasets, and classifier
- `queueState`
- `status`
- dispatch history
- expected, observed, and completed seed counters

### Important endpoints for the current front-end

- `GET /api/grasp/executions/:requestId?includeMonitor=true`
  returns the full request bundle used by dashboard export
- `POST /api/grasp/environment/reset`
  performs the distributed environment reset when the API runs with access to the host Docker/Compose runtime

### Main environment variables

Base example:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/g-fshield?schema=public"
JWT_SECRET="teste"
SERVER_URL="http://localhost:4000"
API_PORT=4000
GRASP_DATASETS_DIR="../../datasets"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:4000"
GRASP_PERSIST_PROGRESS_EVENTS=true
GRASP_EXPOSE_PROGRESS_EVENTS=true
GRASP_MONITOR_HISTORY_LIMIT=500
GRASP_MONITOR_EVENT_LIMIT=300
GRASP_MONITOR_SNAPSHOT_LIMIT=200
GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT=200
GRASP_RUN_SUMMARY_HISTORY_LIMIT=30
GRASP_RUN_HISTORY_LIMIT=2000
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
GF_SHIELD_PROJECT_ROOT=/workspace-repo
GF_SHIELD_COMPOSE_PROJECT_NAME=g-fshield
GF_SHIELD_COMPOSE_FILES=docker-compose.yml,docker-compose.server.yml
GF_SHIELD_DOCKER_BIN=docker
```

### Full environment reset

For `POST /api/grasp/environment/reset` to work, the API must:

- know the real repo root
- know the Compose project name
- have access to the host Docker/Compose runtime

In the current script-driven Docker flow, this is configured automatically.

### Startup

Recommended project flow:

```powershell
..\..\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

Minimal manual flow:

```powershell
docker compose -f docker-compose.db.yml up -d
npm.cmd run migrate
npm.cmd run seed
npm.cmd run dev
```

### Operational semantics

- `queueState`: request dispatch state
- `status`: real monitored pipeline state
- `completedAt`: real completion time for the expected seeds

### Monitor

The monitor subscribes to:

- `INITIAL_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`

The API exposes:

- consolidated runs by `seedId`
- visible monitor events
- statistical summaries
- request bundles
- true launch status reconciliation
