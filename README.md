# GF-Shield

Distributed feature selection for intrusion detection systems with DRG, DLS, Kafka, and a web monitoring layer.

![Architecture Overview](./figures/ArquiteturaFull.drawio.png)

## PT-BR

### Visao geral

O **GF-Shield** e uma arquitetura distribuida baseada na metaheuristica **GRASP-FS** para selecao de atributos em cenarios de IDS. O fluxo do projeto combina:

- **DRG (Distributed RCL Generator)** para gerar solucoes iniciais
- **DLS (Distributed Local Search)** para refinar essas solucoes
- **Kafka** para orquestrar o pipeline
- **Webservice** para autenticacao, disparo de execucoes e monitoramento

### Arquitetura

#### Visao completa

![Arquitetura completa](./figures/ArquiteturaFull.drawio.png)

#### Fluxo da busca local

![Distributed Local Search](./figures/dls.png)

#### Visao tecnologica

![Project Tech](./figures/ProjectTech.png)

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

### Mapa de servicos

#### DRG

- Relief: `8086`
- Symmetrical Uncertainty: `8087`
- Gain Ratio: `8088`
- Information Gain: `8089`

#### DLS

- BitFlip: `8082`
- IWSS: `8083`
- IWSSR: `8084`
- Verify: `8085`
- RVND: `8090`
- VND: `8091`

#### Infraestrutura e suporte

- Kafbat UI: `8080`
- Kafka: `9092`
- Zookeeper: `2181`
- Web front-end: `3000`
- Web API: `4000`
- Swagger: `4000/api-docs`

### Inicio rapido

Windows local:

```powershell
.\scripts\start-local-dev.ps1
.\scripts\stop-local-dev.ps1
```

Windows server:

```powershell
.\scripts\start-server-dev.ps1
.\scripts\stop-server-dev.ps1
```

Ubuntu local:

```bash
bash scripts/start-local-dev.sh
bash scripts/stop-local-dev.sh
```

Ubuntu server:

```bash
bash scripts/start-server-dev.sh
bash scripts/stop-server-dev.sh
```

### Scripts auxiliares

Os scripts em [`scripts`](./scripts) cobrem os dois presets de recurso (`local` e `server`) e os dois ambientes operacionais principais:

- PowerShell para Windows:
  `start-local-dev.ps1`, `stop-local-dev.ps1`, `start-server-dev.ps1`, `stop-server-dev.ps1`
- Shell para Ubuntu:
  `start-local-dev.sh`, `stop-local-dev.sh`, `start-server-dev.sh`, `stop-server-dev.sh`

Todos eles:

- sobem a stack principal com o compose base + preset correto
- sobem o banco da API com o compose base + preset correto
- iniciam API e front fora do Docker
- mantem estado separado entre `local` e `server`

### Monitoramento e persistencia

- eventos de execucao usados no dashboard sao persistidos pela API
- metricas CSV ficam na pasta [`metrics`](./metrics)
- o front persiste `token`, `role`, `userId`, `darkMode` e notificacoes em `localStorage`
- launches da fila de execucao sao persistidas em `GraspExecutionLaunch`
- `queueState` representa o estado do despacho; `status` representa o termino real do pipeline monitorado

### Funcionalidades recentes

- fila de execucoes com cancelamento best-effort
- pagina `Run Details` por `seedId`
- comparacao entre execucoes no dashboard
- aba `Analytics` com feed visivel de solucoes, volume por topico e estatisticas do monitor
- catalogo enriquecido de datasets
- `Request Summary` persistido em `Settings > Operations`
- `Settings > Operations` com limpeza local, reset do monitor e reset completo do ambiente com modal de confirmacao
- progresso de seeds esperadas x concluidas na fila de execucao
- links clicaveis de seed nas tabelas e alerts

### Presets de recursos

- [`docker-compose.local.yml`](./docker-compose.local.yml)
- [`docker-compose.server.yml`](./docker-compose.server.yml)
- [`webservice/api/docker-compose.db.local.yml`](./webservice/api/docker-compose.db.local.yml)
- [`webservice/api/docker-compose.db.server.yml`](./webservice/api/docker-compose.db.server.yml)

### Autenticacao

Perfis principais:

- `ADMIN`: gerencia usuarios e dispara execucoes
- `VIEWER`: acompanha dashboard, datasets e monitor

Login padrao em ambiente real seedado:

- email: `admin@admin.com`
- senha: `senhaSegura123`

### Documentacao

- [`docs/README.md`](./docs/README.md)
- [`docs/LOCAL_DEV_RUNBOOK.md`](./docs/LOCAL_DEV_RUNBOOK.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`webservice/README.md`](./webservice/README.md)
- [`webservice/api/README.md`](./webservice/api/README.md)
- [`webservice/front/README.md`](./webservice/front/README.md)

### Colaboradores

- [Silvio Ereno Quincozes](https://github.com/sequincozes)
- [Estevao Filipe Cardoso](https://github.com/EstevaoFCardoso)

## EN-US

### Overview

**GF-Shield** is a distributed architecture built around the **GRASP-FS** metaheuristic for feature selection in IDS scenarios. The project combines:

- **DRG (Distributed RCL Generator)** to produce initial solutions
- **DLS (Distributed Local Search)** to refine those solutions
- **Kafka** to orchestrate the pipeline
- **Webservice** for authentication, execution dispatch, and monitoring

### Architecture

#### Full view

![Full architecture](./figures/ArquiteturaFull.drawio.png)

#### Local-search flow

![Distributed Local Search](./figures/dls.png)

#### Technology view

![Project Tech](./figures/ProjectTech.png)

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

### Service map

#### DRG

- Relief: `8086`
- Symmetrical Uncertainty: `8087`
- Gain Ratio: `8088`
- Information Gain: `8089`

#### DLS

- BitFlip: `8082`
- IWSS: `8083`
- IWSSR: `8084`
- Verify: `8085`
- RVND: `8090`
- VND: `8091`

#### Infrastructure and support

- Kafbat UI: `8080`
- Kafka: `9092`
- Zookeeper: `2181`
- Web front-end: `3000`
- Web API: `4000`
- Swagger: `4000/api-docs`

### Quick start

Windows local:

```powershell
.\scripts\start-local-dev.ps1
.\scripts\stop-local-dev.ps1
```

Windows server:

```powershell
.\scripts\start-server-dev.ps1
.\scripts\stop-server-dev.ps1
```

Ubuntu local:

```bash
bash scripts/start-local-dev.sh
bash scripts/stop-local-dev.sh
```

Ubuntu server:

```bash
bash scripts/start-server-dev.sh
bash scripts/stop-server-dev.sh
```

### Helper scripts

The scripts under [`scripts`](./scripts) cover both resource presets (`local` and `server`) and both main operating-system flows:

- PowerShell for Windows:
  `start-local-dev.ps1`, `stop-local-dev.ps1`, `start-server-dev.ps1`, `stop-server-dev.ps1`
- Shell for Ubuntu:
  `start-local-dev.sh`, `stop-local-dev.sh`, `start-server-dev.sh`, `stop-server-dev.sh`

All of them:

- start the main stack with the base compose file plus the correct preset
- start the API database with the base DB compose file plus the correct preset
- start the API and front-end outside Docker
- keep separate state for `local` and `server`

### Monitoring and persistence

- execution events used by the dashboard are persisted by the API
- CSV metrics are stored under [`metrics`](./metrics)
- the front-end stores `token`, `role`, `userId`, `darkMode`, and notifications in `localStorage`
- execution queue launches are persisted in `GraspExecutionLaunch`
- `queueState` represents dispatch state; `status` represents real monitored pipeline completion

### Recent features

- execution queue with best-effort cancellation
- `Run Details` page by `seedId`
- execution comparison in the dashboard
- `Analytics` tab with visible solution feed, topic volume, and monitor statistics
- enriched dataset catalog
- persisted `Request Summary` under `Settings > Operations`
- `Settings > Operations` with local cleanup, monitor reset, and full environment reset with confirmation modal
- expected-vs-completed seed progress in the execution queue
- clickable seed links across tables and alerts

### Resource presets

- [`docker-compose.local.yml`](./docker-compose.local.yml)
- [`docker-compose.server.yml`](./docker-compose.server.yml)
- [`webservice/api/docker-compose.db.local.yml`](./webservice/api/docker-compose.db.local.yml)
- [`webservice/api/docker-compose.db.server.yml`](./webservice/api/docker-compose.db.server.yml)

### Authentication

Main roles:

- `ADMIN`: manages users and dispatches executions
- `VIEWER`: follows the dashboard, datasets, and monitor

Default seeded login in real mode:

- email: `admin@admin.com`
- password: `senhaSegura123`

### Documentation

- [`docs/README.md`](./docs/README.md)
- [`docs/LOCAL_DEV_RUNBOOK.md`](./docs/LOCAL_DEV_RUNBOOK.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`webservice/README.md`](./webservice/README.md)
- [`webservice/api/README.md`](./webservice/api/README.md)
- [`webservice/front/README.md`](./webservice/front/README.md)

### Contributors

- [Silvio Ereno Quincozes](https://github.com/sequincozes)
- [Estevao Filipe Cardoso](https://github.com/EstevaoFCardoso)
