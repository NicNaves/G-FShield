#!/usr/bin/env bash

[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/dev-common.sh"

KEEP_DOCKER="false"
RESET_DATABASE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-docker)
      KEEP_DOCKER="true"
      shift
      ;;
    --reset-database)
      RESET_DATABASE="true"
      shift
      ;;
    *)
      echo "Parametro desconhecido: $1" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="${DEV_REPO_ROOT}"
API_DIR="${REPO_ROOT}/webservice/api"
STATE_FILE="${REPO_ROOT}/.local-dev/processes.env"
ROOT_COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
ROOT_PRESET_COMPOSE_FILE="${REPO_ROOT}/docker-compose.local.yml"
DB_COMPOSE_FILE="${API_DIR}/docker-compose.db.yml"
DB_PRESET_COMPOSE_FILE="${API_DIR}/docker-compose.db.local.yml"

stop_recorded_processes "$STATE_FILE"

if [[ "$KEEP_DOCKER" != "true" ]]; then
  echo "Parando stack local do GF-Shield..."
  invoke_compose "$REPO_ROOT" -f "$ROOT_COMPOSE_FILE" -f "$ROOT_PRESET_COMPOSE_FILE" down

  DB_DOWN_ARGS=(-f "$DB_COMPOSE_FILE" -f "$DB_PRESET_COMPOSE_FILE" down)
  if [[ "$RESET_DATABASE" == "true" ]]; then
    DB_DOWN_ARGS+=(-v)
  fi

  echo "Parando banco local do webservice/api..."
  invoke_compose "$REPO_ROOT" "${DB_DOWN_ARGS[@]}"
fi

echo "Ambiente local encerrado."
