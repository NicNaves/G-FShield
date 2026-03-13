const axios = require("axios");
const { randomUUID } = require("crypto");
const { graspServices } = require("../config/graspFsConfig");

const DEFAULT_ALGORITHMS = ["IG", "GR", "RF", "SU"];
const DEFAULT_LOCAL_SEARCHES = ["BIT_FLIP", "IWSS", "IWSSR"];
const ALLOWED_NEIGHBORHOODS = new Set(["VND", "RVND"]);
const ALLOWED_LOCAL_SEARCHES = new Set(DEFAULT_LOCAL_SEARCHES);

class GraspGatewayService {
  normalizeAlgorithms(algorithms) {
    if (!algorithms) {
      return DEFAULT_ALGORITHMS;
    }

    const values = Array.isArray(algorithms) ? algorithms : [algorithms];
    return values
      .map((value) => String(value).trim().toUpperCase())
      .filter((value) => graspServices[value]);
  }

  normalizeNeighborhoodStrategy(strategy) {
    if (!strategy) {
      return null;
    }

    const normalized = String(strategy).trim().toUpperCase();
    return ALLOWED_NEIGHBORHOODS.has(normalized) ? normalized : null;
  }

  normalizeLocalSearches(localSearches) {
    const values = Array.isArray(localSearches)
      ? localSearches
      : typeof localSearches === "string"
        ? localSearches.split(",")
        : [];

    return [...new Set(
      values
        .map((value) => String(value).trim().toUpperCase())
        .filter((value) => ALLOWED_LOCAL_SEARCHES.has(value))
    )];
  }

  buildParams(payload) {
    const neighborhoodStrategy = this.normalizeNeighborhoodStrategy(payload.neighborhoodStrategy);
    const localSearches = this.normalizeLocalSearches(payload.localSearches);

    return {
      maxGenerations: Number(payload.maxGenerations),
      rclCutoff: Number(payload.rclCutoff),
      sampleSize: Number(payload.sampleSize),
      datasetTrainingName: payload.datasetTrainingName,
      datasetTestingName: payload.datasetTestingName,
      classifier: payload.classifier || "J48",
      ...(neighborhoodStrategy ? { neighborhoodStrategy } : {}),
      ...(localSearches.length > 0 ? { localSearches: localSearches.join(",") } : {}),
    };
  }

  validatePayload(payload) {
    const required = [
      "maxGenerations",
      "rclCutoff",
      "sampleSize",
      "datasetTrainingName",
      "datasetTestingName",
    ];

    const missing = required.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
    if (missing.length > 0) {
      throw new Error(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
    }

    if (payload.neighborhoodStrategy && !this.normalizeNeighborhoodStrategy(payload.neighborhoodStrategy)) {
      throw new Error("Neighborhood strategy invalida. Use VND ou RVND.");
    }

    if (payload.localSearches && this.normalizeLocalSearches(payload.localSearches).length === 0) {
      throw new Error("Nenhuma busca local valida foi informada. Use BIT_FLIP, IWSS ou IWSSR.");
    }
  }

  async startExecution(payload) {
    this.validatePayload(payload);
    const algorithms = this.normalizeAlgorithms(payload.algorithms);

    if (algorithms.length === 0) {
      throw new Error("Nenhum algoritmo valido foi informado.");
    }

    const params = this.buildParams(payload);
    const requestId = payload.requestId || randomUUID();

    const executions = await Promise.all(
      algorithms.map(async (algorithm) => {
        const service = graspServices[algorithm];
        const url = `${service.baseUrl}${service.path}`;

        const response = await axios.post(url, null, {
          params,
          timeout: Number(process.env.GRASP_FS_HTTP_TIMEOUT_MS || 30000),
        });

        return {
          algorithm,
          service: service.label,
          url,
          status: response.status,
          data: response.data,
        };
      })
    );

    return {
      requestId,
      requestedAt: new Date().toISOString(),
      algorithms,
      params,
      status: "requested",
      executions,
    };
  }

  getServices() {
    return Object.values(graspServices).map((service) => ({
      key: service.key,
      label: service.label,
      url: `${service.baseUrl}${service.path}`,
    }));
  }
}

module.exports = new GraspGatewayService();
