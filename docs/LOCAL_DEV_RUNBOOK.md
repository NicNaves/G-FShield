# Local Development Runbook

## PT-BR

### Objetivo

Este guia descreve o fluxo recomendado para subir o GF-Shield localmente e no servidor de desenvolvimento com os scripts atuais.

### Pre-requisitos

Minimo recomendado:

- Docker ou Docker Desktop
- `docker compose`
- PowerShell no Windows ou `bash` no Ubuntu

Opcional:

- Node.js no host, se voce nao quiser usar `DEV_NODE_IMAGE=node:24`

### Modos de execucao

#### 1. Modo recomendado: Node em Docker

Use este modo quando voce quiser:

- alinhar local e servidor
- evitar instalacao de Node/npm no host
- manter o `Restart and clean environment` funcional no dashboard

Windows:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

Ubuntu:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh
```

#### 2. Modo alternativo: Node no host

Use este modo quando sua maquina ja tiver Node configurado.

Windows:

```powershell
.\scripts\start-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/start-local-dev.sh
```

### Fluxo recomendado no servidor de desenvolvimento

Quando o host nao tem Node/npm instalados e voce quer rodar tudo com Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://SEU_IP:3001
```

Se precisar trocar as portas:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --api-port 4001 --frontend-port 3001 --public-front-origin http://SEU_IP:3001
```

### O que os scripts fazem

Os scripts de start:

- sobem a stack principal (`docker-compose.yml` + preset)
- sobem o PostgreSQL da API
- podem instalar dependencias automaticamente
- iniciam API e front
- esperam a API responder no healthcheck
- no modo Docker, montam datasets, repo root e configuracao de reset

Os scripts de stop:

- param API e front
- podem manter a stack Docker ligada
- podem derrubar o banco da API
- no PowerShell local, podem limpar volumes de `node_modules` usados pelo modo Docker

### Comandos de parada

Windows:

```powershell
.\scripts\stop-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/stop-local-dev.sh
```

Servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/stop-server-dev.sh
```

Flags uteis:

- manter Docker ligado
  PowerShell: `-KeepDocker`
  Shell: `--keep-docker`
- resetar o banco da API
  PowerShell: `-ResetDatabase`
  Shell: `--reset-database`
- limpar volumes locais do modo Docker
  PowerShell: `-ResetNodeVolumes`

### URLs principais

Local padrao:

- Front: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Kafbat: `http://localhost:8080`

Servidor, exemplo com front em `3001`:

- Front: `http://SEU_IP:3001`
- API: `http://SEU_IP:4000`

### CORS e acesso remoto

Se o front for acessado por IP ou dominio remoto, passe a origem publica no start do servidor:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://200.156.91.194:3001
```

Se precisar definir tudo manualmente:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --cors-origins "http://200.156.91.194:3001,http://localhost:3001"
```

### Credencial seedada

Modo real com seed:

- email: `admin@admin.com`
- senha: `senhaSegura123`

### Dashboard: o que mudou

O front atual inclui:

- exportacao em CSV/JSON nas tabelas compartilhadas
- exportacao por request, run inteira ou recorte de timeline
- filtro temporal com calendario e busca por timestamp
- grafico de atividade por horario
- `DLS Outcome Summary`, que mostra os algoritmos de busca local visiveis no recorte atual

### Troubleshooting

#### API sobe, mas o front nao consegue logar

Verifique:

- `CORS_ORIGINS`
- porta publica do front
- firewall do servidor

#### Datasets nao aparecem quando a API roda em container

Use o modo Docker dos scripts. Ele monta a pasta `datasets` e ajusta `GRASP_DATASETS_DIR` automaticamente.

#### O dashboard ficou pesado

As versoes mais recentes do front ja reduzem o volume inicial de historico carregado e usam um limite mais leve para o monitor. Mesmo assim, um `Ctrl+F5` apos deploy ajuda a limpar cache antigo.

#### Botao `Restart and clean environment` retorna erro

Use o modo Docker dos scripts para API/front. Nesse modo a API sobe com acesso ao Compose do host e consegue executar o reset completo.

## EN-US

### Goal

This guide describes the recommended way to start GF-Shield locally and on the development server using the current scripts.

### Prerequisites

Recommended minimum:

- Docker or Docker Desktop
- `docker compose`
- PowerShell on Windows or `bash` on Ubuntu

Optional:

- Node.js on the host, if you do not want to use `DEV_NODE_IMAGE=node:24`

### Runtime modes

#### 1. Recommended mode: Node in Docker

Use this mode when you want to:

- align local and server behavior
- avoid installing Node/npm on the host
- keep `Restart and clean environment` working from the dashboard

Windows:

```powershell
.\scripts\start-local-dev.ps1 -DevNodeImage node:24
```

Ubuntu:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-local-dev.sh
```

#### 2. Alternative mode: Node on the host

Use this mode when the machine already has Node configured.

Windows:

```powershell
.\scripts\start-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/start-local-dev.sh
```

### Recommended flow on the development server

When the host does not have Node/npm installed and you want everything through Docker:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://YOUR_IP:3001
```

To change ports:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --api-port 4001 --frontend-port 3001 --public-front-origin http://YOUR_IP:3001
```

### What the scripts do

The start scripts:

- start the main stack (`docker-compose.yml` + preset)
- start the API PostgreSQL database
- can install dependencies automatically
- start the API and front-end
- wait for the API healthcheck
- in Docker mode, mount datasets, repo root, and reset-related runtime settings

The stop scripts:

- stop the API and front-end
- can keep the Docker stack running
- can stop the API database
- on Windows local mode, can clear Docker `node_modules` volumes

### Stop commands

Windows:

```powershell
.\scripts\stop-local-dev.ps1
```

Ubuntu:

```bash
bash scripts/stop-local-dev.sh
```

Server:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/stop-server-dev.sh
```

Useful flags:

- keep Docker running
  PowerShell: `-KeepDocker`
  Shell: `--keep-docker`
- reset the API database
  PowerShell: `-ResetDatabase`
  Shell: `--reset-database`
- clear local Docker-mode Node volumes
  PowerShell: `-ResetNodeVolumes`

### Main URLs

Default local:

- Front: `http://localhost:3000`
- API: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`
- Kafbat: `http://localhost:8080`

Server example with front on `3001`:

- Front: `http://YOUR_IP:3001`
- API: `http://YOUR_IP:4000`

### CORS and remote access

If the front-end is opened through a remote IP or domain, pass the public origin on server startup:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --frontend-port 3001 --public-front-origin http://200.156.91.194:3001
```

To define all origins manually:

```bash
export DEV_NODE_IMAGE=node:24
bash scripts/start-server-dev.sh --cors-origins "http://200.156.91.194:3001,http://localhost:3001"
```

### Seeded credential

Real mode with seed:

- email: `admin@admin.com`
- password: `senhaSegura123`

### Dashboard changes now in place

The current front-end includes:

- CSV/JSON export in shared tables
- export by full request, full run, or timeline slice
- time filters with calendar inputs and timestamp search
- hourly activity chart
- `DLS Outcome Summary`, showing local-search algorithms visible in the current slice

### Troubleshooting

#### API starts, but the front-end cannot log in

Check:

- `CORS_ORIGINS`
- the public front-end port
- the server firewall

#### Datasets do not show up when the API runs in a container

Use the Docker mode from the scripts. It mounts the `datasets` folder and adjusts `GRASP_DATASETS_DIR` automatically.

#### The dashboard feels heavy

Recent front-end changes already reduced the initial history volume and use a lighter monitor limit. Even so, a `Ctrl+F5` after deploy helps clear stale cache.

#### `Restart and clean environment` returns an error

Use the Docker script mode for the API/front-end. In that mode the API starts with access to the host Compose runtime and can perform the full reset.
