#!/usr/bin/env bash

[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${DEV_REPO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
AUTOSTART_SCRIPT="${REPO_ROOT}/scripts/start-server-autostart.sh"
BEGIN_MARKER="# BEGIN GF-SHIELD SERVER AUTOSTART"
END_MARKER="# END GF-SHIELD SERVER AUTOSTART"

FRONTEND_PORT=3001
API_PORT=4000
PUBLIC_FRONTEND_ORIGIN=""
CORS_ORIGINS=""
AUTH_MODE="Real"
REBUILD="false"
SKIP_INSTALL="true"
START_DELAY_SECONDS=25
MAX_ATTEMPTS=3
RETRY_DELAY_SECONDS=20
DOCKER_WAIT_ATTEMPTS=30
DOCKER_WAIT_INTERVAL_SECONDS=5
NODE_IMAGE="${DEV_NODE_IMAGE:-node:24}"

shell_quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --frontend-port)
      FRONTEND_PORT="$2"
      shift 2
      ;;
    --api-port)
      API_PORT="$2"
      shift 2
      ;;
    --public-front-origin)
      PUBLIC_FRONTEND_ORIGIN="$2"
      shift 2
      ;;
    --cors-origins)
      CORS_ORIGINS="$2"
      shift 2
      ;;
    --auth-mode)
      AUTH_MODE="$2"
      shift 2
      ;;
    --rebuild)
      REBUILD="true"
      shift
      ;;
    --install-dependencies-on-boot)
      SKIP_INSTALL="false"
      shift
      ;;
    --start-delay-seconds)
      START_DELAY_SECONDS="$2"
      shift 2
      ;;
    --max-attempts)
      MAX_ATTEMPTS="$2"
      shift 2
      ;;
    --retry-delay-seconds)
      RETRY_DELAY_SECONDS="$2"
      shift 2
      ;;
    --docker-wait-attempts)
      DOCKER_WAIT_ATTEMPTS="$2"
      shift 2
      ;;
    --docker-wait-interval-seconds)
      DOCKER_WAIT_INTERVAL_SECONDS="$2"
      shift 2
      ;;
    --node-image)
      NODE_IMAGE="$2"
      shift 2
      ;;
    *)
      echo "Parametro desconhecido: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab nao encontrado neste host." >&2
  exit 1
fi

if [[ ! -f "${AUTOSTART_SCRIPT}" ]]; then
  echo "Script de autostart nao encontrado em ${AUTOSTART_SCRIPT}" >&2
  exit 1
fi

chmod +x "${AUTOSTART_SCRIPT}" >/dev/null 2>&1 || true

CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "${CURRENT_CRONTAB}" | awk -v begin="${BEGIN_MARKER}" -v end="${END_MARKER}" '
  $0 == begin { skip = 1; next }
  $0 == end { skip = 0; next }
  !skip { print }
')"

CRON_ENTRY="@reboot DEV_REPO_ROOT=$(shell_quote "${REPO_ROOT}") DEV_NODE_IMAGE=$(shell_quote "${NODE_IMAGE}") AUTH_MODE=$(shell_quote "${AUTH_MODE}") API_PORT=$(shell_quote "${API_PORT}") FRONTEND_PORT=$(shell_quote "${FRONTEND_PORT}") PUBLIC_FRONTEND_ORIGIN=$(shell_quote "${PUBLIC_FRONTEND_ORIGIN}") CORS_ORIGINS=$(shell_quote "${CORS_ORIGINS}") REBUILD=$(shell_quote "${REBUILD}") SKIP_INSTALL=$(shell_quote "${SKIP_INSTALL}") START_DELAY_SECONDS=$(shell_quote "${START_DELAY_SECONDS}") MAX_ATTEMPTS=$(shell_quote "${MAX_ATTEMPTS}") RETRY_DELAY_SECONDS=$(shell_quote "${RETRY_DELAY_SECONDS}") DOCKER_WAIT_ATTEMPTS=$(shell_quote "${DOCKER_WAIT_ATTEMPTS}") DOCKER_WAIT_INTERVAL_SECONDS=$(shell_quote "${DOCKER_WAIT_INTERVAL_SECONDS}") bash $(shell_quote "${AUTOSTART_SCRIPT}")"

{
  if [[ -n "${FILTERED_CRONTAB}" ]]; then
    printf '%s\n' "${FILTERED_CRONTAB}"
  fi
  printf '%s\n' "${BEGIN_MARKER}"
  printf '%s\n' "${CRON_ENTRY}"
  printf '%s\n' "${END_MARKER}"
} | crontab -

echo "Autostart do servidor instalado com sucesso."
echo "Entrada atual registrada no crontab:"
crontab -l
