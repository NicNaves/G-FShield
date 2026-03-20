#!/usr/bin/env bash

set -euo pipefail

IMAGE="${DEV_NODE_IMAGE:-node:24}"
WORKDIR="${PWD}"
CACHE_DIR="${WORKDIR}/.docker-npm-cache"
HOME_DIR="${WORKDIR}/.docker-home"
DATASETS_HOST_DIR="${DEV_DATASETS_HOST_DIR:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker nao encontrado. Instale o Docker ou use npm no host." >&2
  exit 1
fi

mkdir -p "$CACHE_DIR" "$HOME_DIR"

if [[ -z "$DATASETS_HOST_DIR" && -d "${WORKDIR}/../../datasets" ]]; then
  DATASETS_HOST_DIR="$(cd "${WORKDIR}/../../datasets" && pwd)"
fi

ENV_ARGS=()
VOLUME_ARGS=()
FORWARDED_VARS=(
  API_PORT
  AUTH_DISABLED
  BROWSER
  CHOKIDAR_USEPOLLING
  CI
  CORS_ORIGINS
  GRASP_DATASETS_DIR
  HOST
  MOCK_DATA_ENABLED
  NODE_ENV
  PORT
  REACT_APP_API_URL
  REACT_APP_AUTH_DISABLED
  SWAGGER_SERVER_URL
  WATCHPACK_POLLING
  WDS_SOCKET_PORT
)

for var_name in "${FORWARDED_VARS[@]}"; do
  if [[ -n "${!var_name:-}" ]]; then
    ENV_ARGS+=(-e "$var_name")
  fi
done

if [[ -n "$DATASETS_HOST_DIR" && -d "$DATASETS_HOST_DIR" ]]; then
  VOLUME_ARGS+=(-v "${DATASETS_HOST_DIR}:/datasets")
  if [[ -z "${GRASP_DATASETS_DIR:-}" ]]; then
    ENV_ARGS+=(-e "GRASP_DATASETS_DIR=/datasets")
  fi
fi

exec docker run --rm \
  --network host \
  -u "$(id -u):$(id -g)" \
  -v "${WORKDIR}:/workspace" \
  -w /workspace \
  -e HOME=/tmp/codex-home \
  -e npm_config_cache=/tmp/codex-npm-cache \
  -v "${HOME_DIR}:/tmp/codex-home" \
  -v "${CACHE_DIR}:/tmp/codex-npm-cache" \
  "${VOLUME_ARGS[@]}" \
  "${ENV_ARGS[@]}" \
  "$IMAGE" \
  npm "$@"
