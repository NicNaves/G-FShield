# GF-Shield Front-End

## PT-BR

Este front-end e o dashboard operacional do GF-Shield.

### Stack

- React 18
- Vite
- Material UI 5
- Chart.js
- TanStack Query
- React Router
- React Toastify

### Principais areas

- `/dashboard`
- `/dashboard/runs/:seedId`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

### Recursos atuais do dashboard

- monitor em tempo real via SSE
- bootstrap agregado e projecao incremental do monitor no carregamento inicial
- aggregate materializado do dashboard em `GET /api/grasp/monitor/dashboard`
- `Run Details` por `seedId`
- `Run Details` com historico paginado e timeline agregada por janela temporal
- feed paginado e filtravel em `GET /api/grasp/monitor/feed`
- exportacao assincrona em CSV/JSON nas tabelas compartilhadas
- exportacao por request inteira, run inteira, timeline e tabela filtrada completa
- filtros de tabela por algoritmo, dataset, status, busca textual e faixa de `F1`
- filtros de tempo com calendario
- busca por timestamp na timeline
- grafico de atividade por horario
- `DLS Outcome Summary`
- `Run Comparison Studio`
- comparacao resumida entre execucoes para evitar payload pesado inicial
- virtualizacao nas tabelas mais pesadas do feed analitico e do historico de run
- virtualizacao tambem nas tabelas densas da aba de algoritmos
- tema escuro refinado e tipografia ajustada

### Performance

As ultimas mudancas do front reduziram o volume inicial de historico carregado no dashboard e agora combinam:

- cache remoto com `TanStack Query`
- lazy loading por rota e por aba em `Vite`
- proxy `/api` no modo `Dev`
- build estatico servido por `Nginx` no modo `Preview/server`
- preservacao da stream SSE em `/api/grasp/monitor/stream`
- `gzip` e cache de assets no front estatico
- decimation nos graficos de serie temporal
- paginacao server-side
- virtualizacao nas tabelas mais densas

Isso melhora o comportamento com muitos dados sem perder os detalhes por request e por run.

### Modelo de conexao

- por padrao o front usa `REACT_APP_API_URL="/api"`
- em `Dev`, o `Vite` faz proxy para `REACT_APP_API_PROXY_TARGET`
- em `Preview/server`, o `Nginx` faz proxy de `/api` para a API real e mantem a stream SSE em `/api/grasp/monitor/stream`

### Inicializacao

Se voce estiver rodando o projeto completo, prefira os scripts da raiz.

Execucao isolada do front:

```powershell
npm.cmd run dev
```

Build:

```powershell
npm.cmd run build
```

Preview local do build:

```powershell
npm.cmd run preview
```

### Persistencia no browser

- `token`
- `role`
- `userId`
- `darkMode`
- notificacoes do monitor

## EN-US

This front-end is the GF-Shield operational dashboard.

### Stack

- React 18
- Vite
- Material UI 5
- Chart.js
- TanStack Query
- React Router
- React Toastify

### Main areas

- `/dashboard`
- `/dashboard/runs/:seedId`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

### Current dashboard capabilities

- real-time monitor through SSE
- aggregated bootstrap and incremental monitor projection on initial load
- materialized dashboard aggregate from `GET /api/grasp/monitor/dashboard`
- `Run Details` by `seedId`
- `Run Details` with paginated history and time-windowed timeline aggregates
- paginated and filterable feed from `GET /api/grasp/monitor/feed`
- async CSV/JSON export in shared tables
- export by full request, full run, timeline slice, and full filtered table dataset
- table filters by algorithm, dataset, status, free-text search, and `F1` range
- time filters with calendar inputs
- timeline timestamp search
- hourly activity chart
- `DLS Outcome Summary`
- `Run Comparison Studio`
- summarized comparison mode between executions to avoid heavy initial payloads
- virtualization for the heaviest analytics-feed and run-history tables
- virtualization for dense tables in the algorithms tab as well
- refined dark theme and typography

### Performance

Recent front-end changes reduced the initial history volume loaded by the dashboard and now combine:

- remote caching with `TanStack Query`
- route-level and tab-level lazy loading in `Vite`
- `/api` proxying in `Dev`
- static `Nginx` serving in `Preview/server` mode
- preserved SSE at `/api/grasp/monitor/stream`
- `gzip` and asset caching for the static front-end
- time-series decimation
- server-side pagination
- virtualization for dense tables

This improves behavior with larger datasets while keeping request-level and run-level detail views available.

### Connection model

- by default the front-end uses `REACT_APP_API_URL="/api"`
- in `Dev`, `Vite` proxies requests to `REACT_APP_API_PROXY_TARGET`
- in `Preview/server`, `Nginx` proxies `/api` to the real API and preserves the SSE stream at `/api/grasp/monitor/stream`

### Startup

If you are running the full project, prefer the root-level scripts.

Standalone front-end run:

```powershell
npm.cmd run dev
```

Build:

```powershell
npm.cmd run build
```

Local preview of the built bundle:

```powershell
npm.cmd run preview
```

### Browser persistence

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications
