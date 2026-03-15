# GF-Shield Front-End

## PT-BR

Este front-end e o dashboard operacional do GF-Shield. Ele substitui grande parte do conteudo padrao do template por paginas especificas do projeto:

- autenticacao
- monitoramento de execucoes
- datasets
- administracao de usuarios
- disparo de execucao
- fila de execucoes e request summary
- operacoes administrativas de reset

### Stack

- React 18
- Material UI 5
- Chart.js
- React Router
- React Toastify

### Paginas principais

- `/dashboard`
- `/dashboard/runs/:seedId`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

### Experiencia principal

- `Overview`: monitor em tempo real e improvement alerts
- `Performance`: metricas por algoritmo e servico
- `Algorithms`: tabelas consolidadas por algoritmo
- `Analytics`: volume por topico, resumo por topico e feed visivel de solucoes
- `Executions`: tabelas por seed e comparacao entre execucoes
- `Run Details`: timeline e historico persistido por seed
- `Settings > Operations`: limpeza local, reset do monitor e reset completo do ambiente com modal de confirmacao

### Semantica da fila de execucao

- `queueState` mostra o estado de despacho da launch
- `status` mostra o estado real do pipeline monitorado
- a fila exibe `expectedSeedCount`, `observedSeedCount` e `completedSeedCount` para explicar por que uma launch ainda esta `running`

### Modo local

```powershell
npm.cmd start
```

### Build

```powershell
npm.cmd run build
```

### Persistencia no browser

- `token`
- `role`
- `userId`
- `darkMode`
- notificacoes do monitor

## EN-US

This front-end is the GF-Shield operational dashboard. It replaces most of the template-only content with project-specific pages for:

- authentication
- execution monitoring
- datasets
- user administration
- execution dispatch
- execution queue and request summary
- administrative reset operations

### Stack

- React 18
- Material UI 5
- Chart.js
- React Router
- React Toastify

### Main pages

- `/dashboard`
- `/dashboard/runs/:seedId`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

### Main experience

- `Overview`: real-time monitoring and improvement alerts
- `Performance`: metrics by algorithm and service
- `Algorithms`: consolidated tables by algorithm
- `Analytics`: topic volume, topic summary, and visible solution feed
- `Executions`: per-seed tables and execution comparison
- `Run Details`: persisted timeline and history by seed
- `Settings > Operations`: browser cleanup, monitor reset, and full environment reset with confirmation modal

### Execution queue semantics

- `queueState` shows launch dispatch state
- `status` shows the real monitored pipeline state
- the queue exposes `expectedSeedCount`, `observedSeedCount`, and `completedSeedCount` so a launch can stay `running` until the whole pipeline finishes

### Local mode

```powershell
npm.cmd start
```

### Build

```powershell
npm.cmd run build
```

### Browser persistence

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications
