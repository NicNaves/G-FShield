const prisma = require("../lib/prisma");
const { MONITOR_SCHEMA_VERSION } = require("./GraspMonitorSummaryService");

const SNAPSHOT_EVENT_FILTER = `"eventType" IN ('kafka.update', 'kafka.progress')`;
const SEED_ID_SQL = `COALESCE("seedId", "payload"#>>'{payload,seedId}', "payload"#>>'{seedId}')`;
const REQUEST_ID_SQL = `COALESCE("requestId", "payload"#>>'{payload,requestId}', "payload"#>>'{requestId}')`;
const RCL_ALGORITHM_SQL = `COALESCE(NULLIF(COALESCE("payload"#>>'{payload,rclAlgorithm}', "payload"#>>'{rclAlgorithm}'), ''), 'Unknown')`;
const SEARCH_LABEL_SQL = `COALESCE(
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

class GraspMonitorFeedService {
  constructor() {
    this.defaultPageSize = Math.max(Number(process.env.GRASP_FEED_PAGE_SIZE || 25) || 25, 1);
    this.maxPageSize = Math.max(Number(process.env.GRASP_FEED_MAX_PAGE_SIZE || 100) || 100, this.defaultPageSize);
  }

  normalizeTopics(topics) {
    const values = Array.isArray(topics)
      ? topics
      : typeof topics === "string"
        ? topics.split(",")
        : [];

    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  normalizeStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    return ["REQUESTED", "RUNNING", "COMPLETED", "FAILED"].includes(normalized)
      ? normalized
      : null;
  }

  normalizePage(page) {
    const parsed = Number(page);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }

    return Math.floor(parsed);
  }

  normalizePageSize(pageSize) {
    const parsed = Number(pageSize);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return this.defaultPageSize;
    }

    return Math.min(Math.floor(parsed), this.maxPageSize);
  }

  parseDate(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  parseDatasetKey(datasetKey) {
    const normalized = String(datasetKey || "").trim();
    if (!normalized || normalized === "all") {
      return {
        trainingFileName: null,
        testingFileName: null,
      };
    }

    const [trainingFileName = "", testingFileName = ""] = normalized.split("|");
    return {
      trainingFileName: trainingFileName && trainingFileName !== "--" ? trainingFileName : null,
      testingFileName: testingFileName && testingFileName !== "--" ? testingFileName : null,
    };
  }

  addParam(params, value) {
    params.push(value);
    return `$${params.length}`;
  }

  buildFilterState(options = {}) {
    const params = [];
    const clauses = [SNAPSHOT_EVENT_FILTER];
    const topics = this.normalizeTopics(options.topics);
    const status = this.normalizeStatus(options.status);
    const dataset = this.parseDatasetKey(options.datasetKey);
    const from = this.parseDate(options.start);
    const to = this.parseDate(options.end);
    const query = String(options.query || "").trim().toLowerCase();
    const algorithm = String(options.algorithm || "").trim();
    const requestId = String(options.requestId || "").trim();
    const seedId = String(options.seedId || "").trim();
    const searchLabel = String(options.searchLabel || "").trim().toUpperCase();

    if (topics.length) {
      const placeholders = topics.map((topic) => this.addParam(params, topic));
      clauses.push(`COALESCE("topic", 'UNSPECIFIED') IN (${placeholders.join(", ")})`);
    }

    if (seedId) {
      clauses.push(`${SEED_ID_SQL} = ${this.addParam(params, seedId)}`);
    }

    if (requestId) {
      clauses.push(`${REQUEST_ID_SQL} = ${this.addParam(params, requestId)}`);
    }

    if (algorithm) {
      clauses.push(`${RCL_ALGORITHM_SQL} = ${this.addParam(params, algorithm)}`);
    }

    if (dataset.trainingFileName) {
      clauses.push(`${TRAINING_FILE_SQL} = ${this.addParam(params, dataset.trainingFileName)}`);
    }

    if (dataset.testingFileName) {
      clauses.push(`${TESTING_FILE_SQL} = ${this.addParam(params, dataset.testingFileName)}`);
    }

    if (status) {
      clauses.push(`CAST("status" AS TEXT) = ${this.addParam(params, status)}`);
    }

    if (searchLabel) {
      clauses.push(`UPPER(${SEARCH_LABEL_SQL}) = ${this.addParam(params, searchLabel)}`);
    }

    if (from) {
      clauses.push(`"createdAt" >= ${this.addParam(params, from)}`);
    }

    if (to) {
      clauses.push(`"createdAt" <= ${this.addParam(params, to)}`);
    }

    if (query) {
      const pattern = `%${query}%`;
      const placeholder = this.addParam(params, pattern);
      clauses.push(`(
        LOWER(COALESCE(${SEED_ID_SQL}, '')) LIKE ${placeholder}
        OR LOWER(COALESCE(${REQUEST_ID_SQL}, '')) LIKE ${placeholder}
        OR LOWER(COALESCE("topic", '')) LIKE ${placeholder}
        OR LOWER(COALESCE("stage", '')) LIKE ${placeholder}
        OR LOWER(COALESCE(${RCL_ALGORITHM_SQL}, '')) LIKE ${placeholder}
        OR LOWER(COALESCE(${SEARCH_LABEL_SQL}, '')) LIKE ${placeholder}
        OR LOWER(COALESCE(${TRAINING_FILE_SQL}, '')) LIKE ${placeholder}
        OR LOWER(COALESCE(${TESTING_FILE_SQL}, '')) LIKE ${placeholder}
      )`);
    }

    return {
      params,
      whereClause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    };
  }

  mapEvent(eventRecord) {
    const payloadRequestId = eventRecord?.payload?.payload?.requestId
      || eventRecord?.payload?.requestId
      || null;

    return {
      fingerprint: eventRecord.fingerprint,
      timestamp: eventRecord.createdAt.toISOString(),
      type: eventRecord.eventType,
      topic: eventRecord.topic,
      stage: eventRecord.stage,
      status: eventRecord.status ? String(eventRecord.status).toLowerCase() : null,
      seedId: eventRecord.seedId,
      requestId: eventRecord.requestId || payloadRequestId,
      sourcePartition: eventRecord.sourcePartition,
      sourceOffset: eventRecord.sourceOffset,
      schemaVersion: MONITOR_SCHEMA_VERSION,
      payload: eventRecord.payload,
    };
  }

  async listFeed(options = {}) {
    const page = this.normalizePage(options.page);
    const pageSize = this.normalizePageSize(options.pageSize);
    const offset = (page - 1) * pageSize;
    const { whereClause, params } = this.buildFilterState(options);

    const countRows = await prisma.$queryRawUnsafe(
      `
        SELECT COUNT(*)::bigint AS total
        FROM "GraspExecutionEvent"
        ${whereClause}
      `,
      ...params
    );

    const eventRows = await prisma.$queryRawUnsafe(
      `
        SELECT
          "fingerprint",
          "eventType",
          "topic",
          "stage",
          "status",
          "seedId",
          "requestId",
          "sourcePartition",
          "sourceOffset",
          "payload",
          "createdAt"
        FROM "GraspExecutionEvent"
        ${whereClause}
        ORDER BY "createdAt" DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      ...params,
      pageSize,
      offset
    );

    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    return {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      source: "persistent-store",
      items: eventRows.map((eventRecord) => this.mapEvent(eventRecord)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }
}

module.exports = new GraspMonitorFeedService();
