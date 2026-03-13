# Operations Guide

This guide covers common maintenance tasks for GF-Shield.

## Common Log Locations

### DRG request and dataset loading

Use the DRG containers when you want to confirm that a request was received and that dataset loading has started:

```powershell
docker logs -f gf-shield-main-grasp-fs-rcl-ig-1
docker logs -f gf-shield-main-grasp-fs-rcl-gr-1
docker logs -f gf-shield-main-grasp-fs-rcl-su-1
docker logs -f gf-shield-main-grasp-fs-rcl-rf-1
```

Those services now log:

- request receipt
- dataset file path and size
- training/testing dataset load time
- classifier resolution
- initial solution creation
- generation publishing
- total elapsed time

### Local-search final decisions

Use `verify` as the main source of truth for local-search outcomes:

```powershell
docker logs -f gf-shield-main-grasp-fs.dls.verify-1
```

The verify service now logs:

- incoming `SOLUTIONS_TOPIC` result
- candidate vs current-best comparison
- promotion to `BEST_SOLUTION_TOPIC`
- best-solution confirmation

## Reset Metrics CSV Files

```powershell
cmd /c del /q metrics\*.csv
```

The folder should keep only [`.gitkeep`](../metrics/.gitkeep).

## Clear Kafka Application Topics

Start the stack first, then delete the application topics:

```powershell
$topics = @(
  'INITIAL_SOLUTION_TOPIC',
  'LOCAL_SEARCH_PROGRESS_TOPIC',
  'SOLUTIONS_TOPIC',
  'BEST_SOLUTION_TOPIC',
  'BIT_FLIP_TOPIC',
  'IWSS_TOPIC',
  'IWSSR_TOPIC'
)

foreach ($topic in $topics) {
  docker compose exec -T kafka kafka-topics --bootstrap-server kafka:29092 --delete --topic $topic
}
```

Important:

- keep `__consumer_offsets`; it is a Kafka internal topic
- if the stack is still running, services may recreate and republish some topics automatically
- for a clean shutdown after topic deletion, stop the stack right away

## Stop The Entire Docker Stack

```powershell
docker compose down
```

## Clean Shutdown After Topic Deletion

If you want to leave the environment stopped and without application topics:

1. Delete the application topics.
2. Run:

```powershell
docker compose down
```

## Replay Old Kafka Messages In The Web Monitor

If the API starts after Kafka already received messages, enable replay in `webservice/api/.env`:

```env
KAFKA_MONITOR_FROM_BEGINNING=true
KAFKA_MONITOR_GROUP_ID=grasp-fs-monitor-group-replay
```

Use a new `KAFKA_MONITOR_GROUP_ID` whenever you want a fresh replay.

Then restart the API:

```powershell
cd .\webservice\api
npm.cmd run dev
```

## Reset Web Monitor Database State

The API monitor stores execution state in PostgreSQL. If you want a fresh dashboard state,
truncate these tables in the `graspfs` database:

- `GraspExecutionLaunch`
- `GraspExecutionRun`
- `GraspExecutionEvent`

## Front-End Persisted State

The front-end does not persist CSV metrics, but it does persist some browser-side state in `localStorage`:

- `token`
- `role`
- `userId`
- `darkMode`
- monitor notifications

To clear that state in the browser:

```js
localStorage.clear()
```

## Useful Validation Commands

### List running containers

```powershell
docker compose ps --format json
```

### List Kafka topics

```powershell
docker compose exec -T kafka kafka-topics --bootstrap-server kafka:29092 --list
```

### Inspect topic offsets

```powershell
docker compose exec -T kafka kafka-run-class kafka.tools.GetOffsetShell --broker-list kafka:29092 --topic BEST_SOLUTION_TOPIC --time -1
```

### Rebuild selected services

```powershell
docker compose build grasp-fs-rcl-ig grasp-fs-rcl-gr grasp-fs-rcl-su grasp-fs-rcl-rf
docker compose build grasp-fs.dls.verify
```
