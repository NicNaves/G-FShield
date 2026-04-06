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
..\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

ou no servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh
```

### Funcionalidades refletidas no webservice atual

API:

- launch por request com persistencia
- reconciliacao real de `status` da pipeline
- cache curto em memoria com `Redis` opcional
- reset do monitor
- reset completo do ambiente quando a API roda com acesso ao Docker/Compose do host
- endpoint de bundle por request para exportacao
- endpoint agregado `monitor/bootstrap`
- endpoint de projecao incremental `monitor/projection`

Front:

- `Vite` com carregamento lazy por rota
- `TanStack Query` para cache de dados remotos
- exportacao em CSV/JSON
- filtros de tempo com calendario
- busca por timestamp na timeline
- `Run Comparison Studio`
- `DLS Outcome Summary`
- `Run Details` por `seedId`
- virtualizacao das tabelas mais pesadas

### Semantica importante

- `queueState`: estado de despacho
- `status`: estado real monitorado da pipeline
- `completedAt`: conclusao real das seeds esperadas

### URLs padrao

- Front-end: `http://localhost:3000`
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
..\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

or on the server:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh
```

### Features now reflected in the webservice

API:

- persisted request launches
- true pipeline status reconciliation
- short-lived in-memory cache with optional `Redis`
- monitor reset
- full environment reset when the API runs with access to the host Docker/Compose runtime
- request bundle endpoint for export
- aggregated `monitor/bootstrap` endpoint
- incremental `monitor/projection` endpoint

Front-end:

- `Vite` with route-level lazy loading
- `TanStack Query` for remote data caching
- CSV/JSON export
- time filters with calendar inputs
- timeline timestamp search
- `Run Comparison Studio`
- `DLS Outcome Summary`
- `Run Details` by `seedId`
- virtualization for the heaviest tables

### Important semantics

- `queueState`: dispatch state
- `status`: real monitored pipeline state
- `completedAt`: real completion of the expected seeds

### Default URLs

- Front-end: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
