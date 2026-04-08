# GF-Shield API

## PT-BR

Esta API concentra autenticacao, usuarios, fila de execucoes GRASP-FS, persistencia do monitor e endpoints usados pelo dashboard.

### Stack

- Express
- Prisma
- PostgreSQL
- Redis opcional
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
- `GET /api/grasp/monitor/bootstrap`
- `GET /api/grasp/monitor/projection`
- `GET /api/grasp/monitor/feed`
- `GET /api/grasp/monitor/dashboard`
- `GET /api/grasp/monitor/runs/:seedId`
- `GET /api/grasp/monitor/compare`
- `GET /api/grasp/monitor/summary`
- `GET /api/grasp/monitor/events`
- `GET /api/grasp/monitor/stream`
- `POST /api/grasp/monitor/export-jobs`
- `GET /api/grasp/monitor/export-jobs/:jobId`
- `GET /api/grasp/monitor/export-jobs/:jobId/download`
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
- `GraspDashboardReadModel`
- `GraspDashboardTopicMetric`
- `GraspDashboardActivityBucket`
- `GraspDashboardResourceMetric`
- `GraspDashboardAlgorithmMetric`
- `GraspDashboardTimelineBucket`

`GraspExecutionLaunch` guarda:

- parametros da request
- algoritmos, datasets e classificador
- `queueState`
- `status`
- historico de dispatch
- contadores de seeds esperadas, observadas e concluidas

O read model do dashboard guarda:

- payload agregado mais recente
- metricas por topico
- buckets de atividade
- metricas de recurso por algoritmo/busca
- metricas analiticas por algoritmo
- buckets materializados da timeline

### Endpoints importantes para o front atual

- `GET /api/grasp/monitor/bootstrap`
  retorna `runs + events + summary + projection` para reduzir o bootstrap inicial do dashboard
- `GET /api/grasp/monitor/projection`
  retorna agregados incrementais do monitor, como buckets de atividade e volume por topico
- `GET /api/grasp/monitor/dashboard`
  retorna o aggregate principal do dashboard a partir do read model materializado no PostgreSQL
- `GET /api/grasp/monitor/feed`
  retorna eventos paginados e filtraveis para `Analytics` e `Executions`
- `GET /api/grasp/monitor/runs/:seedId?includeInsights=true`
  retorna `historyPage` paginado e `timelineAggregate` por janela temporal para `Run Details`
- `GET /api/grasp/monitor/compare?summaryOnly=true`
  retorna comparacao resumida sem carregar historico pesado por padrao
- `GET /api/grasp/executions/:requestId?includeMonitor=true`
  retorna o bundle completo da request, usado pela exportacao do dashboard
- `POST /api/grasp/monitor/export-jobs`
  cria jobs assincronos para exportacoes pesadas em CSV/JSON
- `POST /api/grasp/environment/reset`
  executa reset do ambiente distribuido quando a API roda com acesso ao Docker/Compose do host

### Cache e agregacao

- a API usa cache local em memoria para respostas curtas e frequentes
- quando `REDIS_ENABLED=true`, o mesmo payload e espelhado no Redis
- `monitor/bootstrap`, `monitor/projection`, `monitor/feed`, `monitor/dashboard`, `monitor/summary`, `monitor/compare` e detalhes de run/request usam TTLs curtos
- o aggregate do dashboard e persistido em tabelas materializadas no PostgreSQL e reutilizado enquanto o watermark do monitor continuar valido

### Variaveis de ambiente principais

Exemplo de base:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/g-fshield?schema=public"
JWT_SECRET="change-this-secret-before-production"
JWT_ISSUER="g-fshield-webservice"
JWT_AUDIENCE="g-fshield-front"
SERVER_URL="http://localhost:4000"
API_PORT=4000
SWAGGER_FORCE_RUNTIME_BUILD=false
GRASP_DATASETS_DIR="../../datasets"
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:4000,http://localhost:4173,http://127.0.0.1:4173"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
ALLOW_PUBLIC_REGISTRATION=false
AUTH_COOKIE_SAMESITE=Lax
AUTH_COOKIE_SECURE=false
AUTH_LOGIN_RATE_WINDOW_MS=60000
AUTH_LOGIN_RATE_MAX_ATTEMPTS=20
AUTH_REGISTER_RATE_WINDOW_MS=600000
AUTH_REGISTER_RATE_MAX_ATTEMPTS=10
GRASP_PERSIST_PROGRESS_EVENTS=true
GRASP_EXPOSE_PROGRESS_EVENTS=true
GRASP_MONITOR_HISTORY_LIMIT=500
GRASP_MONITOR_EVENT_LIMIT=300
GRASP_MONITOR_SNAPSHOT_LIMIT=200
GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT=200
GRASP_RUN_SUMMARY_HISTORY_LIMIT=30
GRASP_RUN_HISTORY_LIMIT=2000
GRASP_RUN_TIMELINE_BUCKET_MS=60000
GRASP_RUN_TIMELINE_BUCKET_LIMIT=360
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
GF_SHIELD_PROJECT_ROOT=/workspace-repo
GF_SHIELD_COMPOSE_PROJECT_NAME=g-fshield
GF_SHIELD_COMPOSE_FILES=docker-compose.yml,docker-compose.server.yml
GF_SHIELD_DOCKER_BIN=docker
REDIS_ENABLED=false
REDIS_URL="redis://localhost:6379"
API_CACHE_TTL_MS=5000
GRASP_BOOTSTRAP_CACHE_TTL_MS=2500
GRASP_RUNS_CACHE_TTL_MS=2500
GRASP_RUN_CACHE_TTL_MS=4000
GRASP_EVENTS_CACHE_TTL_MS=2500
GRASP_SUMMARY_CACHE_TTL_MS=4000
GRASP_LAUNCH_CACHE_TTL_MS=5000
GRASP_COMPARE_CACHE_TTL_MS=5000
GRASP_DASHBOARD_CACHE_TTL_MS=5000
GRASP_FEED_CACHE_TTL_MS=2500
GRASP_PROJECTION_CACHE_TTL_MS=2500
GRASP_PROJECTION_BUCKET_MS=60000
GRASP_PROJECTION_EVENT_LIMIT=300
GRASP_DASHBOARD_BUCKET_LIMIT=72
GRASP_DASHBOARD_READ_MODEL_KEY=monitor-dashboard-default
GRASP_DASHBOARD_READ_MODEL_BUCKET_LIMIT=336
GRASP_DASHBOARD_TIMELINE_BUCKET_MS=60000
GRASP_DASHBOARD_TIMELINE_BUCKET_LIMIT=1440
GRASP_DASHBOARD_READ_MODEL_MAX_AGE_MS=600000
GRASP_FEED_PAGE_SIZE=25
GRASP_FEED_MAX_PAGE_SIZE=100
GRASP_FEED_EXPORT_LIMIT=50000
GRASP_EXPORT_JOB_TTL_MS=900000
GRASP_EXPORT_EVENT_LIMIT=10000
```

### Reset completo do ambiente

Para `POST /api/grasp/environment/reset` funcionar, a API precisa:

- conhecer a raiz real do repo
- conhecer o projeto Compose
- ter acesso ao Docker/Compose do host

No fluxo atual dos scripts em modo Docker, isso e configurado automaticamente.
Se o binario `docker` nao existir dentro do container da API, o reset usa fallback via Docker socket do host.

### Inicializacao

Modo recomendado pelo projeto:

```powershell
..\..\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
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
- bootstrap agregado do monitor
- projecao incremental em memoria
- aggregate materializado do dashboard
- timeline buckets materializados
- feed paginado e filtravel
- eventos visiveis do monitor
- resumo estatistico
- bundles por request
- jobs assincronos de exportacao
- reconciliacao real do status das launches

## EN-US

This API handles authentication, users, GRASP-FS execution queueing, persisted monitor state, and the endpoints used by the dashboard.

### Stack

- Express
- Prisma
- PostgreSQL
- Optional Redis
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
- `GET /api/grasp/monitor/bootstrap`
- `GET /api/grasp/monitor/projection`
- `GET /api/grasp/monitor/feed`
- `GET /api/grasp/monitor/dashboard`
- `GET /api/grasp/monitor/runs/:seedId`
- `GET /api/grasp/monitor/compare`
- `GET /api/grasp/monitor/summary`
- `GET /api/grasp/monitor/events`
- `GET /api/grasp/monitor/stream`
- `POST /api/grasp/monitor/export-jobs`
- `GET /api/grasp/monitor/export-jobs/:jobId`
- `GET /api/grasp/monitor/export-jobs/:jobId/download`
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
- `GraspDashboardReadModel`
- `GraspDashboardTopicMetric`
- `GraspDashboardActivityBucket`
- `GraspDashboardResourceMetric`
- `GraspDashboardAlgorithmMetric`
- `GraspDashboardTimelineBucket`

`GraspExecutionLaunch` stores:

- request parameters
- algorithms, datasets, and classifier
- `queueState`
- `status`
- dispatch history
- expected, observed, and completed seed counters

The dashboard read model stores:

- the latest aggregated payload
- per-topic metrics
- activity buckets
- resource metrics by algorithm/search
- analytical algorithm metrics
- materialized timeline buckets

### Important endpoints for the current front-end

- `GET /api/grasp/monitor/bootstrap`
  returns `runs + events + summary + projection` to reduce the dashboard bootstrap cost
- `GET /api/grasp/monitor/projection`
  returns incremental monitor aggregates such as activity buckets and topic volume
- `GET /api/grasp/monitor/dashboard`
  returns the main dashboard aggregate from the materialized PostgreSQL read model
- `GET /api/grasp/monitor/feed`
  returns paginated and filterable monitor events for `Analytics` and `Executions`
- `GET /api/grasp/monitor/runs/:seedId?includeInsights=true`
  returns paginated `historyPage` data plus a time-windowed `timelineAggregate` for `Run Details`
- `GET /api/grasp/monitor/compare?summaryOnly=true`
  returns lightweight comparison payloads without loading heavy histories by default
- `GET /api/grasp/executions/:requestId?includeMonitor=true`
  returns the full request bundle used by dashboard export
- `POST /api/grasp/monitor/export-jobs`
  creates async jobs for heavy CSV/JSON exports
- `POST /api/grasp/environment/reset`
  performs the distributed environment reset when the API runs with access to the host Docker/Compose runtime

### Caching and aggregation

- the API uses local in-memory caching for short-lived, frequently requested responses
- when `REDIS_ENABLED=true`, the same entries are mirrored into Redis
- `monitor/bootstrap`, `monitor/projection`, `monitor/feed`, `monitor/dashboard`, `monitor/summary`, `monitor/compare`, and run/request detail endpoints use short TTLs
- the dashboard aggregate is persisted into materialized PostgreSQL tables and reused while the monitor watermark remains fresh

### Main environment variables

Base example:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/g-fshield?schema=public"
JWT_SECRET="change-this-secret-before-production"
JWT_ISSUER="g-fshield-webservice"
JWT_AUDIENCE="g-fshield-front"
SERVER_URL="http://localhost:4000"
API_PORT=4000
SWAGGER_FORCE_RUNTIME_BUILD=false
GRASP_DATASETS_DIR="../../datasets"
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:4000,http://localhost:4173,http://127.0.0.1:4173"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
ALLOW_PUBLIC_REGISTRATION=false
AUTH_COOKIE_SAMESITE=Lax
AUTH_COOKIE_SECURE=false
AUTH_LOGIN_RATE_WINDOW_MS=60000
AUTH_LOGIN_RATE_MAX_ATTEMPTS=20
AUTH_REGISTER_RATE_WINDOW_MS=600000
AUTH_REGISTER_RATE_MAX_ATTEMPTS=10
GRASP_PERSIST_PROGRESS_EVENTS=true
GRASP_EXPOSE_PROGRESS_EVENTS=true
GRASP_MONITOR_HISTORY_LIMIT=500
GRASP_MONITOR_EVENT_LIMIT=300
GRASP_MONITOR_SNAPSHOT_LIMIT=200
GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT=200
GRASP_RUN_SUMMARY_HISTORY_LIMIT=30
GRASP_RUN_HISTORY_LIMIT=2000
GRASP_RUN_TIMELINE_BUCKET_MS=60000
GRASP_RUN_TIMELINE_BUCKET_LIMIT=360
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
GF_SHIELD_PROJECT_ROOT=/workspace-repo
GF_SHIELD_COMPOSE_PROJECT_NAME=g-fshield
GF_SHIELD_COMPOSE_FILES=docker-compose.yml,docker-compose.server.yml
GF_SHIELD_DOCKER_BIN=docker
REDIS_ENABLED=false
REDIS_URL="redis://localhost:6379"
API_CACHE_TTL_MS=5000
GRASP_BOOTSTRAP_CACHE_TTL_MS=2500
GRASP_RUNS_CACHE_TTL_MS=2500
GRASP_RUN_CACHE_TTL_MS=4000
GRASP_EVENTS_CACHE_TTL_MS=2500
GRASP_SUMMARY_CACHE_TTL_MS=4000
GRASP_LAUNCH_CACHE_TTL_MS=5000
GRASP_COMPARE_CACHE_TTL_MS=5000
GRASP_DASHBOARD_CACHE_TTL_MS=5000
GRASP_FEED_CACHE_TTL_MS=2500
GRASP_PROJECTION_CACHE_TTL_MS=2500
GRASP_PROJECTION_BUCKET_MS=60000
GRASP_PROJECTION_EVENT_LIMIT=300
GRASP_DASHBOARD_BUCKET_LIMIT=72
GRASP_DASHBOARD_READ_MODEL_KEY=monitor-dashboard-default
GRASP_DASHBOARD_READ_MODEL_BUCKET_LIMIT=336
GRASP_DASHBOARD_TIMELINE_BUCKET_MS=60000
GRASP_DASHBOARD_TIMELINE_BUCKET_LIMIT=1440
GRASP_DASHBOARD_READ_MODEL_MAX_AGE_MS=600000
GRASP_FEED_PAGE_SIZE=25
GRASP_FEED_MAX_PAGE_SIZE=100
GRASP_FEED_EXPORT_LIMIT=50000
GRASP_EXPORT_JOB_TTL_MS=900000
GRASP_EXPORT_EVENT_LIMIT=10000
```

### Full environment reset

For `POST /api/grasp/environment/reset` to work, the API must:

- know the real repo root
- know the Compose project name
- have access to the host Docker/Compose runtime

In the current script-driven Docker flow, this is configured automatically.
If the `docker` binary does not exist inside the API container, the reset falls back to the host Docker socket.

### Startup

Recommended project flow:

```powershell
..\..\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
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
- aggregated monitor bootstrap
- in-memory incremental projection
- materialized dashboard aggregate
- materialized timeline buckets
- paginated and filterable feed
- visible monitor events
- statistical summaries
- request bundles
- async export jobs
- true launch status reconciliation
