# Documentation Index

## PT-BR

Esta pasta concentra a documentacao operacional e de onboarding do GF-Shield.

### Guias disponiveis

- [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md)
  Fluxo recomendado para subir o projeto em Windows e Ubuntu, com `Vite` no modo `Dev` ou `Nginx` estatico no modo `Preview/server`.
- [`OPERATIONS.md`](./OPERATIONS.md)
  Logs, resets, rebuild seletivo, limpeza de estado, cache com `Redis`, validacao do `Nginx` e observacoes do projeto Compose `g-fshield`.
- [`../README.md`](../README.md)
  Visao geral da arquitetura, mapa de portas, agregacoes do dashboard, `Nginx`, cache e fluxos principais.
- [`../webservice/README.md`](../webservice/README.md)
  Visao consolidada da camada web, incluindo proxy `/api`, SSE, exportacoes e read models.
- [`../webservice/api/README.md`](../webservice/api/README.md)
  Endpoints, persistencia, cache em memoria/`Redis`, read model materializado e reset completo do ambiente.
- [`../webservice/front/README.md`](../webservice/front/README.md)
  Dashboard, filtros, paginacao server-side, exportacao filtrada e operacao do front.

### Ordem recomendada

1. Leia o [`README.md`](../README.md) para entender arquitetura e os modos de execucao.
2. Use [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md) para subir o ambiente.
3. Use [`OPERATIONS.md`](./OPERATIONS.md) para reset, logs, rebuild ou manutencao.

## EN-US

This folder contains GF-Shield operational and onboarding documentation.

### Available guides

- [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md)
  Recommended startup flow on Windows and Ubuntu, with `Vite` in `Dev` mode or a static `Nginx` front-end in `Preview/server` mode.
- [`OPERATIONS.md`](./OPERATIONS.md)
  Logs, resets, selective rebuild, state cleanup, `Redis` cache checks, `Nginx` validation, and notes about the `g-fshield` Compose project.
- [`../README.md`](../README.md)
  Architecture overview, port map, dashboard aggregates, `Nginx`, caching, and main runtime flows.
- [`../webservice/README.md`](../webservice/README.md)
  Consolidated guide for the web layer, including `/api` proxying, SSE, exports, and read models.
- [`../webservice/api/README.md`](../webservice/api/README.md)
  Endpoints, persistence, memory/`Redis` caching, materialized read models, and full environment reset behavior.
- [`../webservice/front/README.md`](../webservice/front/README.md)
  Dashboard behavior, filters, server-side pagination, filtered exports, and front-end operation.

### Recommended order

1. Read [`README.md`](../README.md) to understand architecture and runtime modes.
2. Use [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md) to start the environment.
3. Use [`OPERATIONS.md`](./OPERATIONS.md) for resets, logs, rebuilds, and maintenance.
