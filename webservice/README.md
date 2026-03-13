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

O dashboard e organizado em torno de tres estagios relevantes:

- solucao inicial
- resultado final da busca local
- best solution

A UI ignora a maior parte do ruido bruto de `LOCAL_SEARCH_PROGRESS_TOPIC` e enfatiza os estados finais mais uteis para analise.

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

The dashboard is organized around three meaningful stages:

- initial solution
- final local-search outcome
- best solution

The UI intentionally ignores most raw `LOCAL_SEARCH_PROGRESS_TOPIC` noise and emphasizes the final states that matter most to analysis.

### Persisted browser state

The front-end stores these keys in `localStorage`:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications
