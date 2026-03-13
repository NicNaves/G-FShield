# GF-Shield Webservice

The `webservice` folder contains the operational web layer for GF-Shield:

- a Node.js API for auth, user management, execution dispatch, and monitoring
- a React dashboard for datasets, execution control, and monitor visualization

## Structure

- [`api`](./api): Express + Prisma + Kafka monitor integration
- [`front`](./front): React dashboard built on top of Material UI

## Main Responsibilities

- user authentication
- role-based authorization
- dataset catalog exposure
- GRASP-FS execution dispatch
- execution monitor API
- real-time dashboard via SSE

## Roles

- `ADMIN`
  Can manage users and start GRASP executions.

- `VIEWER`
  Can access dashboard, monitor, and dataset pages only.

## Local Start

### API database

```powershell
cd .\api
docker compose -f .\docker-compose.db.yml up -d
```

### API migration + seed

```powershell
cd .\api
npm.cmd run migrate
```

### API

```powershell
cd .\api
npm.cmd run dev
```

### Front-end

```powershell
cd .\front
npm.cmd start
```

## Webservice URLs

- Front-end: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`

## Dashboard Semantics

The dashboard is organized around three meaningful stages:

- initial solution
- local-search final outcome
- best solution

The UI intentionally ignores most raw progress noise from `LOCAL_SEARCH_PROGRESS_TOPIC`
and focuses on the final states that matter to analysis.

## Front-End Persisted State

The front stores a small amount of browser-side state in `localStorage`:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications

That state is browser-local and not stored in project files.

## Related Documentation

- [`api/README.md`](./api/README.md)
- [`front/README.md`](./front/README.md)
- [`../docs/LOCAL_DEV_RUNBOOK.md`](../docs/LOCAL_DEV_RUNBOOK.md)
- [`../docs/OPERATIONS.md`](../docs/OPERATIONS.md)
