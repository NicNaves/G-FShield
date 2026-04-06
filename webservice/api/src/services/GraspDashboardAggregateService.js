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

  async getDashboardAggregate(options = {}) {
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
      source: "persistent-store",
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
}

module.exports = new GraspDashboardAggregateService();
