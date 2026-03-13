# GF-Shield Front-End

This front-end is the operational dashboard for GF-Shield. It replaces most of the
template-only Material Dashboard content with project-specific pages for:

- authentication
- execution monitoring
- datasets
- user administration
- execution dispatch

## Stack

- React 18
- Material UI 5
- Chart.js
- React Router
- React Toastify

## Main Pages

- `/dashboard`
- `/settings`
- `/datasets`
- `/admin/users`
- `/authentication/sign-in`
- `/authentication/sign-up`

## Auth Modes

The front can run in:

- real mode: depends on the API and JWT login
- mock mode: useful for local UI work without the real auth path

Main variables from [`.env.example`](./.env.example):

```env
REACT_APP_API_URL="http://localhost:4000/api"
REACT_APP_AUTH_DISABLED=false
```

## Local Start

```powershell
npm.cmd start
```

## Production Build

```powershell
npm.cmd run build
```

## Dashboard Notes

The dashboard is tuned to highlight:

- initial solutions from `INITIAL_SOLUTION_TOPIC`
- local-search final results from `SOLUTIONS_TOPIC`
- best solutions from `BEST_SOLUTION_TOPIC`

Improvement notifications are emitted only when a run beats its previous best score.

## Persisted Browser State

The front stores the following keys in `localStorage`:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications

To clear everything in the browser:

```js
localStorage.clear()
```

## UI Notes

- the configurator button in the bottom-right corner can toggle dark mode
- dark mode is persisted in `localStorage`
- dashboard tables are organized to avoid clipping and use horizontal scroll when needed
