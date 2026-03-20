#!/usr/bin/env bash

[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/dev-common.sh"

AUTH_MODE="Real"
REBUILD="false"
DISPATCH_SAMPLE_RUN="false"
INSTALL_DEPENDENCIES="true"
API_PORT=4000
FRONTEND_PORT=3000
PUBLIC_FRONTEND_ORIGIN=""
CORS_ORIGINS=""
API_HEALTHCHECK_URL=""
MAX_GENERATIONS=2
RCL_CUTOFF=30
SAMPLE_SIZE=5
TRAIN_DATASET="ereno1ktrain.arff"
TEST_DATASET="ereno1ktest.arff"
CLASSIFIER="J48"
NEIGHBORHOOD_STRATEGY="VND"
LOCAL_SEARCHES="BIT_FLIP,IWSS,IWSSR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auth-mode)
      AUTH_MODE="$2"
      shift 2
      ;;
    --rebuild)
      REBUILD="true"
      shift
      ;;
    --dispatch-sample-run)
      DISPATCH_SAMPLE_RUN="true"
      shift
      ;;
    --skip-install)
      INSTALL_DEPENDENCIES="false"
      shift
      ;;
    --api-port)
      API_PORT="$2"
      shift 2
      ;;
    --frontend-port)
      FRONTEND_PORT="$2"
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
    --api-healthcheck-url)
      API_HEALTHCHECK_URL="$2"
      shift 2
      ;;
    --max-generations)
      MAX_GENERATIONS="$2"
      shift 2
      ;;
    --rcl-cutoff)
      RCL_CUTOFF="$2"
      shift 2
      ;;
    --sample-size)
      SAMPLE_SIZE="$2"
      shift 2
      ;;
    --train-dataset)
      TRAIN_DATASET="$2"
      shift 2
      ;;
    --test-dataset)
      TEST_DATASET="$2"
      shift 2
      ;;
    --classifier)
      CLASSIFIER="$2"
      shift 2
      ;;
    --neighborhood-strategy)
      NEIGHBORHOOD_STRATEGY="$2"
      shift 2
      ;;
    --local-searches)
      LOCAL_SEARCHES="$2"
      shift 2
      ;;
    *)
      echo "Parametro desconhecido: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$AUTH_MODE" != "Real" && "$AUTH_MODE" != "Mock" ]]; then
  echo "AuthMode invalido: ${AUTH_MODE}. Use Real ou Mock." >&2
  exit 1
fi

if [[ "$NEIGHBORHOOD_STRATEGY" != "VND" && "$NEIGHBORHOOD_STRATEGY" != "RVND" ]]; then
  echo "NeighborhoodStrategy invalido: ${NEIGHBORHOOD_STRATEGY}. Use VND ou RVND." >&2
  exit 1
fi

if [[ -z "$CORS_ORIGINS" ]]; then
  CORS_ORIGINS="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT},http://localhost:${API_PORT}"
  if [[ -n "$PUBLIC_FRONTEND_ORIGIN" ]]; then
    CORS_ORIGINS="${CORS_ORIGINS},${PUBLIC_FRONTEND_ORIGIN}"
  fi
fi

if [[ -z "$API_HEALTHCHECK_URL" ]]; then
  API_HEALTHCHECK_URL="http://localhost:${API_PORT}/api-docs"
fi

REPO_ROOT="${DEV_REPO_ROOT}"
API_DIR="${REPO_ROOT}/webservice/api"
FRONT_DIR="${REPO_ROOT}/webservice/front"
STATE_DIR="${REPO_ROOT}/.local-dev"
STATE_FILE="${STATE_DIR}/processes.env"
ROOT_COMPOSE_FILE="${REPO_ROOT}/docker-compose.yml"
ROOT_PRESET_COMPOSE_FILE="${REPO_ROOT}/docker-compose.local.yml"
DB_COMPOSE_FILE="${API_DIR}/docker-compose.db.yml"
DB_PRESET_COMPOSE_FILE="${API_DIR}/docker-compose.db.local.yml"
NPM_COMMAND="$(get_npm_command)"

API_AUTH_DISABLED="false"
API_MOCK_DATA_ENABLED="false"
FRONT_AUTH_DISABLED="false"
if [[ "$AUTH_MODE" == "Mock" ]]; then
  API_AUTH_DISABLED="true"
  API_MOCK_DATA_ENABLED="true"
  FRONT_AUTH_DISABLED="true"
fi

ensure_dir "$STATE_DIR"
stop_recorded_processes "$STATE_FILE"

if [[ "$INSTALL_DEPENDENCIES" == "true" ]]; then
  install_node_dependencies "$API_DIR" "webservice/api"
  install_node_dependencies "$FRONT_DIR" "webservice/front"
fi

ROOT_COMPOSE_ARGS=(-f "$ROOT_COMPOSE_FILE" -f "$ROOT_PRESET_COMPOSE_FILE" up -d)
if [[ "$REBUILD" == "true" ]]; then
  ROOT_COMPOSE_ARGS+=(--build)
fi

echo "Subindo stack local do GF-Shield..."
invoke_compose "$REPO_ROOT" "${ROOT_COMPOSE_ARGS[@]}"

echo "Subindo banco local do webservice/api..."
invoke_compose "$REPO_ROOT" -f "$DB_COMPOSE_FILE" -f "$DB_PRESET_COMPOSE_FILE" up -d

API_LOG="${STATE_DIR}/api.log"
FRONT_LOG="${STATE_DIR}/front.log"
: >"$API_LOG"
: >"$FRONT_LOG"

echo "Iniciando API em background..."
API_PID="$(start_managed_process "$API_DIR" "$API_LOG" env API_PORT="$API_PORT" AUTH_DISABLED="$API_AUTH_DISABLED" MOCK_DATA_ENABLED="$API_MOCK_DATA_ENABLED" CORS_ORIGINS="$CORS_ORIGINS" "$NPM_COMMAND" run dev)"

echo "Iniciando front em background..."
FRONT_PID="$(start_managed_process "$FRONT_DIR" "$FRONT_LOG" env BROWSER=none PORT="$FRONTEND_PORT" REACT_APP_API_URL="http://localhost:${API_PORT}/api" REACT_APP_AUTH_DISABLED="$FRONT_AUTH_DISABLED" "$NPM_COMMAND" start)"

write_state_file "$STATE_FILE" "$(date -Iseconds)" "$AUTH_MODE" "$API_PID" "$FRONT_PID" "$API_LOG" "$FRONT_LOG"

echo "Aguardando API responder em ${API_HEALTHCHECK_URL} ..."
if ! wait_for_http "$API_HEALTHCHECK_URL" 120; then
  print_log_tail "API" "$API_LOG"
  print_log_tail "front" "$FRONT_LOG"
  exit 1
fi

if [[ "$DISPATCH_SAMPLE_RUN" == "true" ]]; then
  for port in 8086 8087 8088 8089; do
    echo "Aguardando servico DRG na porta ${port} ..."
    wait_for_tcp_port "localhost" "$port" 240
  done

  echo "Disparando execucao de exemplo pelo gateway..."
  dispatch_sample_run \
    "http://localhost:${API_PORT}" \
    "$MAX_GENERATIONS" \
    "$RCL_CUTOFF" \
    "$SAMPLE_SIZE" \
    "$TRAIN_DATASET" \
    "$TEST_DATASET" \
    "$CLASSIFIER" \
    "$NEIGHBORHOOD_STRATEGY" \
    "$LOCAL_SEARCHES"
  echo
fi

echo
echo "Ambiente local iniciado."
echo "Front: http://localhost:${FRONTEND_PORT}"
echo "API: http://localhost:${API_PORT}"
echo "Swagger: http://localhost:${API_PORT}/api-docs"
echo "Conduktor: http://localhost:8080"
echo "Modo de autenticacao: ${AUTH_MODE}"
echo "Logs API: ${API_LOG}"
echo "Logs front: ${FRONT_LOG}"
