# GF-Shield Front-End

## PT-BR

Este front-end e o dashboard operacional do GF-Shield.

### Stack

- React 18
- Material UI 5
- Chart.js
- React Router
- React Toastify

### Principais areas

- `/dashboard`
- `/dashboard/runs/:seedId`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

### Recursos atuais do dashboard

- monitor em tempo real via SSE
- `Run Details` por `seedId`
- exportacao em CSV/JSON nas tabelas compartilhadas
- exportacao por request inteira, run inteira e recorte visivel da timeline
- filtros de tempo com calendario
- busca por timestamp na timeline
- grafico de atividade por horario
- `DLS Outcome Summary`
- `Run Comparison Studio`
- tema escuro refinado e tipografia ajustada

### Performance

As ultimas mudancas do front reduziram o volume inicial de historico carregado no dashboard e usam um limite mais leve para o monitor, o que melhora o comportamento com muitos dados sem perder os detalhes por request e por run.

### Inicializacao

Se voce estiver rodando o projeto completo, prefira os scripts da raiz.

Execucao isolada do front:

```powershell
npm.cmd start
```

Build:

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

This front-end is the GF-Shield operational dashboard.

### Stack

- React 18
- Material UI 5
- Chart.js
- React Router
- React Toastify

### Main areas

- `/dashboard`
- `/dashboard/runs/:seedId`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

### Current dashboard capabilities

- real-time monitor through SSE
- `Run Details` by `seedId`
- CSV/JSON export in shared tables
- export by full request, full run, and visible timeline slice
- time filters with calendar inputs
- timeline timestamp search
- hourly activity chart
- `DLS Outcome Summary`
- `Run Comparison Studio`
- refined dark theme and typography

### Performance

Recent front-end changes reduced the initial history volume loaded by the dashboard and use a lighter monitor limit, improving behavior with larger datasets while keeping request-level and run-level detail views available.

### Startup

If you are running the full project, prefer the root-level scripts.

Standalone front-end run:

```powershell
npm.cmd start
```

Build:

```powershell
npm.cmd run build
```

### Browser persistence

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications
