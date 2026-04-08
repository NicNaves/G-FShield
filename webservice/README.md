# GF-Shield Webservice

## PT-BR

A pasta `webservice` concentra a camada web operacional do GF-Shield:

- [`api`](./api): autenticacao, usuarios, fila de execucoes, persistencia e monitor
- [`front`](./front): dashboard operacional e analitico

### Responsabilidades principais

- autenticacao e autorizacao por perfil
- catalogo de datasets
- disparo de execucoes GRASP-FS
- fila com `Request Summary`
- monitor persistido com SSE
- dashboards por algoritmo, topico, request e seed

### Fluxo recomendado

O jeito mais simples de subir tudo hoje e pelo script raiz, especialmente no modo Docker:

```powershell
..\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
```

ou no servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001
```

### Funcionalidades refletidas no webservice atual

API:

- launch por request com persistencia
- reconciliacao real de `status` da pipeline
- cache curto em duas camadas: memoria + `Redis` opcional
- reset do monitor
- reset completo do ambiente quando a API roda com acesso ao Docker/Compose do host
- fallback via Docker socket no reset completo quando o binario `docker` nao esta disponivel no container
- endpoint de bundle por request para exportacao
- endpoint agregado `monitor/bootstrap`
- endpoint de projecao incremental `monitor/projection`
- endpoint agregado materializado `monitor/dashboard`
- feed paginado e filtravel em `monitor/feed`
- jobs assincronos em `monitor/export-jobs`
- read model analitico persistido no PostgreSQL para dashboard e timeline

Front:

- `Vite` com carregamento lazy por rota e por aba
- `TanStack Query` para cache de dados remotos
- `Nginx` estatico nos modos `Preview/server`, com proxy `/api`, SSE, `gzip` e cache de assets
- exportacao assincrona em CSV/JSON
- exportacao de request, run, timeline e tabela filtrada completa
- filtros de tabela por algoritmo, dataset, busca textual, status e faixa de `F1`
- paginacao server-side no feed analitico
- filtros de tempo com calendario
- busca por timestamp na timeline
- `Run Comparison Studio`
- `DLS Outcome Summary`
- `Run Details` por `seedId`
- `Run Details` com historico paginado e timeline agregada por janela
- virtualizacao das tabelas mais pesadas

### Semantica importante

- `queueState`: estado de despacho
- `status`: estado real monitorado da pipeline
- `completedAt`: conclusao real das seeds esperadas

### URLs padrao

- Front-end local: `http://localhost:3000`
- Front-end server/estatico (exemplo): `http://localhost:3001`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`

## EN-US

The `webservice` folder contains the GF-Shield operational web layer:

- [`api`](./api): authentication, users, execution queue, persistence, and monitoring
- [`front`](./front): operational and analytical dashboard

### Main responsibilities

- authentication and role-based authorization
- dataset catalog
- GRASP-FS execution dispatch
- queue with `Request Summary`
- persisted monitor with SSE
- dashboards by algorithm, topic, request, and seed

### Recommended flow

The simplest way to start everything now is through the root script, especially in Docker mode:

```powershell
..\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
```

or on the server:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001
```

### Features now reflected in the webservice

API:

- persisted request launches
- true pipeline status reconciliation
- short-lived two-layer cache: local memory + optional `Redis`
- monitor reset
- full environment reset when the API runs with access to the host Docker/Compose runtime
- Docker-socket fallback for full reset when the `docker` binary is unavailable inside the API container
- request bundle endpoint for export
- aggregated `monitor/bootstrap` endpoint
- incremental `monitor/projection` endpoint
- materialized `monitor/dashboard` aggregate endpoint
- paginated and filterable `monitor/feed` endpoint
- async `monitor/export-jobs` endpoints
- persisted PostgreSQL analytical read model for dashboard metrics and timeline buckets

Front-end:

- `Vite` with route-level and tab-level lazy loading
- `TanStack Query` for remote data caching
- static `Nginx` in `Preview/server` mode with `/api` proxying, SSE support, `gzip`, and asset caching
- async CSV/JSON export
- export of full requests, runs, timeline slices, and full filtered table datasets
- table filters by algorithm, dataset, free-text search, status, and `F1` range
- server-side pagination for the analytics feed
- time filters with calendar inputs
- timeline timestamp search
- `Run Comparison Studio`
- `DLS Outcome Summary`
- `Run Details` by `seedId`
- `Run Details` with paginated history and windowed timeline aggregates
- virtualization for the heaviest tables

### Important semantics

- `queueState`: dispatch state
- `status`: real monitored pipeline state
- `completedAt`: real completion of the expected seeds

### Default URLs

- Local front-end: `http://localhost:3000`
- Static/server front-end example: `http://localhost:3001`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
