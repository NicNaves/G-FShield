# GF-Shield

Distributed feature selection for intrusion detection systems with GRASP-FS, Kafka, DRG, DLS, and a web monitoring layer.

![Architecture Overview](./figures/ArquiteturaFull.drawio.png)

## PT-BR

### Visao geral

O **GF-Shield** combina:

- **DRG (Distributed RCL Generator)** para gerar solucoes iniciais.
- **DLS (Distributed Local Search)** para refinar as seeds geradas.
- **Kafka** para orquestrar o pipeline distribuido.
- **Webservice** para autenticacao, disparo de execucoes, persistencia e dashboard.

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

- Front-end: `3000`
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

- **Node no host**: mais simples quando o ambiente ja tem Node/npm.
- **Node em Docker**: recomendado para alinhar local e servidor, evitar instalacao de Node no host e permitir o reset completo do ambiente pelo dashboard.

Nos scripts, o modo Docker e ativado por `DEV_NODE_IMAGE=node:24`.

### Inicio rapido

Windows local, no modo mais parecido com o servidor:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24
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
- sobem o PostgreSQL da API
- podem instalar dependencias automaticamente
- podem iniciar API e front usando Node no host ou em container Docker
- mantem estados separados em `.local-dev` e `.server-dev`
- configuram CORS, portas e healthcheck
- no modo Docker, deixam o reset completo do ambiente funcional no dashboard

Observacao:

- quando o repositorio real esta em uma pasta como `G-FShield`, o nome do projeto Compose fica normalizado como `g-fshield`

### Dashboard e operacao

O dashboard atual cobre monitoramento operacional e analise:

- `Overview`: monitor em tempo real, cards principais e eventos recentes
- `Performance`: metricas por algoritmo e por busca local
- `Algorithms`: resumos por RCL e por DLS
- `Analytics`: feed visivel do monitor, volume por topico e graficos auxiliares
- `Executions`: workflow final por seed, comparacao entre runs e detalhes de request
- `Run Details`: historico persistido completo por `seedId`

Melhorias recentes refletidas no front:

- migracao do front para `Vite`, com lazy loading por rota
- `TanStack Query` para cache de detalhes de request e run
- exportacao em CSV e JSON no dashboard e nas tabelas compartilhadas
- exportacao por request inteira, run inteira e recorte visivel da timeline
- filtros de tempo com calendario, busca por timestamp e janela padrao de `15m`
- grafico de atividade por horario
- `DLS Outcome Summary` mostrando atividade visivel de `BIT_FLIP`, `IWSS` e `IWSSR`, nao apenas a busca final vencedora
- `Run Comparison Studio`
- tabelas pesadas com virtualizacao de janela no feed analitico e no historico de run
- modo escuro e tipografia refinados

Melhorias recentes refletidas na API:

- cache em memoria com `Redis` opcional
- bootstrap agregado em `GET /api/grasp/monitor/bootstrap`
- projecao incremental do monitor em `GET /api/grasp/monitor/projection`
- resumo do monitor servido a partir da janela viva quando possivel, com fallback para o store persistido

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

- Front-end: `3000`
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

- **Node on the host**: simpler when the machine already has Node/npm.
- **Node inside Docker**: recommended to align local and server behavior, avoid host Node installation, and keep the full environment reset working from the dashboard.

In the scripts, Docker Node mode is enabled by `DEV_NODE_IMAGE=node:24`.

### Quick start

Windows local, in the mode closest to the server:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24
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
- start the API PostgreSQL database
- can install dependencies automatically
- can start the API and front-end using host Node or Docker Node
- keep separate state under `.local-dev` and `.server-dev`
- configure CORS, ports, and healthchecks
- in Docker mode, keep the full environment reset working from the dashboard

Note:

- when the real repository folder is something like `G-FShield`, the Compose project name is normalized as `g-fshield`

### Dashboard and operations

The current dashboard covers both operational monitoring and analysis:

- `Overview`: real-time monitor, main cards, and recent events
- `Performance`: metrics by algorithm and by local search
- `Algorithms`: summaries by RCL and DLS
- `Analytics`: visible monitor feed, topic volume, and supporting charts
- `Executions`: per-seed final workflow, run comparison, and request-level details
- `Run Details`: full persisted history by `seedId`

Recent front-end improvements now documented in the project:

- front-end migration to `Vite`, with route-level lazy loading
- `TanStack Query` for request/run detail caching
- CSV and JSON export in the dashboard and shared tables
- export by full request, full run, and visible timeline slice
- time filters with calendar inputs, timestamp search, and a default `15m` window
- hourly activity chart
- `DLS Outcome Summary` showing visible `BIT_FLIP`, `IWSS`, and `IWSSR` activity instead of only the winning final search
- `Run Comparison Studio`
- virtualized heavy tables for the analytics feed and run history
- refined dark theme and typography

Recent API improvements now documented in the project:

- in-memory cache with optional `Redis`
- aggregated bootstrap at `GET /api/grasp/monitor/bootstrap`
- incremental monitor projection at `GET /api/grasp/monitor/projection`
- live-window summaries served from memory when possible, with persisted-store fallback

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
