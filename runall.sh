#!/bin/bash

# Parâmetros comuns
MAX_GEN=2
RCL_CUTOFF=30
SAMPLE_SIZE=5
TRAIN_FILE="ereno1ktrain.arff"
TEST_FILE="ereno1ktest.arff"
CLASSIFIER="J48"
CONTENT_TYPE="application/x-www-form-urlencoded"

echo "🔁 Enviando requisição para GR..."
curl -X POST http://localhost:8088/gr \
  -H "Content-Type: $CONTENT_TYPE" \
  -d "maxGenerations=$MAX_GEN" \
  -d "rclCutoff=$RCL_CUTOFF" \
  -d "sampleSize=$SAMPLE_SIZE" \
  -d "datasetTrainingName=$TRAIN_FILE" \
  -d "datasetTestingName=$TEST_FILE" \
  -d "classifier=$CLASSIFIER"
echo -e "\n✅ GR finalizado\n"

echo "🔁 Enviando requisição para IG..."
curl -X POST http://localhost:8089/ig \
  -H "Content-Type: $CONTENT_TYPE" \
  -d "maxGenerations=$MAX_GEN" \
  -d "rclCutoff=$RCL_CUTOFF" \
  -d "sampleSize=$SAMPLE_SIZE" \
  -d "datasetTrainingName=$TRAIN_FILE" \
  -d "datasetTestingName=$TEST_FILE" \
  -d "classifier=$CLASSIFIER"
echo -e "\n✅ IG finalizado\n"

echo "🔁 Enviando requisição para RF..."
curl -X POST http://localhost:8086/rf \
  -H "Content-Type: $CONTENT_TYPE" \
  -d "maxGenerations=$MAX_GEN" \
  -d "rclCutoff=$RCL_CUTOFF" \
  -d "sampleSize=$SAMPLE_SIZE" \
  -d "datasetTrainingName=$TRAIN_FILE" \
  -d "datasetTestingName=$TEST_FILE" \
  -d "classifier=$CLASSIFIER"
echo -e "\n✅ RF finalizado\n"

echo "🔁 Enviando requisição para SU..."
curl -X POST http://localhost:8087/su \
  -H "Content-Type: $CONTENT_TYPE" \
  -d "maxGenerations=$MAX_GEN" \
  -d "rclCutoff=$RCL_CUTOFF" \
  -d "sampleSize=$SAMPLE_SIZE" \
  -d "datasetTrainingName=$TRAIN_FILE" \
  -d "datasetTestingName=$TEST_FILE" \
  -d "classifier=$CLASSIFIER"
echo -e "\n✅ SU finalizado\n"

echo "🚀 Todas as chamadas foram disparadas com sucesso."

