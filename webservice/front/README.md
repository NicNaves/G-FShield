# GF-Shield Front-End

## PT-BR

Este front-end e o dashboard operacional do GF-Shield. Ele substitui grande parte do conteudo padrao do template por paginas especificas do projeto:

- autenticacao
- monitoramento de execucoes
- datasets
- administracao de usuarios
- disparo de execucao
- fila de execucoes e request summary

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
- `Executions`: tabelas por seed e comparacao entre execucoes
- `Run Details`: timeline e historico persistido por seed

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
- `Executions`: per-seed tables and execution comparison
- `Run Details`: persisted timeline and history by seed

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
