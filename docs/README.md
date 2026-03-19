# Documentation Index

## PT-BR

Esta pasta concentra a documentacao operacional do GF-Shield para setup local, setup server, resets, replay e manutencao do ambiente.

### Guias disponiveis

- [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md): fluxo recomendado para subir o projeto com os presets `local` e `server`, em Windows ou Ubuntu.
- [`OPERATIONS.md`](./OPERATIONS.md): limpeza de Kafka, limpeza de metricas, replay do monitor e comandos de suporte.
- [`../docker-compose.local.yml`](../docker-compose.local.yml) e [`../docker-compose.server.yml`](../docker-compose.server.yml): presets de CPU e memoria para local e servidor.
- [`../scripts`](../scripts): scripts `.ps1` e `.sh` para iniciar e parar os ambientes `local` e `server`.

### Ordem recomendada

1. Leia o [`README.md`](../README.md) para entender arquitetura e servicos.
2. Use [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md) para iniciar o ambiente.
3. Use [`OPERATIONS.md`](./OPERATIONS.md) quando precisar resetar, inspecionar logs ou fazer manutencao.

## EN-US

This folder contains GF-Shield operational documentation for local setup, server setup, resets, replay, and day-to-day maintenance.

### Available guides

- [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md): recommended flow for starting the project with the `local` and `server` presets on Windows or Ubuntu.
- [`OPERATIONS.md`](./OPERATIONS.md): Kafka cleanup, metrics cleanup, monitor replay, and support commands.
- [`../docker-compose.local.yml`](../docker-compose.local.yml) and [`../docker-compose.server.yml`](../docker-compose.server.yml): CPU and memory presets for local and server environments.
- [`../scripts`](../scripts): `.ps1` and `.sh` scripts for starting and stopping the `local` and `server` environments.

### Recommended reading order

1. Read the root [`README.md`](../README.md) for architecture and service mapping.
2. Use [`LOCAL_DEV_RUNBOOK.md`](./LOCAL_DEV_RUNBOOK.md) to start the environment.
3. Use [`OPERATIONS.md`](./OPERATIONS.md) whenever you need resets, log inspection, or maintenance.
