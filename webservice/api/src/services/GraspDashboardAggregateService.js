const prisma = require("../lib/prisma");
const { MONITOR_SCHEMA_VERSION } = require("./GraspMonitorSummaryService");

const SNAPSHOT_EVENT_FILTER = `"eventType" IN ('kafka.update', 'kafka.progress')`;
const NUMERIC_REGEX = "^-?[0-9]+(?:\\.[0-9]+)?$";

const buildNumericJsonExtractor = (paths = []) => {
  const coalesced = paths.map((path) => `"payload"#>>'${path}'`).join(", ");
  return `
    CASE
      WHEN NULLIF(COALESCE(${coalesced}), '') ~ '${NUMERIC_REGEX}'
        THEN NULLIF(COALESCE(${coalesced}), '')::double precision
      ELSE NULL
    END
  `;
};

const SCORE_SQL = buildNumericJsonExtractor([
  "{payload,historyEntry,f1Score}",
  "{payload,bestF1Score}",
  "{payload,currentF1Score}",
  "{payload,f1Score}",
  "{historyEntry,f1Score}",
  "{bestF1Score}",
  "{currentF1Score}",
  "{f1Score}",
]);

const CPU_USAGE_SQL = buildNumericJsonExtractor([
  "{payload,historyEntry,cpuUsage}",
  "{payload,cpuUsage}",
  "{historyEntry,cpuUsage}",
  "{cpuUsage}",
]);

const MEMORY_USAGE_SQL = buildNumericJsonExtractor([
  "{payload,historyEntry,memoryUsage}",
  "{payload,memoryUsage}",
  "{historyEntry,memoryUsage}",
  "{memoryUsage}",
]);

const MEMORY_USAGE_PERCENT_SQL = buildNumericJsonExtractor([
  "{payload,historyEntry,memoryUsagePercent}",
  "{payload,memoryUsagePercent}",
  "{historyEntry,memoryUsagePercent}",
  "{memoryUsagePercent}",
]);

const SEED_ID_SQL = `COALESCE("seedId", "payload"#>>'{payload,seedId}', "payload"#>>'{seedId}')`;
const RCL_ALGORITHM_SQL = `COALESCE(NULLIF(COALESCE("payload"#>>'{payload,rclAlgorithm}', "payload"#>>'{rclAlgorithm}'), ''), 'Unknown')`;
const LOCAL_SEARCH_SQL = `COALESCE(
  NULLIF(
    COALESCE(
      "payload"#>>'{payload,historyEntry,localSearch}',
      "payload"#>>'{payload,localSearch}',
      "payload"#>>'{historyEntry,localSearch}',
      "payload"#>>'{localSearch}',
      "payload"#>>'{payload,historyEntry,neighborhood}',
      "payload"#>>'{payload,neighborhood}',
      "payload"#>>'{historyEntry,neighborhood}',
      "payload"#>>'{neighborhood}'
    ),
    ''
  ),
  'Unknown'
)`;
const TRAINING_FILE_SQL = `COALESCE(
  NULLIF(COALESCE("payload"#>>'{payload,trainingFileName}', "payload"#>>'{trainingFileName}'), ''),
  '--'
)`;
const TESTING_FILE_SQL = `COALESCE(
  NULLIF(COALESCE("payload"#>>'{payload,testingFileName}', "payload"#>>'{testingFileName}'), ''),
  '--'
)`;
const SOLUTION_FEATURES_JSON_SQL = `COALESCE(
  "payload"#>'{payload,historyEntry,solutionFeatures}',
  "payload"#>'{payload,solutionFeatures}',
  "payload"#>'{historyEntry,solutionFeatures}',
  "payload"#>'{solutionFeatures}'
)`;

class GraspDashboardAggregateService {
  constructor() {
    this.bucketIntervalMs = 60 * 60 * 1000;
    this.defaultBucketLimit = Math.max(Number(process.env.GRASP_DASHBOARD_BUCKET_LIMIT || 72) || 72, 1);
    this.readModelKey = process.env.GRASP_DASHBOARD_READ_MODEL_KEY || "monitor-dashboard-default";
    this.readModelBucketLimit = Math.max(
      Number(process.env.GRASP_DASHBOARD_READ_MODEL_BUCKET_LIMIT || 336) || 336,
      this.defaultBucketLimit
    );
    this.readModelMaxAgeMs = Math.max(
      Number(process.env.GRASP_DASHBOARD_READ_MODEL_MAX_AGE_MS || 10 * 60 * 1000) || (10 * 60 * 1000),
      30_000
    );
  }

  normalizeCount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  normalizeMetric(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  normalizeSolutionFeatures(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
      } catch (error) {
        return [];
      }
    }

    return [];
  }

  pickPreferredByScore(currentEntry, candidateEntry, scoreField = "bestF1Score", dateField = "updatedAt") {
    if (!currentEntry) {
      return candidateEntry;
    }

    const currentScore = this.normalizeMetric(currentEntry?.[scoreField]) ?? Number.NEGATIVE_INFINITY;
    const candidateScore = this.normalizeMetric(candidateEntry?.[scoreField]) ?? Number.NEGATIVE_INFINITY;

    if (candidateScore !== currentScore) {
      return candidateScore > currentScore ? candidateEntry : currentEntry;
    }

    const currentTimestamp = new Date(currentEntry?.[dateField] || 0).getTime();
    const candidateTimestamp = new Date(candidateEntry?.[dateField] || 0).getTime();
    return candidateTimestamp >= currentTimestamp ? candidateEntry : currentEntry;
  }

  mapActivityBuckets(rows = []) {
    return [...rows]
      .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
      .map((row) => ({
        timestamp: new Date(row.timestamp).toISOString(),
        count: this.normalizeCount(row.count),
        uniqueSeedCount: this.normalizeCount(row.uniqueSeedCount),
        averageScore: this.normalizeMetric(row.averageScore),
        avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
        avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
        bestScore: this.normalizeMetric(row.bestScore),
      }));
  }

  mapTopicMetrics(rows = []) {
    return rows.map((row) => ({
      topic: row.topic || "UNSPECIFIED",
      count: this.normalizeCount(row.count),
      uniqueSeedCount: this.normalizeCount(row.uniqueSeedCount),
      averageScore: this.normalizeMetric(row.averageScore),
      bestScore: this.normalizeMetric(row.bestScore),
    }));
  }

  mapResourceAverages(rows = [], field = "algorithm") {
    return rows.map((row) => ({
      algorithm: row[field] || "Unknown",
      sampleCount: this.normalizeCount(row.sampleCount),
      avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
      avgMemoryUsage: this.normalizeMetric(row.avgMemoryUsage),
      avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
    }));
  }

  averageMetrics(values = []) {
    const normalized = values
      .map((value) => this.normalizeMetric(value))
      .filter((value) => value !== null);

    if (!normalized.length) {
      return null;
    }

    return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  }

  buildFinalRunSummaries(finalRunRows = [], initialSeedCountRows = []) {
    const initialSeedCountByAlgorithm = new Map(
      initialSeedCountRows.map((row) => [row.algorithm || "Unknown", this.normalizeCount(row.initialSeedCount)])
    );
    const groups = new Map();

    finalRunRows.forEach((row) => {
      const algorithm = row.algorithm || "Unknown";
      const finalScore = this.normalizeMetric(row.bestF1Score ?? row.currentF1Score);
      const initialScore = this.normalizeMetric(row.initialScore);
      const gain = finalScore !== null && initialScore !== null ? finalScore - initialScore : null;
      const searchLabel = row.localSearch || row.neighborhood || "--";
      const datasetLabel = `${row.trainingFileName || "--"} -> ${row.testingFileName || "--"}`;
      const candidateBestRun = {
        seedId: row.seedId,
        solutionFeatures: this.normalizeSolutionFeatures(row.solutionFeatures),
        bestF1Score: finalScore,
        currentF1Score: this.normalizeMetric(row.currentF1Score),
        localSearch: row.localSearch || null,
        neighborhood: row.neighborhood || null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      };
      const current = groups.get(algorithm) || {
        algorithm,
        initialSeedCount: initialSeedCountByAlgorithm.get(algorithm) || 0,
        finalSeedCount: 0,
        bestRun: null,
        finalScores: [],
        gains: [],
        searches: new Set(),
        datasets: new Set(),
      };

      current.finalSeedCount += 1;
      current.bestRun = this.pickPreferredByScore(current.bestRun, candidateBestRun);
      if (finalScore !== null) {
        current.finalScores.push(finalScore);
      }
      if (gain !== null) {
        current.gains.push(gain);
      }
      current.searches.add(searchLabel);
      current.datasets.add(datasetLabel);
      groups.set(algorithm, current);
    });

    const finalRunsByRclAlgorithm = [...groups.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        initialSeedCount: entry.initialSeedCount,
        finalSeedCount: entry.finalSeedCount,
        bestRun: entry.bestRun,
        avgFinalF1Score: this.averageMetrics(entry.finalScores),
        avgGain: this.averageMetrics(entry.gains),
        searches: [...entry.searches].sort(),
        datasets: [...entry.datasets].sort(),
      }))
      .sort(
        (left, right) =>
          (this.normalizeMetric(right.bestRun?.bestF1Score) ?? Number.NEGATIVE_INFINITY)
          - (this.normalizeMetric(left.bestRun?.bestF1Score) ?? Number.NEGATIVE_INFINITY)
      );

    const finalRunsByAlgorithm = finalRunsByRclAlgorithm.map((entry) => ({
      algorithm: entry.algorithm,
      runCount: entry.finalSeedCount,
      bestRun: entry.bestRun,
    }));

    return {
      finalRunsByAlgorithm,
      finalRunsByRclAlgorithm,
    };
  }

  buildDlsOutcomeSummaries(rows = []) {
    const groups = new Map();

    rows.forEach((row) => {
      const algorithm = row.algorithm || "Unknown";
      const localScore = this.normalizeMetric(row.localScore);
      const initialScore = this.normalizeMetric(row.initialScore);
      const gain = localScore !== null && initialScore !== null ? localScore - initialScore : null;
      const datasetLabel = `${row.trainingFileName || "--"} -> ${row.testingFileName || "--"}`;
      const candidateBestOutcome = {
        seedId: row.seedId,
        rclAlgorithm: row.rclAlgorithm || "Unknown",
        solutionFeatures: this.normalizeSolutionFeatures(row.solutionFeatures),
        bestF1Score: localScore,
        currentF1Score: localScore,
        updatedAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      };
      const current = groups.get(algorithm) || {
        algorithm,
        outcomeSeeds: new Set(),
        finalWins: new Set(),
        bestOutcome: null,
        outcomeScores: [],
        gains: [],
        rclAlgorithms: new Set(),
        datasets: new Set(),
      };

      if (row.seedId) {
        current.outcomeSeeds.add(row.seedId);
      }
      if (row.seedId && row.finalAlgorithm === algorithm) {
        current.finalWins.add(row.seedId);
      }
      current.bestOutcome = this.pickPreferredByScore(current.bestOutcome, candidateBestOutcome);
      if (localScore !== null) {
        current.outcomeScores.push(localScore);
      }
      if (gain !== null) {
        current.gains.push(gain);
      }
      current.rclAlgorithms.add(row.rclAlgorithm || "Unknown");
      current.datasets.add(datasetLabel);
      groups.set(algorithm, current);
    });

    return [...groups.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        visibleOutcomeSeedCount: entry.outcomeSeeds.size,
        visibleFinalSeedCount: entry.finalWins.size,
        bestOutcome: entry.bestOutcome,
        avgLocalF1Score: this.averageMetrics(entry.outcomeScores),
        avgGain: this.averageMetrics(entry.gains),
        rclAlgorithms: [...entry.rclAlgorithms].sort(),
        datasets: [...entry.datasets].sort(),
      }))
      .sort(
        (left, right) =>
          (this.normalizeMetric(right.bestOutcome?.bestF1Score) ?? Number.NEGATIVE_INFINITY)
          - (this.normalizeMetric(left.bestOutcome?.bestF1Score) ?? Number.NEGATIVE_INFINITY)
      );
  }

  serializeDate(value) {
    if (!value) {
      return null;
    }

    const parsedValue = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsedValue.getTime()) ? null : parsedValue.toISOString();
  }

  normalizeBucketLimit(value, fallback = this.defaultBucketLimit) {
    const requestedBucketLimit = Number(value);
    return Number.isFinite(requestedBucketLimit) && requestedBucketLimit > 0
      ? Math.max(Math.floor(requestedBucketLimit), 1)
      : fallback;
  }

  sliceDashboardAggregate(aggregate, bucketLimit) {
    const normalizedBucketLimit = this.normalizeBucketLimit(bucketLimit);
    const activityBuckets = Array.isArray(aggregate?.activityBuckets)
      ? aggregate.activityBuckets.slice(-normalizedBucketLimit)
      : [];

    return {
      ...(aggregate || {}),
      bucketIntervalMs: Number(aggregate?.bucketIntervalMs || this.bucketIntervalMs),
      activityBuckets,
    };
  }

  mapBestPayload(payload = {}) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    return {
      seedId: payload.seedId || null,
      solutionFeatures: this.normalizeSolutionFeatures(payload.solutionFeatures),
      bestF1Score: this.normalizeMetric(payload.bestF1Score),
      currentF1Score: this.normalizeMetric(payload.currentF1Score),
      localSearch: payload.localSearch || null,
      neighborhood: payload.neighborhood || null,
      rclAlgorithm: payload.rclAlgorithm || null,
      updatedAt: this.serializeDate(payload.updatedAt),
    };
  }

  buildMaterializedAggregate(readModel, bucketLimit = this.defaultBucketLimit) {
    if (!readModel) {
      return null;
    }

    const payload = typeof readModel.payload === "object" && readModel.payload ? readModel.payload : {};
    const overview = payload.overview || {};

    const topicMetrics = (readModel.topicMetrics || [])
      .sort((left, right) => left.position - right.position)
      .map((row) => ({
        topic: row.topic,
        count: this.normalizeCount(row.count),
        uniqueSeedCount: this.normalizeCount(row.uniqueSeedCount),
        averageScore: this.normalizeMetric(row.averageScore),
        bestScore: this.normalizeMetric(row.bestScore),
      }));

    const activityBuckets = (readModel.activityBuckets || [])
      .sort((left, right) => left.position - right.position)
      .slice(-this.normalizeBucketLimit(bucketLimit))
      .map((row) => ({
        timestamp: this.serializeDate(row.timestamp),
        count: this.normalizeCount(row.count),
        uniqueSeedCount: this.normalizeCount(row.uniqueSeedCount),
        averageScore: this.normalizeMetric(row.averageScore),
        avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
        avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
        bestScore: this.normalizeMetric(row.bestScore),
      }));

    const resourceMetrics = (readModel.resourceMetrics || []).sort((left, right) => left.position - right.position);
    const resourceAveragesByAlgorithm = resourceMetrics
      .filter((row) => row.scope === "algorithm")
      .map((row) => ({
        algorithm: row.label,
        sampleCount: this.normalizeCount(row.sampleCount),
        avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
        avgMemoryUsage: this.normalizeMetric(row.avgMemoryUsage),
        avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
      }));
    const resourceAveragesByLocalSearch = resourceMetrics
      .filter((row) => row.scope === "localSearch")
      .map((row) => ({
        localSearch: row.label,
        sampleCount: this.normalizeCount(row.sampleCount),
        avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
        avgMemoryUsage: this.normalizeMetric(row.avgMemoryUsage),
        avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
      }));

    const algorithmMetrics = (readModel.algorithmMetrics || []).sort((left, right) => left.position - right.position);
    const finalRunsByAlgorithm = algorithmMetrics
      .filter((row) => row.summaryType === "finalRunsByAlgorithm")
      .map((row) => ({
        algorithm: row.algorithm,
        runCount: this.normalizeCount(row.runCount),
        bestRun: this.mapBestPayload(row.bestPayload),
      }));
    const finalRunsByRclAlgorithm = algorithmMetrics
      .filter((row) => row.summaryType === "finalRunsByRclAlgorithm")
      .map((row) => ({
        algorithm: row.algorithm,
        initialSeedCount: this.normalizeCount(row.initialSeedCount),
        finalSeedCount: this.normalizeCount(row.finalSeedCount),
        bestRun: this.mapBestPayload(row.bestPayload),
        avgFinalF1Score: this.normalizeMetric(row.avgScore),
        avgGain: this.normalizeMetric(row.avgGain),
        searches: Array.isArray(row.searches) ? row.searches : [],
        datasets: Array.isArray(row.datasets) ? row.datasets : [],
      }));
    const dlsOutcomeSummary = algorithmMetrics
      .filter((row) => row.summaryType === "dlsOutcomeSummary")
      .map((row) => ({
        algorithm: row.algorithm,
        visibleOutcomeSeedCount: this.normalizeCount(row.visibleOutcomeSeedCount),
        visibleFinalSeedCount: this.normalizeCount(row.visibleFinalSeedCount),
        bestOutcome: this.mapBestPayload(row.bestPayload),
        avgLocalF1Score: this.normalizeMetric(row.avgScore),
        avgGain: this.normalizeMetric(row.avgGain),
        rclAlgorithms: Array.isArray(row.rclAlgorithms) ? row.rclAlgorithms : [],
        datasets: Array.isArray(row.datasets) ? row.datasets : [],
      }));

    return {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      generatedAt: this.serializeDate(readModel.generatedAt) || new Date().toISOString(),
      source: "database-read-model",
      bucketIntervalMs: Number(readModel.bucketIntervalMs || this.bucketIntervalMs),
      overview: {
        rawEvents: this.normalizeCount(overview.rawEvents),
        rawSnapshots: this.normalizeCount(overview.rawSnapshots),
        uniqueSeeds: this.normalizeCount(overview.uniqueSeeds),
        topics: this.normalizeCount(overview.topics),
        avgInitialF1: this.normalizeMetric(overview.avgInitialF1),
      },
      topicMetrics,
      activityBuckets,
      resourceAveragesByAlgorithm,
      resourceAveragesByLocalSearch,
      finalRunsByAlgorithm,
      finalRunsByRclAlgorithm,
      dlsOutcomeSummary,
    };
  }

  buildMaterializedRows(recordId, payload = {}) {
    const topicMetrics = (payload.topicMetrics || []).map((row, index) => ({
      readModelId: recordId,
      position: index,
      topic: row.topic || "UNSPECIFIED",
      count: this.normalizeCount(row.count),
      uniqueSeedCount: this.normalizeCount(row.uniqueSeedCount),
      averageScore: this.normalizeMetric(row.averageScore),
      bestScore: this.normalizeMetric(row.bestScore),
    }));

    const activityBuckets = (payload.activityBuckets || []).map((row, index) => ({
      readModelId: recordId,
      position: index,
      timestamp: row.timestamp ? new Date(row.timestamp) : new Date(0),
      count: this.normalizeCount(row.count),
      uniqueSeedCount: this.normalizeCount(row.uniqueSeedCount),
      averageScore: this.normalizeMetric(row.averageScore),
      avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
      avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
      bestScore: this.normalizeMetric(row.bestScore),
    }));

    const resourceAveragesByAlgorithm = (payload.resourceAveragesByAlgorithm || []).map((row, index) => ({
      readModelId: recordId,
      scope: "algorithm",
      label: row.algorithm || "Unknown",
      position: index,
      sampleCount: this.normalizeCount(row.sampleCount),
      avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
      avgMemoryUsage: this.normalizeMetric(row.avgMemoryUsage),
      avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
    }));
    const resourceAveragesByLocalSearch = (payload.resourceAveragesByLocalSearch || []).map((row, index) => ({
      readModelId: recordId,
      scope: "localSearch",
      label: row.localSearch || "Unknown",
      position: index,
      sampleCount: this.normalizeCount(row.sampleCount),
      avgCpuUsage: this.normalizeMetric(row.avgCpuUsage),
      avgMemoryUsage: this.normalizeMetric(row.avgMemoryUsage),
      avgMemoryUsagePercent: this.normalizeMetric(row.avgMemoryUsagePercent),
    }));

    const finalRunsByAlgorithm = (payload.finalRunsByAlgorithm || []).map((row, index) => ({
      readModelId: recordId,
      summaryType: "finalRunsByAlgorithm",
      algorithm: row.algorithm || "Unknown",
      position: index,
      runCount: this.normalizeCount(row.runCount),
      bestSeedId: row.bestRun?.seedId || null,
      bestF1Score: this.normalizeMetric(row.bestRun?.bestF1Score),
      currentF1Score: this.normalizeMetric(row.bestRun?.currentF1Score),
      bestPayload: row.bestRun || null,
      searches: [],
      datasets: [],
      rclAlgorithms: [],
    }));
    const finalRunsByRclAlgorithm = (payload.finalRunsByRclAlgorithm || []).map((row, index) => ({
      readModelId: recordId,
      summaryType: "finalRunsByRclAlgorithm",
      algorithm: row.algorithm || "Unknown",
      position: index,
      initialSeedCount: this.normalizeCount(row.initialSeedCount),
      finalSeedCount: this.normalizeCount(row.finalSeedCount),
      runCount: this.normalizeCount(row.finalSeedCount),
      avgScore: this.normalizeMetric(row.avgFinalF1Score),
      avgGain: this.normalizeMetric(row.avgGain),
      bestSeedId: row.bestRun?.seedId || null,
      bestF1Score: this.normalizeMetric(row.bestRun?.bestF1Score),
      currentF1Score: this.normalizeMetric(row.bestRun?.currentF1Score),
      bestPayload: row.bestRun || null,
      searches: Array.isArray(row.searches) ? row.searches : [],
      datasets: Array.isArray(row.datasets) ? row.datasets : [],
      rclAlgorithms: [],
    }));
    const dlsOutcomeSummary = (payload.dlsOutcomeSummary || []).map((row, index) => ({
      readModelId: recordId,
      summaryType: "dlsOutcomeSummary",
      algorithm: row.algorithm || "Unknown",
      position: index,
      visibleOutcomeSeedCount: this.normalizeCount(row.visibleOutcomeSeedCount),
      visibleFinalSeedCount: this.normalizeCount(row.visibleFinalSeedCount),
      avgScore: this.normalizeMetric(row.avgLocalF1Score),
      avgGain: this.normalizeMetric(row.avgGain),
      bestSeedId: row.bestOutcome?.seedId || null,
      bestF1Score: this.normalizeMetric(row.bestOutcome?.bestF1Score),
      currentF1Score: this.normalizeMetric(row.bestOutcome?.currentF1Score),
      bestPayload: row.bestOutcome || null,
      searches: [],
      datasets: Array.isArray(row.datasets) ? row.datasets : [],
      rclAlgorithms: Array.isArray(row.rclAlgorithms) ? row.rclAlgorithms : [],
    }));

    return {
      topicMetrics,
      activityBuckets,
      resourceMetrics: [...resourceAveragesByAlgorithm, ...resourceAveragesByLocalSearch],
      algorithmMetrics: [...finalRunsByAlgorithm, ...finalRunsByRclAlgorithm, ...dlsOutcomeSummary],
    };
  }

  async getSourceWatermark() {
    const [eventAggregate, runAggregate] = await Promise.all([
      prisma.graspExecutionEvent.aggregate({
        _max: { createdAt: true },
        _count: { _all: true },
      }),
      prisma.graspExecutionRun.aggregate({
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
    ]);

    return {
      sourceEventCount: Number(eventAggregate?._count?._all || 0),
      sourceRunCount: Number(runAggregate?._count?._all || 0),
      sourceMaxEventAt: this.serializeDate(eventAggregate?._max?.createdAt),
      sourceMaxRunAt: this.serializeDate(runAggregate?._max?.updatedAt),
    };
  }

  hasMaterializedRows(readModel) {
    return (
      Array.isArray(readModel?.topicMetrics) && readModel.topicMetrics.length > 0
      && Array.isArray(readModel?.activityBuckets) && readModel.activityBuckets.length > 0
      && Array.isArray(readModel?.resourceMetrics) && readModel.resourceMetrics.length > 0
      && Array.isArray(readModel?.algorithmMetrics) && readModel.algorithmMetrics.length > 0
    );
  }

  isReadModelFresh(readModel, sourceWatermark) {
    if (!readModel || !this.hasMaterializedRows(readModel)) {
      return false;
    }

    const generatedAt = new Date(readModel.generatedAt || 0).getTime();
    if (!Number.isFinite(generatedAt) || (Date.now() - generatedAt) > this.readModelMaxAgeMs) {
      return false;
    }

    return (
      Number(readModel.sourceEventCount || 0) === Number(sourceWatermark.sourceEventCount || 0)
      && Number(readModel.sourceRunCount || 0) === Number(sourceWatermark.sourceRunCount || 0)
      && this.serializeDate(readModel.sourceMaxEventAt) === sourceWatermark.sourceMaxEventAt
      && this.serializeDate(readModel.sourceMaxRunAt) === sourceWatermark.sourceMaxRunAt
    );
  }

  async persistReadModel(payload, sourceWatermark) {
    const aggregatePayload = {
      ...(payload || {}),
      schemaVersion: MONITOR_SCHEMA_VERSION,
      bucketIntervalMs: this.bucketIntervalMs,
      source: "database-read-model",
    };

    const record = await prisma.$transaction(async (tx) => {
      const persistedReadModel = await tx.graspDashboardReadModel.upsert({
        where: { key: this.readModelKey },
        update: {
          schemaVersion: MONITOR_SCHEMA_VERSION,
          bucketIntervalMs: this.bucketIntervalMs,
          sourceEventCount: Number(sourceWatermark.sourceEventCount || 0),
          sourceRunCount: Number(sourceWatermark.sourceRunCount || 0),
          sourceMaxEventAt: sourceWatermark.sourceMaxEventAt ? new Date(sourceWatermark.sourceMaxEventAt) : null,
          sourceMaxRunAt: sourceWatermark.sourceMaxRunAt ? new Date(sourceWatermark.sourceMaxRunAt) : null,
          generatedAt: new Date(),
          payload: aggregatePayload,
        },
        create: {
          key: this.readModelKey,
          schemaVersion: MONITOR_SCHEMA_VERSION,
          bucketIntervalMs: this.bucketIntervalMs,
          sourceEventCount: Number(sourceWatermark.sourceEventCount || 0),
          sourceRunCount: Number(sourceWatermark.sourceRunCount || 0),
          sourceMaxEventAt: sourceWatermark.sourceMaxEventAt ? new Date(sourceWatermark.sourceMaxEventAt) : null,
          sourceMaxRunAt: sourceWatermark.sourceMaxRunAt ? new Date(sourceWatermark.sourceMaxRunAt) : null,
          generatedAt: new Date(),
          payload: aggregatePayload,
        },
      });

      const rows = this.buildMaterializedRows(persistedReadModel.id, aggregatePayload);

      await tx.graspDashboardTopicMetric.deleteMany({ where: { readModelId: persistedReadModel.id } });
      await tx.graspDashboardActivityBucket.deleteMany({ where: { readModelId: persistedReadModel.id } });
      await tx.graspDashboardResourceMetric.deleteMany({ where: { readModelId: persistedReadModel.id } });
      await tx.graspDashboardAlgorithmMetric.deleteMany({ where: { readModelId: persistedReadModel.id } });

      if (rows.topicMetrics.length) {
        await tx.graspDashboardTopicMetric.createMany({ data: rows.topicMetrics });
      }
      if (rows.activityBuckets.length) {
        await tx.graspDashboardActivityBucket.createMany({ data: rows.activityBuckets });
      }
      if (rows.resourceMetrics.length) {
        await tx.graspDashboardResourceMetric.createMany({ data: rows.resourceMetrics });
      }
      if (rows.algorithmMetrics.length) {
        await tx.graspDashboardAlgorithmMetric.createMany({ data: rows.algorithmMetrics });
      }

      return persistedReadModel;
    });

    return {
      ...aggregatePayload,
      generatedAt: this.serializeDate(record.generatedAt) || new Date().toISOString(),
    };
  }

  async clearReadModel() {
    await prisma.graspDashboardReadModel.deleteMany({
      where: { key: this.readModelKey },
    });
  }

  async buildDashboardAggregate(options = {}) {
    const requestedBucketLimit = Number(options.bucketLimit);
    const bucketLimit = Number.isFinite(requestedBucketLimit) && requestedBucketLimit > 0
      ? Math.max(Math.floor(requestedBucketLimit), 1)
      : this.defaultBucketLimit;

    const [
      overviewRows,
      topicMetricRows,
      activityBucketRows,
      resourceByAlgorithmRows,
      resourceByLocalSearchRows,
      initialSeedCountRows,
      finalRunRows,
      dlsOutcomeRows,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(`
        WITH base AS (
          SELECT
            COALESCE("topic", 'UNSPECIFIED') AS topic,
            ${SEED_ID_SQL} AS seed_id,
            ${SCORE_SQL} AS score
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
        )
        SELECT
          COUNT(*) AS "rawEvents",
          COUNT(*) AS "rawSnapshots",
          COUNT(DISTINCT seed_id) AS "uniqueSeeds",
          COUNT(DISTINCT topic) AS "topics",
          AVG(CASE WHEN topic = 'INITIAL_SOLUTION_TOPIC' THEN score ELSE NULL END)::double precision AS "avgInitialF1"
        FROM base
      `),
      prisma.$queryRawUnsafe(`
        WITH base AS (
          SELECT
            COALESCE("topic", 'UNSPECIFIED') AS topic,
            ${SEED_ID_SQL} AS seed_id,
            ${SCORE_SQL} AS score
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
        )
        SELECT
          topic,
          COUNT(*) AS "count",
          COUNT(DISTINCT seed_id) AS "uniqueSeedCount",
          AVG(score)::double precision AS "averageScore",
          MAX(score)::double precision AS "bestScore"
        FROM base
        GROUP BY topic
        ORDER BY COUNT(*) DESC, topic ASC
      `),
      prisma.$queryRawUnsafe(`
        WITH base AS (
          SELECT
            date_trunc('hour', "createdAt") AS timestamp,
            ${SEED_ID_SQL} AS seed_id,
            ${SCORE_SQL} AS score,
            ${CPU_USAGE_SQL} AS cpu_usage,
            ${MEMORY_USAGE_PERCENT_SQL} AS memory_usage_percent
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
        )
        SELECT
          timestamp,
          COUNT(*) AS "count",
          COUNT(DISTINCT seed_id) AS "uniqueSeedCount",
          AVG(score)::double precision AS "averageScore",
          AVG(cpu_usage)::double precision AS "avgCpuUsage",
          AVG(memory_usage_percent)::double precision AS "avgMemoryUsagePercent",
          MAX(score)::double precision AS "bestScore"
        FROM base
        GROUP BY timestamp
        ORDER BY timestamp DESC
        LIMIT ${bucketLimit}
      `),
      prisma.$queryRawUnsafe(`
        WITH base AS (
          SELECT
            ${RCL_ALGORITHM_SQL} AS algorithm,
            ${CPU_USAGE_SQL} AS cpu_usage,
            ${MEMORY_USAGE_SQL} AS memory_usage,
            ${MEMORY_USAGE_PERCENT_SQL} AS memory_usage_percent
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" = 'INITIAL_SOLUTION_TOPIC'
        )
        SELECT
          algorithm,
          COUNT(*) AS "sampleCount",
          AVG(cpu_usage)::double precision AS "avgCpuUsage",
          AVG(memory_usage)::double precision AS "avgMemoryUsage",
          AVG(memory_usage_percent)::double precision AS "avgMemoryUsagePercent"
        FROM base
        WHERE cpu_usage IS NOT NULL
          OR memory_usage IS NOT NULL
          OR memory_usage_percent IS NOT NULL
        GROUP BY algorithm
        ORDER BY AVG(cpu_usage) DESC NULLS LAST, algorithm ASC
      `),
      prisma.$queryRawUnsafe(`
        WITH base AS (
          SELECT
            ${LOCAL_SEARCH_SQL} AS local_search,
            ${CPU_USAGE_SQL} AS cpu_usage,
            ${MEMORY_USAGE_SQL} AS memory_usage,
            ${MEMORY_USAGE_PERCENT_SQL} AS memory_usage_percent
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" IN ('LOCAL_SEARCH_PROGRESS_TOPIC', 'SOLUTIONS_TOPIC')
        )
        SELECT
          local_search AS "localSearch",
          COUNT(*) AS "sampleCount",
          AVG(cpu_usage)::double precision AS "avgCpuUsage",
          AVG(memory_usage)::double precision AS "avgMemoryUsage",
          AVG(memory_usage_percent)::double precision AS "avgMemoryUsagePercent"
        FROM base
        WHERE cpu_usage IS NOT NULL
          OR memory_usage IS NOT NULL
          OR memory_usage_percent IS NOT NULL
        GROUP BY local_search
        ORDER BY AVG(cpu_usage) DESC NULLS LAST, local_search ASC
      `),
      prisma.$queryRawUnsafe(`
        WITH initial_events AS (
          SELECT DISTINCT ON (${SEED_ID_SQL})
            ${SEED_ID_SQL} AS seed_id,
            ${RCL_ALGORITHM_SQL} AS algorithm
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" = 'INITIAL_SOLUTION_TOPIC'
          ORDER BY ${SEED_ID_SQL}, "createdAt" DESC
        )
        SELECT
          algorithm,
          COUNT(*) AS "initialSeedCount"
        FROM initial_events
        GROUP BY algorithm
      `),
      prisma.$queryRawUnsafe(`
        WITH initial_scores AS (
          SELECT DISTINCT ON (${SEED_ID_SQL})
            ${SEED_ID_SQL} AS seed_id,
            ${SCORE_SQL} AS initial_score,
            ${RCL_ALGORITHM_SQL} AS initial_algorithm
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" = 'INITIAL_SOLUTION_TOPIC'
          ORDER BY ${SEED_ID_SQL}, "createdAt" DESC
        ),
        best_solution_events AS (
          SELECT DISTINCT ON (${SEED_ID_SQL})
            ${SEED_ID_SQL} AS seed_id,
            ${SOLUTION_FEATURES_JSON_SQL} AS solution_features,
            ${SCORE_SQL} AS best_score,
            "createdAt" AS created_at
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" = 'BEST_SOLUTION_TOPIC'
          ORDER BY ${SEED_ID_SQL}, ${SCORE_SQL} DESC NULLS LAST, "createdAt" DESC
        )
        SELECT
          run."seedId" AS "seedId",
          run."updatedAt" AS "updatedAt",
          COALESCE(NULLIF(run."rclAlgorithm", ''), initial_scores.initial_algorithm, 'Unknown') AS algorithm,
          run."bestF1Score" AS "bestF1Score",
          run."currentF1Score" AS "currentF1Score",
          run."localSearch" AS "localSearch",
          run."neighborhood" AS "neighborhood",
          run."trainingFileName" AS "trainingFileName",
          run."testingFileName" AS "testingFileName",
          initial_scores.initial_score AS "initialScore",
          COALESCE(best_solution_events.solution_features, run."solutionFeatures") AS "solutionFeatures"
        FROM "GraspExecutionRun" run
        LEFT JOIN initial_scores ON initial_scores.seed_id = run."seedId"
        LEFT JOIN best_solution_events ON best_solution_events.seed_id = run."seedId"
        WHERE COALESCE(run."bestF1Score", run."currentF1Score") IS NOT NULL
      `),
      prisma.$queryRawUnsafe(`
        WITH initial_scores AS (
          SELECT DISTINCT ON (${SEED_ID_SQL})
            ${SEED_ID_SQL} AS seed_id,
            ${SCORE_SQL} AS initial_score
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" = 'INITIAL_SOLUTION_TOPIC'
          ORDER BY ${SEED_ID_SQL}, "createdAt" DESC
        ),
        final_algorithms AS (
          SELECT
            "seedId" AS seed_id,
            COALESCE(NULLIF("localSearch", ''), NULLIF("neighborhood", ''), 'Unknown') AS final_algorithm
          FROM "GraspExecutionRun"
        ),
        dls_candidates AS (
          SELECT
            ${SEED_ID_SQL} AS seed_id,
            ${RCL_ALGORITHM_SQL} AS rcl_algorithm,
            ${LOCAL_SEARCH_SQL} AS algorithm,
            ${SCORE_SQL} AS local_score,
            ${TRAINING_FILE_SQL} AS training_file_name,
            ${TESTING_FILE_SQL} AS testing_file_name,
            ${SOLUTION_FEATURES_JSON_SQL} AS solution_features,
            "createdAt" AS created_at,
            ROW_NUMBER() OVER (
              PARTITION BY ${SEED_ID_SQL}, ${LOCAL_SEARCH_SQL}
              ORDER BY ${SCORE_SQL} DESC NULLS LAST, "createdAt" DESC
            ) AS ranking
          FROM "GraspExecutionEvent"
          WHERE ${SNAPSHOT_EVENT_FILTER}
            AND "topic" IN ('LOCAL_SEARCH_PROGRESS_TOPIC', 'SOLUTIONS_TOPIC')
        )
        SELECT
          dls.seed_id AS "seedId",
          dls.algorithm AS algorithm,
          dls.rcl_algorithm AS "rclAlgorithm",
          dls.local_score AS "localScore",
          dls.training_file_name AS "trainingFileName",
          dls.testing_file_name AS "testingFileName",
          dls.solution_features AS "solutionFeatures",
          dls.created_at AS "createdAt",
          initial_scores.initial_score AS "initialScore",
          final_algorithms.final_algorithm AS "finalAlgorithm"
        FROM dls_candidates dls
        LEFT JOIN initial_scores ON initial_scores.seed_id = dls.seed_id
        LEFT JOIN final_algorithms ON final_algorithms.seed_id = dls.seed_id
        WHERE dls.ranking = 1
          AND dls.algorithm <> 'Unknown'
      `),
    ]);

    const overviewRow = overviewRows?.[0] || {};
    const {
      finalRunsByAlgorithm,
      finalRunsByRclAlgorithm,
    } = this.buildFinalRunSummaries(finalRunRows, initialSeedCountRows);
    const dlsOutcomeSummary = this.buildDlsOutcomeSummaries(dlsOutcomeRows);

    return {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: "persistent-store-build",
      bucketIntervalMs: this.bucketIntervalMs,
      overview: {
        rawEvents: this.normalizeCount(overviewRow.rawEvents),
        rawSnapshots: this.normalizeCount(overviewRow.rawSnapshots),
        uniqueSeeds: this.normalizeCount(overviewRow.uniqueSeeds),
        topics: this.normalizeCount(overviewRow.topics),
        avgInitialF1: this.normalizeMetric(overviewRow.avgInitialF1),
      },
      topicMetrics: this.mapTopicMetrics(topicMetricRows),
      activityBuckets: this.mapActivityBuckets(activityBucketRows),
      resourceAveragesByAlgorithm: this.mapResourceAverages(resourceByAlgorithmRows, "algorithm"),
      resourceAveragesByLocalSearch: this.mapResourceAverages(resourceByLocalSearchRows, "localSearch"),
      finalRunsByAlgorithm,
      finalRunsByRclAlgorithm,
      dlsOutcomeSummary,
    };
  }

  async getDashboardAggregate(options = {}) {
    const bucketLimit = this.normalizeBucketLimit(options.bucketLimit);
    const sourceWatermark = await this.getSourceWatermark();
    const storedReadModel = await prisma.graspDashboardReadModel.findUnique({
      where: { key: this.readModelKey },
      include: {
        topicMetrics: true,
        activityBuckets: true,
        resourceMetrics: true,
        algorithmMetrics: true,
      },
    });

    if (this.isReadModelFresh(storedReadModel, sourceWatermark)) {
      return this.buildMaterializedAggregate(storedReadModel, bucketLimit);
    }

    const aggregate = await this.buildDashboardAggregate({
      ...options,
      bucketLimit: Math.max(bucketLimit, this.readModelBucketLimit),
    });
    const storedPayload = await this.persistReadModel(aggregate, sourceWatermark);

    return this.sliceDashboardAggregate(storedPayload, bucketLimit);
  }
}

module.exports = new GraspDashboardAggregateService();
