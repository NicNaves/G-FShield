const MONITOR_SCHEMA_VERSION = "monitor.v2";
const DEFAULT_HIGH_QUALITY_THRESHOLD = Math.max(Number(process.env.GRASP_SUMMARY_HIGH_QUALITY_F1 || 95) || 95, 1);

class GraspMonitorSummaryService {
  numberOrNull(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  average(values = []) {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (validValues.length === 0) {
      return null;
    }

    return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
  }

  parseTimestamp(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  extractSnapshot(event = {}) {
    if (!event || typeof event !== "object") {
      return {};
    }

    if (event.payload && typeof event.payload === "object") {
      if (event.payload.payload && typeof event.payload.payload === "object") {
        return event.payload.payload;
      }

      return event.payload;
    }

    return {};
  }

  normalizeList(value) {
    return Array.isArray(value)
      ? value.map((entry) => String(entry)).filter(Boolean)
      : [];
  }

  normalizeSearchLabel(value) {
    const label = String(value || "").trim().toUpperCase();
    return label || null;
  }

  updateBounds(bounds = {}, timestamp) {
    if (!Number.isFinite(timestamp)) {
      return bounds;
    }

    return {
      firstObservedAt: bounds.firstObservedAt === null || timestamp < bounds.firstObservedAt
        ? timestamp
        : bounds.firstObservedAt,
      latestObservedAt: bounds.latestObservedAt === null || timestamp > bounds.latestObservedAt
        ? timestamp
        : bounds.latestObservedAt,
    };
  }

  buildDatasetPair(trainingFileName, testingFileName) {
    return `${trainingFileName || "--"}|${testingFileName || "--"}`;
  }

  summarize(runs = [], events = []) {
    const normalizedRuns = Array.isArray(runs) ? runs.filter(Boolean) : [];
    const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
    const algorithms = new Map();
    const stages = new Map();
    const searches = new Map();
    const topics = new Map();
    const datasetPairs = new Set();
    const requestIds = new Set();
    const featureUniverse = new Set();
    const localSearchCoverage = new Set();
    const neighborhoods = new Set();
    const solutionSizes = [];
    const rclSizes = [];
    const searchPlanWidths = [];
    const historyDepths = [];
    const improvementGains = [];
    let bounds = { firstObservedAt: null, latestObservedAt: null };
    let firstHighQualityAt = null;
    let runsWithHistory = 0;
    let runsWithTelemetry = 0;
    let bestOverall = null;
    const highQualityThreshold = DEFAULT_HIGH_QUALITY_THRESHOLD;

    normalizedRuns.forEach((run) => {
      if (run.trainingFileName || run.testingFileName) {
        datasetPairs.add(this.buildDatasetPair(run.trainingFileName, run.testingFileName));
      }

      if (run.requestId) {
        requestIds.add(String(run.requestId));
      }

      bounds = this.updateBounds(bounds, this.parseTimestamp(run.createdAt));
      bounds = this.updateBounds(bounds, this.parseTimestamp(run.updatedAt));
      bounds = this.updateBounds(bounds, this.parseTimestamp(run.completedAt));

      const solutionFeatures = this.normalizeList(run.solutionFeatures);
      const rclFeatures = this.normalizeList(run.rclFeatures || run.rclfeatures);
      solutionFeatures.forEach((feature) => featureUniverse.add(feature));

      if (solutionFeatures.length > 0) {
        solutionSizes.push(solutionFeatures.length);
      }

      if (rclFeatures.length > 0) {
        rclSizes.push(rclFeatures.length);
      }

      const enabledLocalSearches = this.normalizeList(run.enabledLocalSearches)
        .map((entry) => this.normalizeSearchLabel(entry))
        .filter(Boolean);

      if (enabledLocalSearches.length > 0) {
        searchPlanWidths.push(enabledLocalSearches.length);
        enabledLocalSearches.forEach((entry) => localSearchCoverage.add(entry));
      }

      const normalizedLocalSearch = this.normalizeSearchLabel(run.localSearch);
      if (normalizedLocalSearch) {
        localSearchCoverage.add(normalizedLocalSearch);
      }

      const normalizedNeighborhood = this.normalizeSearchLabel(run.neighborhood);
      if (normalizedNeighborhood) {
        neighborhoods.add(normalizedNeighborhood);
      }

      const algorithmKey = String(run.rclAlgorithm || "UNKNOWN").toUpperCase();
      const currentAlgorithm = algorithms.get(algorithmKey) || {
        algorithm: algorithmKey,
        runs: 0,
        bestF1Score: null,
        avgCpuUsage: null,
        avgMemoryUsagePercent: null,
        cpuSamples: [],
        memorySamples: [],
        bestSeedId: null,
      };

      currentAlgorithm.runs += 1;
      const bestF1 = this.numberOrNull(run.bestF1Score ?? run.currentF1Score);
      if (bestF1 !== null && (currentAlgorithm.bestF1Score === null || bestF1 > currentAlgorithm.bestF1Score)) {
        currentAlgorithm.bestF1Score = bestF1;
        currentAlgorithm.bestSeedId = run.seedId || null;
      }

      const cpuUsage = this.numberOrNull(run.cpuUsage);
      const memoryUsagePercent = this.numberOrNull(run.memoryUsagePercent);
      if (cpuUsage !== null) {
        currentAlgorithm.cpuSamples.push(cpuUsage);
      }
      if (memoryUsagePercent !== null) {
        currentAlgorithm.memorySamples.push(memoryUsagePercent);
      }

      algorithms.set(algorithmKey, currentAlgorithm);

      const stageKey = String(run.stage || run.topic || "unknown");
      stages.set(stageKey, (stages.get(stageKey) || 0) + 1);

      const searchKey = String(run.localSearch || run.neighborhood || "pipeline");
      const currentSearch = searches.get(searchKey) || {
        search: searchKey,
        count: 0,
        bestF1Score: null,
      };
      currentSearch.count += 1;
      if (bestF1 !== null && (currentSearch.bestF1Score === null || bestF1 > currentSearch.bestF1Score)) {
        currentSearch.bestF1Score = bestF1;
      }
      searches.set(searchKey, currentSearch);

      const history = Array.isArray(run.history) ? run.history.filter(Boolean) : [];
      historyDepths.push(history.length);

      if (history.length > 0) {
        runsWithHistory += 1;
      }

      const runHasTelemetry = cpuUsage !== null || memoryUsagePercent !== null || history.some((entry) =>
        this.numberOrNull(entry?.cpuUsage) !== null
        || this.numberOrNull(entry?.memoryUsagePercent) !== null
        || this.numberOrNull(entry?.memoryUsage) !== null
      );

      if (runHasTelemetry) {
        runsWithTelemetry += 1;
      }

      history.forEach((entry) => {
        if (entry?.requestId) {
          requestIds.add(String(entry.requestId));
        }

        bounds = this.updateBounds(bounds, this.parseTimestamp(entry?.timestamp));

        const entryScore = this.numberOrNull(entry?.f1Score);
        const entryTimestamp = this.parseTimestamp(entry?.timestamp);
        if (
          entryScore !== null
          && entryScore >= highQualityThreshold
          && Number.isFinite(entryTimestamp)
          && (firstHighQualityAt === null || entryTimestamp < firstHighQualityAt)
        ) {
          firstHighQualityAt = entryTimestamp;
        }

        const scoreDelta = this.numberOrNull(entry?.scoreDelta);
        if ((entry?.improved === true || (scoreDelta !== null && scoreDelta > 0)) && scoreDelta !== null) {
          improvementGains.push(scoreDelta);
        }

        const entryLocalSearch = this.normalizeSearchLabel(entry?.localSearch);
        if (entryLocalSearch) {
          localSearchCoverage.add(entryLocalSearch);
        }

        const entryNeighborhood = this.normalizeSearchLabel(entry?.neighborhood);
        if (entryNeighborhood) {
          neighborhoods.add(entryNeighborhood);
        }
      });

      if (
        bestF1 !== null
        && (
          !bestOverall
          || bestF1 > bestOverall.bestF1Score
          || (
            bestF1 === bestOverall.bestF1Score
            && (this.parseTimestamp(run.updatedAt) || 0) > (this.parseTimestamp(bestOverall.updatedAt) || 0)
          )
        )
      ) {
        bestOverall = {
          seedId: run.seedId || null,
          requestId: run.requestId || null,
          rclAlgorithm: run.rclAlgorithm || null,
          localSearch: run.localSearch || null,
          neighborhood: run.neighborhood || null,
          bestF1Score: bestF1,
          datasetPair: this.buildDatasetPair(run.trainingFileName, run.testingFileName),
          updatedAt: run.updatedAt || null,
        };
      }

      if (bestF1 !== null && bestF1 >= highQualityThreshold && firstHighQualityAt === null) {
        const fallbackHighQualityTimestamp = this.parseTimestamp(run.updatedAt) ?? this.parseTimestamp(run.createdAt);
        if (Number.isFinite(fallbackHighQualityTimestamp)) {
          firstHighQualityAt = fallbackHighQualityTimestamp;
        }
      }
    });

    normalizedEvents.forEach((event) => {
      const topicKey = String(event.topic || "UNSPECIFIED");
      topics.set(topicKey, (topics.get(topicKey) || 0) + 1);

      if (event.requestId) {
        requestIds.add(String(event.requestId));
      }

      bounds = this.updateBounds(bounds, this.parseTimestamp(event.timestamp));

      if (firstHighQualityAt !== null) {
        return;
      }

      const snapshot = this.extractSnapshot(event);
      const historyEntry = snapshot.historyEntry || {};
      const observedScore = this.numberOrNull(
        historyEntry.f1Score
        ?? snapshot.bestF1Score
        ?? snapshot.currentF1Score
        ?? snapshot.f1Score
      );
      const observedTimestamp = this.parseTimestamp(event.timestamp);

      if (
        observedScore !== null
        && observedScore >= highQualityThreshold
        && Number.isFinite(observedTimestamp)
      ) {
        firstHighQualityAt = observedTimestamp;
      }
    });

    const algorithmRows = [...algorithms.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        runs: entry.runs,
        bestF1Score: entry.bestF1Score,
        bestSeedId: entry.bestSeedId,
        avgCpuUsage: this.average(entry.cpuSamples),
        avgMemoryUsagePercent: this.average(entry.memorySamples),
      }))
      .sort((left, right) => (right.bestF1Score || 0) - (left.bestF1Score || 0));
    const observationWindowMs = bounds.firstObservedAt !== null && bounds.latestObservedAt !== null
      ? Math.max(bounds.latestObservedAt - bounds.firstObservedAt, 0)
      : null;
    const highQualityRuns = normalizedRuns.filter((run) => {
      const bestScore = this.numberOrNull(run.bestF1Score ?? run.currentF1Score);
      return bestScore !== null && bestScore >= highQualityThreshold;
    }).length;
    const positiveImprovementGains = improvementGains.filter((value) => Number.isFinite(value) && value > 0);
    const largestImprovementGain = positiveImprovementGains.length > 0
      ? Math.max(...positiveImprovementGains)
      : null;

    return {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      totals: {
        runs: normalizedRuns.length,
        events: normalizedEvents.length,
        bestSolutions: normalizedRuns.filter((run) => run.topic === "BEST_SOLUTION_TOPIC").length,
        completedRuns: normalizedRuns.filter((run) => String(run.status || "").toLowerCase() === "completed").length,
        activeRuns: normalizedRuns.filter((run) => String(run.status || "").toLowerCase() !== "completed").length,
        algorithms: new Set(normalizedRuns.map((run) => run.rclAlgorithm).filter(Boolean)).size,
        datasetPairs: datasetPairs.size,
      },
      quality: {
        highQualityThreshold,
        highQualityRuns,
        highQualityRunRatio: normalizedRuns.length > 0 ? highQualityRuns / normalizedRuns.length : null,
        firstHighQualityAt: firstHighQualityAt !== null ? new Date(firstHighQualityAt).toISOString() : null,
        timeToFirstHighQualityMs:
          firstHighQualityAt !== null && bounds.firstObservedAt !== null
            ? Math.max(firstHighQualityAt - bounds.firstObservedAt, 0)
            : null,
        timeToFirstHighQualitySeconds:
          firstHighQualityAt !== null && bounds.firstObservedAt !== null
            ? Math.max(Math.round((firstHighQualityAt - bounds.firstObservedAt) / 1000), 0)
            : null,
        bestOverall,
        improvementsObserved: positiveImprovementGains.length,
        averageImprovementGain: this.average(positiveImprovementGains),
        largestImprovementGain,
      },
      observability: {
        requestCount: requestIds.size,
        runsWithHistory,
        runsWithTelemetry,
        historyCoverageRatio: normalizedRuns.length > 0 ? runsWithHistory / normalizedRuns.length : null,
        telemetryCoverageRatio: normalizedRuns.length > 0 ? runsWithTelemetry / normalizedRuns.length : null,
        avgHistoryDepth: this.average(historyDepths),
        maxHistoryDepth: historyDepths.length > 0 ? Math.max(...historyDepths) : 0,
        firstObservedAt: bounds.firstObservedAt !== null ? new Date(bounds.firstObservedAt).toISOString() : null,
        latestObservedAt: bounds.latestObservedAt !== null ? new Date(bounds.latestObservedAt).toISOString() : null,
        observationWindowMs,
        observationWindowSeconds:
          observationWindowMs !== null ? Math.round(observationWindowMs / 1000) : null,
      },
      exploration: {
        uniqueFeatures: featureUniverse.size,
        avgSolutionSize: this.average(solutionSizes),
        avgRclSize: this.average(rclSizes),
        avgEnabledLocalSearches: this.average(searchPlanWidths),
        localSearchCoverage: [...localSearchCoverage].sort(),
        neighborhoods: [...neighborhoods].sort(),
      },
      algorithms: algorithmRows,
      stages: [...stages.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((left, right) => right.count - left.count),
      searches: [...searches.values()].sort((left, right) => right.count - left.count),
      topics: [...topics.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort((left, right) => right.count - left.count),
    };
  }
}

module.exports = {
  MONITOR_SCHEMA_VERSION,
  graspMonitorSummaryService: new GraspMonitorSummaryService(),
};
