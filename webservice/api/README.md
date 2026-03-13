# GF-Shield API

This API provides authentication, user management, GRASP-FS execution dispatch, dataset
catalog access, and the monitor endpoints used by the dashboard.

## Stack

- Express
- Prisma
- PostgreSQL
- KafkaJS
- Swagger UI

## Main Routes

### Auth and users

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/users/:id`
- `PUT /api/users/:id`

### GRASP

- `GET /api/grasp/services`
- `GET /api/grasp/datasets`
- `POST /api/grasp/run`
- `GET /api/grasp/monitor/runs`
- `GET /api/grasp/monitor/runs/:seedId`
- `GET /api/grasp/monitor/events`
- `GET /api/grasp/monitor/stream`

### Swagger

- `GET /api-docs`

## Database

The real-mode schema is intentionally small and focused on GF-Shield:

- `User`
- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

Legacy dengue-related entities are not part of the real API path.

## Environment Variables

Important variables from [`.env.example`](./.env.example):

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/graspfs?schema=public"
JWT_SECRET="teste"
SERVER_URL="http://localhost:4000"
API_PORT=4000
GRASP_DATASETS_DIR="../../datasets"
AUTH_DISABLED=false
MOCK_DATA_ENABLED=false
GRASP_PERSIST_PROGRESS_EVENTS=false
GRASP_MONITOR_HISTORY_LIMIT=500
GRASP_MONITOR_EVENT_LIMIT=300
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

## Local Start

### Database

```powershell
docker compose -f docker-compose.db.yml up -d
```

### Prisma migration and seed

```powershell
npm.cmd run migrate
```

### API

```powershell
npm.cmd run dev
```

## Kafka Monitor Notes

The monitor subscribes to:

- `INITIAL_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`

For dashboard readability:

- progress events are not exposed by default
- final best snapshots are preserved over lower-priority updates
- best solutions take precedence over regular solution updates

## Replay Old Topic Data

If the API starts after Kafka has already received messages, enable replay:

```env
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

Use a new group ID whenever you need a fresh replay.

## Useful Scripts

From [`package.json`](./package.json):

- `npm.cmd run dev`
- `npm.cmd run db:up`
- `npm.cmd run db:down`
- `npm.cmd run db:reset`
- `npm.cmd run migrate`
- `npm.cmd run seed`
