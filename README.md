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

- Conduktor Console: `8080`
- Kafka: `9092`
- Zookeeper: `2181`
- Web front-end: `3000`
- Web API: `4000`
- Swagger: `4000/api-docs`

### Inicio rapido

Suba a stack principal:

```powershell
docker compose up -d --build
```

Suba o banco da API:

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
```

Execute migracao e seed:

```powershell
cd .\webservice\api
npm.cmd run migrate
```

Inicie API e front:

```powershell
cd .\webservice\api
npm.cmd run dev
```

```powershell
cd .\webservice\front
npm.cmd start
```

### Scripts auxiliares

Tambem e possivel iniciar o ambiente local com os scripts em [`scripts`](./scripts):

```powershell
.\scripts\start-local-dev.ps1
```

Para encerrar:

```powershell
.\scripts\stop-local-dev.ps1
```

### Monitoramento e persistencia

- eventos de execucao usados no dashboard sao persistidos pela API
- metricas CSV ficam na pasta [`metrics`](./metrics)
- o front persiste `token`, `role`, `userId`, `darkMode` e notificacoes em `localStorage`

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

- Conduktor Console: `8080`
- Kafka: `9092`
- Zookeeper: `2181`
- Web front-end: `3000`
- Web API: `4000`
- Swagger: `4000/api-docs`

### Quick start

Start the main stack:

```powershell
docker compose up -d --build
```

Start the API database:

```powershell
cd .\webservice\api
docker compose -f .\docker-compose.db.yml up -d
```

Run migration and seed:

```powershell
cd .\webservice\api
npm.cmd run migrate
```

Start API and front-end:

```powershell
cd .\webservice\api
npm.cmd run dev
```

```powershell
cd .\webservice\front
npm.cmd start
```

### Helper scripts

You can also start the local environment with the scripts under [`scripts`](./scripts):

```powershell
.\scripts\start-local-dev.ps1
```

To stop everything:

```powershell
.\scripts\stop-local-dev.ps1
```

### Monitoring and persistence

- execution events used by the dashboard are persisted by the API
- CSV metrics are stored under [`metrics`](./metrics)
- the front-end stores `token`, `role`, `userId`, `darkMode`, and notifications in `localStorage`

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
