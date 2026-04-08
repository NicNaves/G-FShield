# GF-Shield

Distributed feature selection for intrusion detection systems with GRASP-FS, Kafka, DRG, DLS, and a web monitoring layer.

![Architecture Overview](./figures/ArquiteturaFull.drawio.png)

## PT-BR

### Visao geral

O **GF-Shield** combina:

- **DRG (Distributed RCL Generator)** para gerar solucoes iniciais
- **DLS (Distributed Local Search)** para refinar as seeds geradas
- **Kafka** para orquestrar o pipeline distribuido
- **Webservice** para autenticacao, disparo de execucoes, persistencia e dashboard

### Estrutura do repositorio

```text
GF-Shield/
|- datasets/
|- docs/
|- figures/
|- grasp-fs-distributed-ls/
|- grasp-fs-rcl-generator/
|- metrics/
|- scripts/
|- webservice/
`- docker-compose.yml
```

### Mapa rapido de portas

- Front-end local: `3000`
- Front-end estatico/server (exemplo): `3001`
- API: `4000`
- Swagger: `4000/api-docs`
- Kafbat UI: `8080`
- Kafka: `19092`
- Zookeeper: `2181`

Servicos DLS:

- BitFlip: `8082`
- IWSS: `8083`
- IWSSR: `8084`
- Verify: `8085`
- RVND: `8090`
- VND: `8091`

Servicos DRG:

- Relief: `8086`
- Symmetrical Uncertainty: `8087`
- Gain Ratio: `8088`
- Information Gain: `8089`

### Modos recomendados de execucao

Hoje o projeto suporta dois jeitos principais de subir API e front:

- **Node no host**: mais simples quando o ambiente ja tem Node/npm
- **Node em Docker**: recomendado para alinhar local e servidor, evitar instalacao de Node no host e manter o reset completo funcional pelo dashboard

Nos scripts, o modo Docker e ativado por `DEV_NODE_IMAGE=node:24`.

Para o front, o modo mais estavel para validacao e deploy e:

- `Dev`: `Vite` com watcher
- `Preview`: build estatico servido por `Nginx`, com proxy `/api`, suporte a SSE, `gzip` e cache de assets

### Inicio rapido

Windows local, no modo mais parecido com o servidor:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
```

Windows local, usando Node no host:

```powershell
.\scripts\start-local-dev.ps1
```

Ubuntu servidor, com Node em Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://SEU_IP:3001
```

Para parar:

```powershell
.\scripts\stop-local-dev.ps1
```

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/stop-server-dev.sh
```

### O que os scripts fazem

Os scripts em [`scripts`](./scripts):

- sobem a stack principal com o preset correto (`local` ou `server`)
- sobem o PostgreSQL e o Redis opcional da API
- podem instalar dependencias automaticamente
- iniciam a API e o front usando Node no host ou em container Docker
- usam `Vite` no front em `Dev` e `Nginx` no front em `Preview/server`
- configuram CORS, proxy `/api`, SSE, portas e healthchecks
- aplicam `gzip` e cache de assets quando o front esta estatico
- mantem estados separados em `.local-dev` e `.server-dev`
- no modo Docker, deixam o reset completo do ambiente funcional no dashboard

Observacao:

- quando o repositorio real esta em uma pasta como `G-FShield`, o nome do projeto Compose fica normalizado como `g-fshield`

### Dashboard e operacao

O dashboard atual cobre monitoramento operacional e analise:

- `Overview`: monitor em tempo real, cards principais e eventos recentes
- `Performance`: metricas por algoritmo e por busca local
- `Algorithms`: resumos por RCL e por DLS
- `Analytics`: feed paginado, filtros, volume por topico e graficos auxiliares
- `Executions`: workflow final por seed, comparacao entre runs e detalhes de request
- `Run Details`: historico persistido por `seedId`, com pagina e timeline agregada

Melhorias recentes refletidas no front:

- migracao do front para `Vite`
- lazy loading por rota e por aba pesada do dashboard
- `TanStack Query` para cache remoto, deduplicacao e menos refetch desnecessario
- `Nginx` no modo `Preview/server`, com proxy `/api`, SSE, `gzip` e cache de assets
- exportacao assincrona em CSV/JSON
- exportacao por request inteira, run inteira, timeline e tabela filtrada completa
- filtros de tabela por algoritmo, dataset, status, busca textual e faixa de `F1`
- exportacao respeitando exatamente os filtros aplicados
- filtros de tempo com calendario, busca por timestamp e janela padrao de `15m`
- grafico de atividade por horario
- `DLS Outcome Summary`
- `Run Comparison Studio`
- feed com paginacao server-side
- `Run Details` com historico paginado e timeline agregada por janela temporal
- comparacao de execucoes em modo resumido para evitar payload pesado
- virtualizacao das tabelas mais pesadas

Melhorias recentes refletidas na API:

- cache em duas camadas: memoria local + `Redis` opcional
- bootstrap agregado em `GET /api/grasp/monitor/bootstrap`
- projecao incremental em `GET /api/grasp/monitor/projection`
- aggregate principal do dashboard em `GET /api/grasp/monitor/dashboard`
- feed paginado e filtravel em `GET /api/grasp/monitor/feed`
- jobs assincronos de exportacao em `POST /api/grasp/monitor/export-jobs`
- read model analitico materializado no PostgreSQL para dashboard e buckets de timeline
- resumo do monitor servido a partir da janela viva quando possivel, com fallback para o store persistido
- reset completo com fallback via Docker socket quando o binario `docker` nao esta disponivel dentro do container da API

### Autenticacao

Perfis principais:

- `ADMIN`: gerencia usuarios e dispara execucoes
- `VIEWER`: acompanha dashboard, datasets e monitor

Login seedado padrao:

- email: `admin@admin.com`
- senha: `senhaSegura123`

### Documentacao

- [`docs/README.md`](./docs/README.md)
- [`docs/LOCAL_DEV_RUNBOOK.md`](./docs/LOCAL_DEV_RUNBOOK.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`webservice/README.md`](./webservice/README.md)
- [`webservice/api/README.md`](./webservice/api/README.md)
- [`webservice/front/README.md`](./webservice/front/README.md)

## EN-US

### Overview

**GF-Shield** combines:

- **DRG (Distributed RCL Generator)** to produce initial solutions
- **DLS (Distributed Local Search)** to refine those seeds
- **Kafka** to orchestrate the distributed pipeline
- **Webservice** for authentication, execution dispatch, persistence, and the dashboard

### Repository layout

```text
GF-Shield/
|- datasets/
|- docs/
|- figures/
|- grasp-fs-distributed-ls/
|- grasp-fs-rcl-generator/
|- metrics/
|- scripts/
|- webservice/
`- docker-compose.yml
```

### Quick port map

- Local front-end: `3000`
- Static/server front-end example: `3001`
- API: `4000`
- Swagger: `4000/api-docs`
- Kafbat UI: `8080`
- Kafka: `19092`
- Zookeeper: `2181`

DLS services:

- BitFlip: `8082`
- IWSS: `8083`
- IWSSR: `8084`
- Verify: `8085`
- RVND: `8090`
- VND: `8091`

DRG services:

- Relief: `8086`
- Symmetrical Uncertainty: `8087`
- Gain Ratio: `8088`
- Information Gain: `8089`

### Recommended runtime modes

The project now supports two main ways to run the API and front-end:

- **Node on the host**: simpler when the machine already has Node/npm
- **Node inside Docker**: recommended to align local and server behavior, avoid host Node installation, and keep the full environment reset working from the dashboard

In the scripts, Docker Node mode is enabled by `DEV_NODE_IMAGE=node:24`.

For the front-end, the most stable validation/deploy mode is:

- `Dev`: `Vite` with file watching
- `Preview`: a static build served by `Nginx`, with `/api` proxying, SSE support, `gzip`, and asset caching

### Quick start

Windows local, in the mode closest to the server:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24 -FrontendMode Preview
```

Windows local, using host Node:

```powershell
.\scripts\start-local-dev.ps1
```

Ubuntu server, with Node in Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://YOUR_IP:3001
```

To stop:

```powershell
.\scripts\stop-local-dev.ps1
```

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/stop-server-dev.sh
```

### What the scripts handle

The scripts under [`scripts`](./scripts):

- start the main stack with the proper preset (`local` or `server`)
- start the API PostgreSQL database and optional Redis cache
- can install dependencies automatically
- start the API and front-end using host Node or Docker Node
- use `Vite` for the front-end in `Dev` and `Nginx` in `Preview/server`
- configure CORS, `/api` proxying, SSE, ports, and healthchecks
- apply `gzip` and asset caching when the front-end is static
- keep separate state under `.local-dev` and `.server-dev`
- in Docker mode, keep the full environment reset working from the dashboard

Note:

- when the real repository folder is something like `G-FShield`, the Compose project name is normalized as `g-fshield`

### Dashboard and operations

The current dashboard covers both operational monitoring and analysis:

- `Overview`: real-time monitor, main cards, and recent events
- `Performance`: metrics by algorithm and by local search
- `Algorithms`: summaries by RCL and DLS
- `Analytics`: paginated feed, filters, topic volume, and supporting charts
- `Executions`: per-seed final workflow, run comparison, and request-level details
- `Run Details`: persisted history by `seedId`, with pagination and aggregated timeline

Recent front-end improvements now documented in the project:

- front-end migration to `Vite`
- lazy loading by route and by heavy dashboard tab
- `TanStack Query` for remote caching, deduplication, and fewer unnecessary refetches
- `Nginx` in `Preview/server` mode, with `/api` proxying, SSE, `gzip`, and asset caching
- async CSV/JSON export
- export by full request, full run, timeline slice, and full filtered table dataset
- table filters by algorithm, dataset, status, free-text search, and `F1` range
- exports now follow the exact filters applied in the UI
- time filters with calendar inputs, timestamp search, and a default `15m` window
- hourly activity chart
- `DLS Outcome Summary`
- `Run Comparison Studio`
- server-side paginated feed
- `Run Details` with paginated history and time-windowed aggregates
- summarized comparison mode to avoid heavy initial payloads
- virtualization for the heaviest tables

Recent API improvements now documented in the project:

- two-layer cache: local memory + optional `Redis`
- aggregated bootstrap at `GET /api/grasp/monitor/bootstrap`
- incremental projection at `GET /api/grasp/monitor/projection`
- main dashboard aggregate at `GET /api/grasp/monitor/dashboard`
- paginated and filterable feed at `GET /api/grasp/monitor/feed`
- async export jobs at `POST /api/grasp/monitor/export-jobs`
- materialized analytical read model in PostgreSQL for dashboard metrics and timeline buckets
- live-window summaries served from memory when possible, with persisted-store fallback
- full environment reset with Docker-socket fallback when the `docker` binary is unavailable inside the API container

### Authentication

Main roles:

- `ADMIN`: manages users and dispatches executions
- `VIEWER`: follows the dashboard, datasets, and monitor

Default seeded login:

- email: `admin@admin.com`
- password: `senhaSegura123`

### Documentation

- [`docs/README.md`](./docs/README.md)
- [`docs/LOCAL_DEV_RUNBOOK.md`](./docs/LOCAL_DEV_RUNBOOK.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`webservice/README.md`](./webservice/README.md)
- [`webservice/api/README.md`](./webservice/api/README.md)
- [`webservice/front/README.md`](./webservice/front/README.md)
