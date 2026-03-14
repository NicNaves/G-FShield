const MONITOR_SCHEMA_VERSION = "monitor.v2";

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

  summarize(runs = [], events = []) {
    const normalizedRuns = Array.isArray(runs) ? runs.filter(Boolean) : [];
    const normalizedEvents = Array.isArray(events) ? events.filter(Boolean) : [];
    const algorithms = new Map();
    const stages = new Map();
    const searches = new Map();
    const topics = new Map();
    const datasetPairs = new Set();

    normalizedRuns.forEach((run) => {
      if (run.trainingFileName || run.testingFileName) {
        datasetPairs.add(`${run.trainingFileName || "--"}|${run.testingFileName || "--"}`);
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
    });

    normalizedEvents.forEach((event) => {
      const topicKey = String(event.topic || "UNSPECIFIED");
      topics.set(topicKey, (topics.get(topicKey) || 0) + 1);
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
