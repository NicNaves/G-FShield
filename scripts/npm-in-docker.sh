#!/usr/bin/env bash

set -euo pipefail

IMAGE="${DEV_NODE_IMAGE:-node:24}"
WORKDIR="${PWD}"
CACHE_DIR="${WORKDIR}/.docker-npm-cache"
HOME_DIR="${WORKDIR}/.docker-home"
DATASETS_HOST_DIR="${DEV_DATASETS_HOST_DIR:-}"
REPO_ROOT="${DEV_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONTAINER_REPO_ROOT="/workspace-root"
DEFAULT_COMPOSE_PROJECT_NAME="$(basename "$REPO_ROOT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"

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
DOCKER_ARGS=()
FORWARDED_VARS=(
  API_PORT
  AUTH_DISABLED
  BROWSER
  CHOKIDAR_USEPOLLING
  CI
  CORS_ORIGINS
  DOCKER_HOST
  GF_SHIELD_COMPOSE_FILES
  GF_SHIELD_COMPOSE_PROJECT_NAME
  GF_SHIELD_DOCKER_BIN
  GF_SHIELD_METRICS_DIR
  GF_SHIELD_PROJECT_ROOT
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

if [[ "$WORKDIR" == "${REPO_ROOT}/webservice/api" ]]; then
  VOLUME_ARGS+=(-v "${REPO_ROOT}:${CONTAINER_REPO_ROOT}")

  if [[ -S /var/run/docker.sock ]]; then
    VOLUME_ARGS+=(-v "/var/run/docker.sock:/var/run/docker.sock")
    docker_socket_gid="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || true)"
    if [[ -n "$docker_socket_gid" ]]; then
      DOCKER_ARGS+=(--group-add "$docker_socket_gid")
    fi
  fi

  if [[ -x /usr/bin/docker ]]; then
    VOLUME_ARGS+=(-v "/usr/bin/docker:/usr/local/bin/docker:ro")
    if [[ -z "${GF_SHIELD_DOCKER_BIN:-}" ]]; then
      ENV_ARGS+=(-e "GF_SHIELD_DOCKER_BIN=/usr/local/bin/docker")
    fi
  fi

  for docker_plugins_dir in /usr/libexec/docker/cli-plugins /usr/lib/docker/cli-plugins; do
    if [[ -d "$docker_plugins_dir" ]]; then
      VOLUME_ARGS+=(-v "${docker_plugins_dir}:${docker_plugins_dir}:ro")
      break
    fi
  done

  if [[ -z "${GF_SHIELD_PROJECT_ROOT:-}" ]]; then
    ENV_ARGS+=(-e "GF_SHIELD_PROJECT_ROOT=${CONTAINER_REPO_ROOT}")
  fi

  if [[ -z "${GF_SHIELD_METRICS_DIR:-}" ]]; then
    ENV_ARGS+=(-e "GF_SHIELD_METRICS_DIR=${CONTAINER_REPO_ROOT}/metrics")
  fi

  if [[ -z "${GF_SHIELD_COMPOSE_PROJECT_NAME:-}" ]]; then
    ENV_ARGS+=(-e "GF_SHIELD_COMPOSE_PROJECT_NAME=${DEFAULT_COMPOSE_PROJECT_NAME}")
  fi
fi

exec docker run --rm \
  --network host \
  "${DOCKER_ARGS[@]}" \
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
