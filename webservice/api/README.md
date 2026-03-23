# GF-Shield API

## PT-BR

Esta API fornece autenticacao, gestao de usuarios, disparo de execucao GRASP-FS, acesso ao catalogo de datasets e os endpoints de monitor usados pelo dashboard.

### Stack

- Express
- Prisma
- PostgreSQL
- KafkaJS
- Swagger UI

### Rotas principais

#### Auth e usuarios

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`

#### GRASP

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

#### Swagger

- `GET /api-docs`

### Banco

O schema em modo real e pequeno e focado no GF-Shield:

- `User`
- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

`GraspExecutionLaunch` persiste:

- parametros da request
- algoritmos selecionados
- datasets e classificador
- estado da fila
- historico de dispatch
- contagem esperada, observada e concluida de seeds para reconciliar o `status` real da execucao

### Variaveis de ambiente

Principais variaveis de [`.env.example`](./.env.example):

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/g-fshield?schema=public"
JWT_SECRET="teste"
SERVER_URL="http://localhost:4000"
API_PORT=4000
GRASP_DATASETS_DIR="../../datasets"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
GRASP_PERSIST_PROGRESS_EVENTS=true
GRASP_EXPOSE_PROGRESS_EVENTS=true
GRASP_MONITOR_HISTORY_LIMIT=2000
GRASP_MONITOR_EVENT_LIMIT=2000
GRASP_MONITOR_SNAPSHOT_LIMIT=1000
GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT=2000
GRASP_RUN_SUMMARY_HISTORY_LIMIT=200
GRASP_RUN_HISTORY_LIMIT=5000
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

### Inicializacao local

```powershell
docker compose -f docker-compose.db.yml up -d
npm.cmd run migrate
npm.cmd run dev
```

### Notas sobre o monitor

O monitor assina:

- `INITIAL_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`

O monitor persiste snapshots intermediarios e resultados finais. A API expoe:

- runs consolidadas por `seedId`
- eventos do feed visivel do monitor
- resumo estatistico por topico e algoritmo
- reconciliacao de `status` da launch com base nas seeds esperadas x concluidas

### Semantica da launch

- `queueState`: mostra o estado do despacho da request
- `status`: fica `running` depois do dispatch e so muda para `completed` quando todas as seeds esperadas forem concluidas no pipeline
- `completedAt` passa a representar a conclusao real do pipeline, nao apenas o fim do envio para os servicos RCL

## EN-US

This API provides authentication, user management, GRASP-FS execution dispatch, dataset catalog access, and the monitor endpoints used by the dashboard.

### Stack

- Express
- Prisma
- PostgreSQL
- KafkaJS
- Swagger UI

### Main routes

#### Auth and users

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`

#### GRASP

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

#### Swagger

- `GET /api-docs`

### Database

The real-mode schema is intentionally small and focused on GF-Shield:

- `User`
- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

`GraspExecutionLaunch` persists:

- request parameters
- selected algorithms
- datasets and classifier
- queue state
- dispatch history
- expected, observed, and completed seed counters used to reconcile true execution status

### Environment variables

Important variables from [`.env.example`](./.env.example):

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/g-fshield?schema=public"
JWT_SECRET="teste"
SERVER_URL="http://localhost:4000"
API_PORT=4000
GRASP_DATASETS_DIR="../../datasets"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
GRASP_PERSIST_PROGRESS_EVENTS=true
GRASP_EXPOSE_PROGRESS_EVENTS=true
GRASP_MONITOR_HISTORY_LIMIT=2000
GRASP_MONITOR_EVENT_LIMIT=2000
GRASP_MONITOR_SNAPSHOT_LIMIT=1000
GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT=2000
GRASP_RUN_SUMMARY_HISTORY_LIMIT=200
GRASP_RUN_HISTORY_LIMIT=5000
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

### Local startup

```powershell
docker compose -f docker-compose.db.yml up -d
npm.cmd run migrate
npm.cmd run dev
```

### Monitor notes

The monitor subscribes to:

- `INITIAL_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`

The monitor persists intermediate snapshots and final results. The API exposes:

- consolidated runs by `seedId`
- visible monitor feed events
- statistical summaries by topic and algorithm
- launch status reconciliation based on expected-vs-completed seeds

### Launch semantics

- `queueState`: request dispatch state
- `status`: remains `running` after dispatch and only becomes `completed` when all expected seeds finish in the pipeline
- `completedAt` represents real pipeline completion, not just the end of RCL dispatch
