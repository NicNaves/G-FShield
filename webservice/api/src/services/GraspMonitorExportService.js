const { randomUUID } = require("crypto");

const executionLaunchService = require("./ExecutionLaunchService");
const graspExecutionStoreService = require("./GraspExecutionStoreService");
const graspExecutionMonitorService = require("./GraspExecutionMonitorService");
const graspMonitorFeedService = require("./GraspMonitorFeedService");

const DEFAULT_JOB_TTL_MS = Math.max(Number(process.env.GRASP_EXPORT_JOB_TTL_MS || 15 * 60 * 1000), 60_000);
const DEFAULT_EVENT_LIMIT = Math.max(Number(process.env.GRASP_EXPORT_EVENT_LIMIT || 10_000), 1_000);

class GraspMonitorExportService {
  constructor() {
    this.jobs = new Map();
  }

  pruneExpiredJobs() {
    const now = Date.now();
    [...this.jobs.entries()].forEach(([jobId, job]) => {
      if (job.expiresAtMs <= now) {
        this.jobs.delete(jobId);
      }
    });
  }

  sanitizeFilePart(value, fallback = "all") {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || fallback;
  }

  serializeValue(value) {
    if (Array.isArray(value)) {
      return value.join(" | ");
    }

    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  }

  escapeCsvValue(value) {
    const serialized = this.serializeValue(value).replace(/"/g, '""');
    return /[",\n\r]/.test(serialized) ? `"${serialized}"` : serialized;
  }

  buildExportSummary(runs = [], snapshots = [], request = null) {
    return {
      runs: runs.length,
      snapshots: snapshots.length,
      uniqueSeeds: new Set(
        [...runs, ...snapshots]
          .map((entry) => entry?.seedId)
          .filter(Boolean)
      ).size,
      uniqueRequests: new Set(
        [
          ...runs.map((entry) => entry?.requestId),
          ...snapshots.map((entry) => entry?.requestId),
          request?.requestId || null,
        ].filter(Boolean)
      ).size,
    };
  }

  buildExportFileName(prefix, filters = {}, extension = "json") {
    const scope = this.sanitizeFilePart(filters.exportScope, "visible");
    const algorithm = this.sanitizeFilePart(filters.algorithm, "all");
    const dataset = this.sanitizeFilePart(filters.dataset, "all");
    const timeWindow = this.sanitizeFilePart(filters.timelineWindow || filters.timeWindow, "all");
    const seedId = this.sanitizeFilePart(filters.seedId ? String(filters.seedId).slice(0, 12) : "", "");
    const requestId = this.sanitizeFilePart(filters.requestId ? String(filters.requestId).slice(0, 18) : "", "");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    return `${[
      this.sanitizeFilePart(prefix, "dashboard"),
      scope,
      algorithm,
      dataset,
      timeWindow,
      requestId || null,
      seedId || null,
      stamp,
    ]
      .filter(Boolean)
      .join("-")}.${extension}`;
  }

  buildMonitorSnapshotsCsv(snapshots = []) {
    const headers = [
      "timestamp",
      "topic",
      "stage",
      "status",
      "algorithm",
      "search",
      "neighborhood",
      "currentF1Score",
      "bestF1Score",
      "previousBestF1Score",
      "scoreDelta",
      "seedId",
      "requestId",
      "trainingFileName",
      "testingFileName",
      "solutionFeatures",
      "rclFeatures",
      "cpuUsage",
      "memoryUsage",
      "memoryUsagePercent",
    ];

    const rows = snapshots.map((event) => [
      event?.timestamp || "",
      event?.topic || "",
      event?.stage || "",
      event?.status || "",
      event?.rclAlgorithm || "",
      event?.localSearch || "",
      event?.neighborhood || "",
      event?.currentF1Score ?? "",
      event?.bestF1Score ?? "",
      event?.previousBestF1Score ?? "",
      event?.scoreDelta ?? "",
      event?.seedId || "",
      event?.requestId || "",
      event?.trainingFileName || "",
      event?.testingFileName || "",
      event?.solutionFeatures || [],
      event?.rclFeatures || [],
      event?.cpuUsage ?? "",
      event?.memoryUsage ?? "",
      event?.memoryUsagePercent ?? "",
    ]);

    return [headers, ...rows]
      .map((row) => row.map((value) => this.escapeCsvValue(value)).join(","))
      .join("\n");
  }

  buildExportPayload({
    filters = {},
    runs = [],
    snapshots = [],
    request = null,
    events = [],
    generatedAt = new Date().toISOString(),
  } = {}) {
    return {
      generatedAt,
      filters,
      summary: this.buildExportSummary(runs, snapshots, request),
      request,
      runs,
      snapshots,
      events,
    };
  }

  parseFeatureList(features) {
    if (Array.isArray(features)) {
      return features.map((feature) => String(feature));
    }

    if (typeof features === "string") {
      return features
        .split(/[\s,]+/)
        .map((feature) => feature.trim())
        .filter(Boolean);
    }

    return [];
  }

  parseDateTime(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }

  matchesTimelineTimestampQuery(entry, query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    const timestamp = entry?.timestamp || "";
    const parsed = timestamp ? new Date(timestamp) : null;
    const isoTimestamp = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "";
    const compactLocalTimestamp = parsed && !Number.isNaN(parsed.getTime())
      ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
        parsed.getDate()
      ).padStart(2, "0")} ${String(parsed.getHours()).padStart(2, "0")}:${String(
        parsed.getMinutes()
      ).padStart(2, "0")}`
      : "";

    return [timestamp, isoTimestamp, compactLocalTimestamp]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }

  isEntryWithinRange(entry, start, end) {
    const timestamp = this.parseDateTime(entry?.timestamp);
    const startTimestamp = this.parseDateTime(start);
    const endTimestamp = this.parseDateTime(end);

    if (timestamp === null) {
      return true;
    }

    if (startTimestamp !== null && timestamp < startTimestamp) {
      return false;
    }

    if (endTimestamp !== null && timestamp > endTimestamp) {
      return false;
    }

    return true;
  }

  extractHistorySnapshot(run, entry) {
    return {
      seedId: run?.seedId || null,
      requestId: entry?.requestId || run?.requestId || null,
      topic: entry?.topic || null,
      stage: entry?.stage || null,
      status: entry?.status || run?.status || null,
      timestamp: entry?.timestamp || run?.updatedAt || run?.createdAt || null,
      rclAlgorithm: run?.rclAlgorithm || null,
      classifier: run?.classifier || null,
      localSearch: entry?.localSearch || run?.localSearch || null,
      neighborhood: entry?.neighborhood || run?.neighborhood || null,
      currentF1Score: entry?.f1Score ?? run?.currentF1Score ?? null,
      bestF1Score: entry?.f1Score ?? run?.bestF1Score ?? run?.currentF1Score ?? null,
      trainingFileName: run?.trainingFileName || null,
      testingFileName: run?.testingFileName || null,
      iterationNeighborhood: entry?.iterationNeighborhood ?? run?.iterationNeighborhood ?? null,
      iterationLocalSearch: entry?.iterationLocalSearch ?? run?.iterationLocalSearch ?? null,
      previousBestF1Score: entry?.previousBestF1Score ?? run?.previousBestF1Score ?? null,
      scoreDelta: entry?.scoreDelta ?? run?.scoreDelta ?? null,
      improved: entry?.improved ?? run?.improved ?? null,
      solutionFeatures: entry?.solutionFeatures || run?.solutionFeatures || [],
      rclFeatures: entry?.rclFeatures || run?.rclFeatures || run?.rclfeatures || [],
      enabledLocalSearches: entry?.enabledLocalSearches || run?.enabledLocalSearches || [],
      solutionSize: entry?.solutionSize ?? run?.solutionSize ?? null,
      rclSize: entry?.rclSize ?? run?.rclSize ?? null,
      memoryUsage: entry?.memoryUsage ?? run?.memoryUsage ?? null,
      memoryUsagePercent: entry?.memoryUsagePercent ?? run?.memoryUsagePercent ?? null,
      cpuUsage: entry?.cpuUsage ?? run?.cpuUsage ?? null,
    };
  }

  extractFeedSnapshot(event) {
    const snapshot = event?.payload?.payload || event?.payload || {};
    const historyEntry = snapshot.historyEntry || {};
    const solutionFeatures = this.parseFeatureList(historyEntry.solutionFeatures || snapshot.solutionFeatures);
    const rclFeatures = this.parseFeatureList(
      historyEntry.rclFeatures || snapshot.rclFeatures || snapshot.rclfeatures
    );

    return {
      ...event,
      seedId: snapshot.seedId || event?.seedId || null,
      requestId: snapshot.requestId || historyEntry.requestId || event?.requestId || null,
      topic: historyEntry.topic || event?.topic || snapshot.topic || null,
      stage: historyEntry.stage || event?.stage || snapshot.stage || null,
      timestamp: event?.timestamp || snapshot.updatedAt || snapshot.createdAt || null,
      rclAlgorithm: snapshot.rclAlgorithm || null,
      classifier: snapshot.classifier || snapshot.classfier || null,
      localSearch: historyEntry.localSearch || snapshot.localSearch || null,
      neighborhood: historyEntry.neighborhood || snapshot.neighborhood || null,
      currentF1Score: historyEntry.f1Score ?? snapshot.currentF1Score ?? snapshot.f1Score ?? null,
      bestF1Score: snapshot.bestF1Score ?? snapshot.currentF1Score ?? snapshot.f1Score ?? null,
      trainingFileName: snapshot.trainingFileName || null,
      testingFileName: snapshot.testingFileName || null,
      iterationNeighborhood: historyEntry.iterationNeighborhood ?? snapshot.iterationNeighborhood ?? null,
      iterationLocalSearch: historyEntry.iterationLocalSearch ?? snapshot.iterationLocalSearch ?? null,
      previousBestF1Score: historyEntry.previousBestF1Score ?? snapshot.previousBestF1Score ?? null,
      scoreDelta: historyEntry.scoreDelta ?? snapshot.scoreDelta ?? null,
      improved: historyEntry.improved ?? snapshot.improved ?? null,
      solutionFeatures,
      rclFeatures,
      enabledLocalSearches: Array.isArray(historyEntry.enabledLocalSearches)
        ? historyEntry.enabledLocalSearches
        : Array.isArray(snapshot.enabledLocalSearches)
          ? snapshot.enabledLocalSearches
          : [],
      solutionSize: historyEntry.solutionSize ?? snapshot.solutionSize ?? solutionFeatures.length,
      rclSize: historyEntry.rclSize ?? snapshot.rclSize ?? rclFeatures.length,
      memoryUsage: historyEntry.memoryUsage ?? snapshot.memoryUsage ?? null,
      memoryUsagePercent: historyEntry.memoryUsagePercent ?? snapshot.memoryUsagePercent ?? null,
      cpuUsage: historyEntry.cpuUsage ?? snapshot.cpuUsage ?? null,
    };
  }

  mergeRun(liveRun, storedRun) {
    if (!liveRun) {
      return storedRun;
    }

    if (!storedRun) {
      return liveRun;
    }

    return {
      ...storedRun,
      ...liveRun,
      history:
        (liveRun.history?.length || 0) >= (storedRun.history?.length || 0)
          ? liveRun.history || []
          : storedRun.history || [],
    };
  }

  async loadRun(seedId) {
    const [storedRun, liveRun] = await Promise.all([
      graspExecutionStoreService.getRun(seedId, 0),
      Promise.resolve(graspExecutionMonitorService.getRun(seedId)),
    ]);

    return this.mergeRun(liveRun, storedRun);
  }

  buildRunSnapshots(run, options = {}) {
    const history = Array.isArray(run?.history) ? run.history : [];
    return history
      .filter((entry) =>
        this.isEntryWithinRange(entry, options.timelineStart, options.timelineEnd)
        && this.matchesTimelineTimestampQuery(entry, options.timelineTimestampQuery)
      )
      .map((entry, index) => ({
        ...this.extractHistorySnapshot(run, entry),
        order: index + 1,
      }))
      .sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0));
  }

  async buildExportSelection(payload = {}) {
    const filters = payload.filters && typeof payload.filters === "object" ? payload.filters : {};
    const scope = String(payload.scope || filters.exportScope || "visible").toLowerCase();
    const commonFilters = {
      ...filters,
      exportScope: scope,
    };

    if (scope === "request") {
      if (!payload.requestId) {
        throw new Error("requestId is required for request exports.");
      }

      const request = await executionLaunchService.getLaunch(payload.requestId, {
        includeMonitor: true,
        historyLimit: 0,
        eventLimit: Math.max(Number(payload.eventLimit || DEFAULT_EVENT_LIMIT), 1000),
      });

      if (!request) {
        throw new Error("Execution launch not found.");
      }

      const monitor = request.monitor || { runs: [], events: [] };
      const snapshots = (monitor.runs || [])
        .flatMap((run) => this.buildRunSnapshots(run, {}));

      return {
        prefix: "request-history",
        filters: {
          ...commonFilters,
          requestId: request.requestId,
          seedId: null,
          timelineWindow: "all",
          timelineTimestampQuery: null,
        },
        request,
        runs: monitor.runs || [],
        snapshots,
        events: monitor.events || [],
      };
    }

    if (scope === "run" || scope === "timeline") {
      if (!payload.seedId) {
        throw new Error("seedId is required for run exports.");
      }

      const run = await this.loadRun(payload.seedId);
      if (!run) {
        throw new Error("Execution run not found.");
      }

      const runFilters = scope === "timeline"
        ? {
            timelineStart: payload.timelineStart || null,
            timelineEnd: payload.timelineEnd || null,
            timelineTimestampQuery: payload.timelineTimestampQuery || null,
          }
        : {};

      return {
        prefix: scope === "timeline" ? "run-timeline" : "run-history",
        filters: {
          ...commonFilters,
          requestId: run.requestId || null,
          seedId: run.seedId || payload.seedId,
        },
        request: null,
        runs: [run],
        snapshots: this.buildRunSnapshots(run, runFilters),
        events: [],
      };
    }

    if (scope === "feed") {
      const feedOptions = {
        topics: payload.topics || [],
        algorithm: payload.algorithm || null,
        datasetKey: payload.datasetKey || null,
        status: payload.status || null,
        searchLabel: payload.searchLabel || null,
        requestId: payload.requestId || null,
        seedId: payload.seedId || null,
        start: payload.start || null,
        end: payload.end || null,
        query: payload.query || null,
        minF1Score: payload.minF1Score ?? null,
        maxF1Score: payload.maxF1Score ?? null,
      };
      const events = await graspMonitorFeedService.listAllFeed(feedOptions);
      const snapshots = events.map((event) => this.extractFeedSnapshot(event));

      return {
        prefix: payload.prefix || "table-feed",
        filters: {
          ...commonFilters,
          algorithm: feedOptions.algorithm || commonFilters.algorithm || null,
          requestId: feedOptions.requestId || commonFilters.requestId || null,
          seedId: feedOptions.seedId || commonFilters.seedId || null,
          minF1Score: feedOptions.minF1Score,
          maxF1Score: feedOptions.maxF1Score,
        },
        request: null,
        runs: [],
        snapshots,
        events: [],
      };
    }

    throw new Error("Unsupported export scope for async processing.");
  }

  createJob(payload = {}, requestedBy = null) {
    this.pruneExpiredJobs();

    const jobId = randomUUID();
    const now = new Date();
    const job = {
      jobId,
      status: "queued",
      format: String(payload.format || "json").toLowerCase() === "csv" ? "csv" : "json",
      scope: String(payload.scope || "visible").toLowerCase(),
      payload,
      requestedById: requestedBy?.id || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
      error: null,
      filename: null,
      mimeType: null,
      sizeBytes: 0,
      content: null,
      expiresAtMs: now.getTime() + DEFAULT_JOB_TTL_MS,
    };

    this.jobs.set(jobId, job);
    setImmediate(() => {
      this.processJob(jobId).catch(() => {});
    });

    return this.serializeJob(job);
  }

  serializeJob(job) {
    if (!job) {
      return null;
    }

    return {
      jobId: job.jobId,
      status: job.status,
      format: job.format,
      scope: job.scope,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      error: job.error,
      filename: job.filename,
      mimeType: job.mimeType,
      sizeBytes: job.sizeBytes,
      downloadReady: job.status === "completed" && Boolean(job.content),
      expiresAt: new Date(job.expiresAtMs).toISOString(),
    };
  }

  async processJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    job.status = "running";
    job.updatedAt = new Date().toISOString();

    try {
      const exportSelection = await this.buildExportSelection(job.payload);
      const filename = this.buildExportFileName(exportSelection.prefix, exportSelection.filters, job.format);
      const mimeType = job.format === "csv"
        ? "text/csv;charset=utf-8"
        : "application/json;charset=utf-8";
      const content = job.format === "csv"
        ? this.buildMonitorSnapshotsCsv(exportSelection.snapshots)
        : JSON.stringify(this.buildExportPayload(exportSelection), null, 2);

      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;
      job.filename = filename;
      job.mimeType = mimeType;
      job.content = Buffer.from(content, "utf-8");
      job.sizeBytes = job.content.byteLength;
    } catch (error) {
      job.status = "failed";
      job.updatedAt = new Date().toISOString();
      job.error = error.message || "Unable to generate export.";
    }
  }

  getJob(jobId) {
    this.pruneExpiredJobs();
    return this.serializeJob(this.jobs.get(jobId));
  }

  getJobContent(jobId) {
    this.pruneExpiredJobs();
    const job = this.jobs.get(jobId);

    if (!job) {
      return null;
    }

    if (job.status !== "completed" || !job.content) {
      throw new Error("Export job is not ready.");
    }

    return {
      filename: job.filename,
      mimeType: job.mimeType,
      content: job.content,
    };
  }
}

module.exports = new GraspMonitorExportService();
