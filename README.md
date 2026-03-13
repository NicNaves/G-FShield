# GF-Shield

![Java 17](https://img.shields.io/badge/Java-17-0b7285)
![Node.js](https://img.shields.io/badge/Node.js-Local%20Webservice-339933)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED)
![Status](https://img.shields.io/badge/status-local%20dev%20ready-success)

Distributed feature selection for IDS with GRASP-FS.  
Selecao de features distribuida para IDS com GRASP-FS.

GF-Shield is a distributed architecture based on the GRASP-FS metaheuristic for
feature selection in Intrusion Detection Systems. The repository combines Java
microservices for solution generation and local search, Kafka for orchestration,
and a Node.js + React webservice for execution control, monitoring, and user
management.

O GF-Shield e uma arquitetura distribuida baseada na metaheuristica GRASP-FS para
selecao de atributos em sistemas de deteccao de intrusoes. O repositorio combina
microsservicos Java para geracao de solucoes e busca local, Kafka para
orquestracao, e um webservice Node.js + React para execucao, monitoramento e
gestao de usuarios.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Service Map](#service-map)
- [Quick Start](#quick-start)
- [Manual Start](#manual-start)
- [Monitoring and Logs](#monitoring-and-logs)
- [Authentication](#authentication)
- [Documentation Index](#documentation-index)
- [Notes for Commits](#notes-for-commits)
- [Contributors](#contributors)

## Overview

GF-Shield is organized in three major layers:

- `DRG (Distributed RCL Generator)`: generates initial solutions using feature ranking algorithms.
- `DLS (Distributed Local Search)`: improves those solutions and verifies the best result per `seedId`.
- `Webservice`: exposes the API, Swagger, user management, execution launcher, and monitoring dashboard.

Main Kafka topics used by the pipeline:

- `INITIAL_SOLUTION_TOPIC`
- `SOLUTIONS_TOPIC`
- `BEST_SOLUTION_TOPIC`
- `LOCAL_SEARCH_PROGRESS_TOPIC`

PT-BR:

- `DRG` gera listas candidatas iniciais a partir dos datasets.
- `DLS` otimiza essas solucoes com busca local distribuida.
- `Webservice` centraliza autenticacao, execucao, monitoramento e dashboard.

## Architecture

### End-to-End Architecture

![GF-Shield End-to-End Architecture](./figures/ArquiteturaFull.drawio.png)

PT-BR:  
Arquitetura completa do pipeline, desde os datasets compartilhados, passando pela
geracao de solucoes iniciais no `DRG`, refinamento no `DLS`, transporte por Kafka
e visualizacao no `webservice`.

EN:  
Complete pipeline view, starting from shared datasets, moving through
initial-solution generation in `DRG`, refinement in `DLS`, Kafka-based
orchestration, and monitoring in the `webservice`.

### Architecture Reading

- `DRG (Distributed RCL Generator)`: runs Information Gain, Gain Ratio, RelieF, and Symmetrical Uncertainty to produce initial candidate solutions.
- `DLS (Distributed Local Search)`: consumes those initial solutions and applies local search and neighborhood strategies such as BitFlip, IWSS, IWSSR, VND, and RVND.
- `Verify`: compares candidate outcomes and promotes only the best solution for each `seedId`.
- `Webservice`: exposes the API, Swagger, execution launcher, monitoring endpoints, authentication, and dashboard views.

PT-BR:

- `DRG`: executa algoritmos de selecao de atributos para gerar solucoes iniciais.
- `DLS`: consome essas solucoes e aplica estrategias de busca local e vizinhanca.
- `Verify`: compara os resultados produzidos e promove apenas a melhor solucao por `seedId`.
- `Webservice`: concentra API, Swagger, execucao, autenticacao e monitoramento.

### Distributed Local Search Flow

![GF-Shield DLS Flow](./figures/dls.png)

PT-BR:  
Fluxo focado na busca local distribuida. As solucoes iniciais entram nos servicos
de busca, passam pelas estrategias de vizinhanca e chegam ao `Verify`, que decide
se houve melhora real antes de publicar a melhor solucao.

EN:  
Focused view of the distributed local-search stage. Initial solutions enter the
local search services, move through neighborhood strategies, and are evaluated by
`Verify`, which publishes only real improvements as best solutions.

### Project Technology View

![GF-Shield Project Technology View](./figures/ProjectTech.png)

PT-BR:  
Visao tecnologica do projeto com os componentes principais do ecossistema:
microsservicos Java, Kafka, PostgreSQL, API Node.js e front-end React.

EN:  
Technology-oriented view of the stack, highlighting the Java microservices,
Kafka, PostgreSQL, Node.js API, and React front-end.

### Pipeline Flow

```text
[datasets/] -> [DRG Microservices] -> [Kafka: INITIAL_SOLUTION_TOPIC]
                                       -> [DLS Microservices]
                                       -> [Kafka: SOLUTIONS_TOPIC]
                                       -> [Verify]
                                       -> [Kafka: BEST_SOLUTION_TOPIC]
                                       -> [Webservice / Dashboard / IDS analysis]
```

PT-BR:  
Os datasets ficam montados em `/datasets`, os servicos `DRG` geram solucoes
iniciais, os servicos `DLS` tentam melhora-las, o `Verify` escolhe a melhor por
execucao e o `webservice` apresenta esse estado no dashboard.

EN:  
Datasets are mounted in `/datasets`, `DRG` services generate initial solutions,
`DLS` services try to improve them, `Verify` selects the best outcome per
execution, and the `webservice` exposes that state in the dashboard.

The repository also keeps PDF exports and supporting architecture assets in
[`figures`](./figures).

## Repository Layout

- [`docker-compose.yml`](./docker-compose.yml): main stack for Kafka, PostgreSQL, Conduktor, DRG, and DLS.
- [`datasets`](./datasets): shared `.arff` datasets mounted into the Java services.
- [`metrics`](./metrics): generated CSV metrics from DRG and DLS services.
- [`grasp-fs-rcl-generator`](./grasp-fs-rcl-generator): DRG microservices.
- [`grasp-fs-distributed-ls`](./grasp-fs-distributed-ls): DLS and verify services.
- [`webservice`](./webservice): API and React front-end.
- [`docs`](./docs): local runbook and operational documentation.
- [`scripts`](./scripts): helper scripts for local startup and shutdown.

## Service Map

### DRG

- RelieF: `http://localhost:8086`
- Symmetrical Uncertainty: `http://localhost:8087`
- Gain Ratio: `http://localhost:8088`
- Information Gain: `http://localhost:8089`

### DLS

- Bit Flip: `http://localhost:8082`
- IWSS: `http://localhost:8083`
- IWSSR: `http://localhost:8084`
- Verify: `http://localhost:8085`
- RVND: `http://localhost:8090`
- VND: `http://localhost:8091`

### Platform and Webservice

- Kafka: `localhost:9092`
- Conduktor: `http://localhost:8080`
- Web API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Front-end: `http://localhost:3000`

## Quick Start

The fastest way to start the project locally is the helper script below.

### Real mode

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real
```

### Mock mode

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Mock
```

### Real mode plus a sample run

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local-dev.ps1 -AuthMode Real -DispatchSampleRun
```

### Stop everything

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-local-dev.ps1
```

## Manual Start

### Main stack

```powershell
docker compose up -d
```

### Webservice database

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
```

### Web API

```powershell
cd .\webservice\api
npm.cmd run migrate
npm.cmd run dev
```

### Front-end

```powershell
cd .\webservice\front
npm.cmd start
```

## Monitoring and Logs

Recent improvements in the repository:

- DRG services now log request receipt, dataset loading, classifier resolution, and total processing time.
- Verify logs are centered around `SOLUTIONS_TOPIC` and `BEST_SOLUTION_TOPIC`, showing candidate evaluation and best-solution promotion.
- The dashboard focuses on initial solutions, local-search final outcomes, best solutions, and improvement-only notifications.
- The front-end supports dark mode through the configurator button in the lower-right corner.

For detailed maintenance commands, use [`docs/OPERATIONS.md`](./docs/OPERATIONS.md).

## Authentication

In real mode, the webservice uses Prisma and PostgreSQL.

Default admin account:

- Email: `admin@admin.com`
- Password: `senhaSegura123`

Roles:

- `ADMIN`: can manage users and start GRASP executions.
- `VIEWER`: can only access dashboard, monitor, and datasets.

## Documentation Index

- [`docs/README.md`](./docs/README.md): documentation index
- [`docs/LOCAL_DEV_RUNBOOK.md`](./docs/LOCAL_DEV_RUNBOOK.md): local development runbook
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md): operational tasks, cleanup, replay, and troubleshooting
- [`webservice/README.md`](./webservice/README.md): API + front overview
- [`webservice/api/README.md`](./webservice/api/README.md): API details
- [`webservice/front/README.md`](./webservice/front/README.md): front-end details

## Notes for Commits

Before shipping or tagging a clean run:

- clear Kafka application topics if you want an empty execution history
- clear `metrics/*.csv` if you want fresh CSV outputs
- stop the stack with `scripts/stop-local-dev.ps1` or `docker compose down`
- if needed, clear browser `localStorage` for `localhost:3000`

## Contributors

- [Silvio Ereno Quincozes](https://github.com/sequincozes)
- [Estevao Filipe Cardoso](https://github.com/EstevaoFCardoso)
