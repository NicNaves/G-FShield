#!/usr/bin/env sh
set -eu

image_tag=${1:?usage: build_images.sh IMAGE_TAG}
repo_root=$(git rev-parse --show-toplevel)
compose_file="$repo_root/experiments/10-day-campaign/docker-compose.campaign.yml"

export CAMPAIGN_IMAGE_TAG="$image_tag"
export CAMPAIGN_DATASET_DIR="$repo_root/datasets"
export CAMPAIGN_METRICS_DIR="/tmp/gfshield-causal-build-metrics"
export CAMPAIGN_ID="causal-build"
export CAMPAIGN_ARM_ID="causal-build"
export CAMPAIGN_RUN_ID="causal-build"
export CAMPAIGN_REQUEST_ID="causal-build"
export CAMPAIGN_RANDOM_SEED="42"
export CAMPAIGN_DEADLINE_EPOCH_MS="4102444800000"
export CAMPAIGN_START_MONOTONIC_NS="0"

docker compose -f "$compose_file" build \
  grasp-fs-rcl-relieff \
  grasp-fs-dls-iwssr \
  grasp-fs-dls-vnd \
  grasp-fs-dls-verify

docker build \
  --file "$repo_root/experiments/common-weka-evaluator/Dockerfile" \
  --tag "gfshield-campaign-evaluator:$image_tag" \
  "$repo_root"

docker build \
  --file "$repo_root/experiments/monoliths/monolith2-graspy/Dockerfile" \
  --tag "gfshield-campaign-monolith2:$image_tag" \
  "$repo_root"
