# GF-Shield Webservice

## PT-BR

A pasta `webservice` contem a camada operacional web do GF-Shield:

- API Node.js para autenticacao, usuarios, dispatch de execucao e monitoramento
- dashboard React para datasets, controle de execucao e visualizacao do monitor

### Estrutura

- [`api`](./api): Express + Prisma + integracao com monitor Kafka
- [`front`](./front): dashboard React baseado em Material UI

### Responsabilidades principais

- autenticacao de usuarios
- autorizacao por perfil
- exposicao do catalogo de datasets
- disparo de execucao GRASP-FS
- fila de execucoes com cancelamento best-effort
- API do monitor de execucao
- dashboard em tempo real via SSE

### Perfis

- `ADMIN`: gerencia usuarios e inicia execucoes.
- `VIEWER`: acessa dashboard, monitor e datasets.

### Inicializacao local

Banco da API:

```powershell
cd .\api
docker compose -f .\docker-compose.db.yml up -d
```

Migracao e seed:

```powershell
cd .\api
npm.cmd run migrate
```

API:

```powershell
cd .\api
npm.cmd run dev
```

Front-end:

```powershell
cd .\front
npm.cmd start
```

### URLs

- Front-end: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`

### Semantica do dashboard

O dashboard agora combina monitoramento resumido e visoes analiticas:

- solucao inicial
- progresso intermediario da busca local
- resultado final da busca local
- best solution

Nas tabelas operacionais, a UI continua priorizando os estados mais uteis. Na aba `Analytics`, o front mostra o feed visivel de solucoes sem consolidacao por seed.

### Semantica da fila

- `queueState`: estado de despacho da launch (`queued`, `dispatching`, `dispatched`, `cancelled`)
- `status`: estado real do pipeline monitorado (`running` enquanto ainda faltam seeds; `completed` apenas quando todas as seeds esperadas forem concluidas)
- o painel de fila mostra seeds esperadas, observadas e concluidas para cada launch

### Funcionalidades de operacao

- `Settings > Operations`: fila de execucao com `Request Summary`
- `Settings > Operations > Administrative reset`: limpeza local do navegador, reset do monitor e reset completo do ambiente com confirmacao em modal
- `Dashboard > Executions`: comparacao entre runs
- `Dashboard > Analytics`: volume por topico, resumo por topico e feed visivel de solucoes
- `Dashboard > Run Details`: tela por `seedId`

### Estado persistido no browser

O front guarda no `localStorage`:

- `token`
- `role`
- `userId`
- `darkMode`
- notificacoes do monitor

## EN-US

The `webservice` folder contains the GF-Shield operational web layer:

- a Node.js API for authentication, user management, execution dispatch, and monitoring
- a React dashboard for datasets, execution control, and monitor visualization

### Structure

- [`api`](./api): Express + Prisma + Kafka monitor integration
- [`front`](./front): React dashboard built on Material UI

### Main responsibilities

- user authentication
- role-based authorization
- dataset catalog exposure
- GRASP-FS execution dispatch
- execution queue with best-effort cancellation
- execution monitor API
- real-time dashboard via SSE

### Roles

- `ADMIN`: can manage users and start executions.
- `VIEWER`: can access dashboard, monitor, and datasets.

### Local startup

API database:

```powershell
cd .\api
docker compose -f .\docker-compose.db.yml up -d
```

Migration and seed:

```powershell
cd .\api
npm.cmd run migrate
```

API:

```powershell
cd .\api
npm.cmd run dev
```

Front-end:

```powershell
cd .\front
npm.cmd start
```

### URLs

- Front-end: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`

### Dashboard semantics

The dashboard now combines an operational monitor and analytics views:

- initial solution
- intermediate local-search progress
- final local-search outcome
- best solution

Operational tables still prioritize the most useful final states. The `Analytics` tab exposes the visible solution feed without per-seed consolidation.

### Queue semantics

- `queueState`: dispatch state for the launch (`queued`, `dispatching`, `dispatched`, `cancelled`)
- `status`: real monitored pipeline state (`running` while seeds are still pending, `completed` only when all expected seeds finish)
- the execution queue panel shows expected, observed, and completed seeds per launch

### Operational features

- `Settings > Operations`: execution queue with `Request Summary`
- `Settings > Operations > Administrative reset`: browser-only cleanup, monitor reset, and full environment reset with confirmation modal
- `Dashboard > Executions`: run comparison
- `Dashboard > Analytics`: topic volume, topic summary, and visible solution feed
- `Dashboard > Run Details`: detail page by `seedId`

### Persisted browser state

The front-end stores these keys in `localStorage`:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications
