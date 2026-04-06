#!/usr/bin/env bash

set -euo pipefail

readonly DEV_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DEV_REPO_ROOT="$(cd "${DEV_COMMON_DIR}/.." && pwd)"
readonly DEV_NPM_DOCKER_SCRIPT="${DEV_COMMON_DIR}/npm-in-docker.sh"

ensure_dir() {
  mkdir -p "$1"
}

get_npm_command() {
  if [[ -n "${DEV_NODE_IMAGE:-}" ]]; then
    if command -v docker >/dev/null 2>&1; then
      chmod +x "$DEV_NPM_DOCKER_SCRIPT" >/dev/null 2>&1 || true
      echo "$DEV_NPM_DOCKER_SCRIPT"
      return 0
    fi

    echo "docker nao encontrado. Instale o Docker ou remova DEV_NODE_IMAGE." >&2
    return 1
  fi

  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "npm nao encontrado. Para usar npm em container, rode com DEV_NODE_IMAGE=node:24." >&2
    return 1
  fi

  echo "npm nao encontrado. Instale o Node.js, ajuste o PATH, ou use Docker com DEV_NODE_IMAGE=node:24." >&2
  return 1
}

invoke_compose() {
  local workdir="$1"
  shift
  (
    cd "$workdir"
    docker compose "$@"
  )
}

run_npm_command() {
  local workdir="$1"
  shift
  local npm_command
  npm_command="$(get_npm_command)"

  (
    cd "$workdir"
    "$npm_command" "$@"
  )
}

install_node_dependencies() {
  local workdir="$1"
  local label="$2"

  if [[ -f "${workdir}/package-lock.json" ]]; then
    echo "Instalando dependencias de ${label}..."
    run_npm_command "$workdir" ci
    return 0
  fi

  if [[ -f "${workdir}/package.json" ]]; then
    echo "Instalando dependencias de ${label} com npm install..."
    run_npm_command "$workdir" install
    return 0
  fi

  echo "package.json nao encontrado em ${workdir}" >&2
  return 1
}

kill_pid_if_running() {
  local pid="${1:-}"
  if [[ -z "$pid" ]]; then
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi
}

load_state_file() {
  local state_file="$1"
  if [[ -f "$state_file" ]]; then
    # shellcheck disable=SC1090
    source "$state_file"
  fi
}

write_state_file() {
  local state_file="$1"
  local started_at="$2"
  local auth_mode="$3"
  local api_pid="$4"
  local front_pid="$5"
  local api_log="$6"
  local front_log="$7"
  local front_container="${8:-}"

  cat >"$state_file" <<EOF
STARTED_AT='${started_at}'
AUTH_MODE='${auth_mode}'
API_PID='${api_pid}'
FRONT_PID='${front_pid}'
API_LOG='${api_log}'
FRONT_LOG='${front_log}'
FRONT_CONTAINER='${front_container}'
EOF
}

remove_docker_container_if_exists() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    return 0
  fi

  if docker ps -a --format '{{.Names}}' | grep -Fxq "$name"; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}

stop_recorded_processes() {
  local state_file="$1"
  if [[ ! -f "$state_file" ]]; then
    return 0
  fi

  local STARTED_AT="" AUTH_MODE="" API_PID="" FRONT_PID="" API_LOG="" FRONT_LOG="" FRONT_CONTAINER=""
  load_state_file "$state_file"

  kill_pid_if_running "${API_PID:-}"
  kill_pid_if_running "${FRONT_PID:-}"
  remove_docker_container_if_exists "${FRONT_CONTAINER:-}"

  rm -f "$state_file"
}

start_managed_process() {
  local workdir="$1"
  local logfile="$2"
  shift 2

  (
    cd "$workdir"
    nohup "$@" >>"$logfile" 2>&1 &
    echo $!
  )
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="${2:-120}"
  local deadline=$((SECONDS + timeout_seconds))

  until curl -fsS "$url" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "Tempo esgotado aguardando ${url}" >&2
      return 1
    fi

    sleep 2
  done
}

print_log_tail() {
  local label="$1"
  local logfile="$2"
  local lines="${3:-40}"

  if [[ ! -f "$logfile" ]]; then
    echo "Log ${label} nao encontrado em ${logfile}" >&2
    return 0
  fi

  echo
  echo "Ultimas ${lines} linhas de ${label} (${logfile}):" >&2
  tail -n "$lines" "$logfile" >&2 || true
}

start_nginx_static_container() {
  local name="$1"
  local build_dir="$2"
  local template_path="$3"
  local published_port="$4"
  local proxy_target="$5"
  local network_name="${6:-}"

  remove_docker_container_if_exists "$name"

  local args=(
    run -d
    --name "$name"
    --add-host "host.docker.internal:host-gateway"
  )

  if [[ -n "$network_name" ]]; then
    args+=(--network "$network_name")
  fi

  args+=(
    -p "${published_port}:80"
    -e "API_PROXY_TARGET=${proxy_target}"
    -v "${build_dir}:/usr/share/nginx/html:ro"
    -v "${template_path}:/etc/nginx/templates/default.conf.template:ro"
    nginx:1.27-alpine
  )

  docker "${args[@]}" >/dev/null
}

wait_for_tcp_port() {
  local host="${1:-localhost}"
  local port="$2"
  local timeout_seconds="${3:-240}"
  local deadline=$((SECONDS + timeout_seconds))

  until (echo >"/dev/tcp/${host}/${port}") >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "Tempo esgotado aguardando ${host}:${port}" >&2
      return 1
    fi

    sleep 2
  done
}

dispatch_sample_run() {
  local base_url="$1"
  local max_generations="$2"
  local rcl_cutoff="$3"
  local sample_size="$4"
  local train_dataset="$5"
  local test_dataset="$6"
  local classifier="$7"
  local neighborhood_strategy="$8"
  local local_search_csv="$9"

  local local_search_json="[]"
  IFS=',' read -r -a searches <<<"$local_search_csv"
  if (( ${#searches[@]} > 0 )); then
    local parts=()
    local search=""
    for search in "${searches[@]}"; do
      search="${search#"${search%%[![:space:]]*}"}"
      search="${search%"${search##*[![:space:]]}"}"
      if [[ -n "$search" ]]; then
        parts+=("\"${search}\"")
      fi
    done
    local_search_json="[${parts[*]}]"
    local_search_json="${local_search_json// /, }"
  fi

  curl -fsS \
    -X POST "${base_url}/api/grasp/run" \
    -H "Content-Type: application/json" \
    -d @- <<EOF
{
  "algorithms": ["IG", "GR", "RF", "SU"],
  "maxGenerations": ${max_generations},
  "rclCutoff": ${rcl_cutoff},
  "sampleSize": ${sample_size},
  "datasetTrainingName": "${train_dataset}",
  "datasetTestingName": "${test_dataset}",
  "classifier": "${classifier}",
  "neighborhoodStrategy": "${neighborhood_strategy}",
  "localSearches": ${local_search_json}
}
EOF
}
