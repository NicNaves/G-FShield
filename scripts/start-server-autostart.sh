#!/usr/bin/env bash

[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/dev-common.sh"

REPO_ROOT="${DEV_REPO_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
AUTOSTART_LOG_DIR="${REPO_ROOT}/.server-dev"
AUTOSTART_LOG_FILE="${AUTOSTART_LOG_DIR}/autostart.log"

START_DELAY_SECONDS="${START_DELAY_SECONDS:-25}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-20}"
DOCKER_WAIT_ATTEMPTS="${DOCKER_WAIT_ATTEMPTS:-30}"
DOCKER_WAIT_INTERVAL_SECONDS="${DOCKER_WAIT_INTERVAL_SECONDS:-5}"
AUTH_MODE="${AUTH_MODE:-Real}"
API_PORT="${API_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
PUBLIC_FRONTEND_ORIGIN="${PUBLIC_FRONTEND_ORIGIN:-}"
CORS_ORIGINS="${CORS_ORIGINS:-}"
REBUILD="${REBUILD:-false}"
SKIP_INSTALL="${SKIP_INSTALL:-true}"

ensure_dir "${AUTOSTART_LOG_DIR}"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "${AUTOSTART_LOG_FILE}"
}

wait_for_docker_daemon() {
  if ! command -v docker >/dev/null 2>&1; then
    log "docker nao encontrado no PATH."
    return 1
  fi

  local attempt=1
  while (( attempt <= DOCKER_WAIT_ATTEMPTS )); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi

    sleep "${DOCKER_WAIT_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done

  log "docker nao respondeu antes do timeout de boot."
  return 1
}

build_start_args() {
  local args=(
    --auth-mode "${AUTH_MODE}"
    --api-port "${API_PORT}"
    --frontend-port "${FRONTEND_PORT}"
  )

  if [[ "${SKIP_INSTALL}" == "true" ]]; then
    args+=(--skip-install)
  fi

  if [[ "${REBUILD}" == "true" ]]; then
    args+=(--rebuild)
  fi

  if [[ -n "${PUBLIC_FRONTEND_ORIGIN}" ]]; then
    args+=(--public-front-origin "${PUBLIC_FRONTEND_ORIGIN}")
  fi

  if [[ -n "${CORS_ORIGINS}" ]]; then
    args+=(--cors-origins "${CORS_ORIGINS}")
  fi

  printf '%s\0' "${args[@]}"
}

main() {
  export DEV_REPO_ROOT="${REPO_ROOT}"
  export DEV_NODE_IMAGE="${DEV_NODE_IMAGE:-node:24}"

  : >"${AUTOSTART_LOG_FILE}"
  log "Autostart do GF-Shield disparado."

  if (( START_DELAY_SECONDS > 0 )); then
    log "Aguardando ${START_DELAY_SECONDS}s antes de subir a stack."
    sleep "${START_DELAY_SECONDS}"
  fi

  wait_for_docker_daemon

  local start_args=()
  while IFS= read -r -d '' arg; do
    start_args+=("${arg}")
  done < <(build_start_args)

  local attempt=1
  while (( attempt <= MAX_ATTEMPTS )); do
    log "Tentativa ${attempt}/${MAX_ATTEMPTS} de subir o ambiente."

    if bash "${REPO_ROOT}/scripts/start-server-dev.sh" "${start_args[@]}" >>"${AUTOSTART_LOG_FILE}" 2>&1; then
      log "Autostart concluido com sucesso."
      return 0
    fi

    log "Falha ao subir o ambiente na tentativa ${attempt}."
    attempt=$((attempt + 1))
    if (( attempt <= MAX_ATTEMPTS )); then
      sleep "${RETRY_DELAY_SECONDS}"
    fi
  done

  log "Autostart falhou apos ${MAX_ATTEMPTS} tentativas."
  return 1
}

main "$@"
