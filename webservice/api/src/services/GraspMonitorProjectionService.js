const { MONITOR_SCHEMA_VERSION, graspMonitorSummaryService } = require("./GraspMonitorSummaryService");

class GraspMonitorProjectionService {
  constructor() {
    this.bucketIntervalMs = Math.max(Number(process.env.GRASP_PROJECTION_BUCKET_MS || 60_000) || 60_000, 5_000);
    this.eventWindowLimit = Math.max(
      Number(process.env.GRASP_PROJECTION_EVENT_LIMIT || process.env.GRASP_MONITOR_BOOTSTRAP_EVENT_LIMIT || 300) || 300,
      1
    );
    this.reset();
  }

  numberOrNull(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  parseTimestamp(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  buildEventKey(event = {}) {
    return event.fingerprint
      || event.requestId
      || `${event.type || "event"}:${event.topic || "topic"}:${event.seedId || "seed"}:${event.timestamp || "time"}`;
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

  createEmptyState() {
    return {
      runsBySeed: new Map(),
      events: [],
      topicMetrics: [],
      activityBuckets: [],
      summary: graspMonitorSummaryService.summarize([], []),
      summaryDirty: false,
      analyticsDirty: false,
      hydratedAt: null,
      generatedAt: new Date().toISOString(),
    };
  }

  reset(metadata = {}) {
    const state = this.createEmptyState();
    state.hydratedAt = metadata.hydratedAt || null;
    this.state = state;
  }

  normalizeEvents(events = []) {
    const deduped = new Map();

    events.forEach((event) => {
      if (!event) {
        return;
      }

      const key = this.buildEventKey(event);
      if (!deduped.has(key)) {
        deduped.set(key, event);
      }
    });

    return [...deduped.values()]
      .sort((left, right) => this.parseTimestamp(right.timestamp) - this.parseTimestamp(left.timestamp))
      .slice(0, this.eventWindowLimit);
  }

  markDirty() {
    this.state.summaryDirty = true;
    this.state.analyticsDirty = true;
    this.state.generatedAt = new Date().toISOString();
  }

  rehydrate(runs = [], events = [], metadata = {}) {
    this.reset({ hydratedAt: metadata.hydratedAt || new Date().toISOString() });

    runs.forEach((run) => {
      if (run?.seedId) {
        this.state.runsBySeed.set(run.seedId, run);
      }
    });

    this.state.events = this.normalizeEvents(events);
    this.state.summaryDirty = true;
    this.state.analyticsDirty = true;
    this.ensureAnalytics();
    this.ensureSummary();
  }

  applyRun(run) {
    if (!run?.seedId) {
      return;
    }

    this.state.runsBySeed.set(run.seedId, run);
    this.markDirty();
  }

  applyEvent(event) {
    if (!event) {
      return;
    }

    const nextEvents = this.normalizeEvents([event, ...this.state.events]);
    this.state.events = nextEvents;
    this.markDirty();
  }

  average(values = []) {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (!validValues.length) {
      return null;
    }

    return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
  }

  rebuildAnalytics() {
    const topicGroups = new Map();
    const activityBuckets = new Map();

    this.state.events.forEach((event) => {
      const topic = String(event?.topic || "UNSPECIFIED");
      const snapshot = this.extractSnapshot(event);
      const historyEntry = snapshot.historyEntry || {};
      const score = this.numberOrNull(
        historyEntry.f1Score
        ?? snapshot.bestF1Score
        ?? snapshot.currentF1Score
        ?? snapshot.f1Score
      );
      const cpuUsage = this.numberOrNull(historyEntry.cpuUsage ?? snapshot.cpuUsage);
      const memoryUsagePercent = this.numberOrNull(
        historyEntry.memoryUsagePercent
        ?? snapshot.memoryUsagePercent
      );

      const topicGroup = topicGroups.get(topic) || {
        topic,
        count: 0,
        uniqueSeeds: new Set(),
        scores: [],
        bestScore: Number.NEGATIVE_INFINITY,
      };

      topicGroup.count += 1;
      if (event?.seedId) {
        topicGroup.uniqueSeeds.add(event.seedId);
      }
      if (score !== null) {
        topicGroup.scores.push(score);
        topicGroup.bestScore = Math.max(topicGroup.bestScore, score);
      }
      topicGroups.set(topic, topicGroup);

      const timestampMs = this.parseTimestamp(event?.timestamp || snapshot.updatedAt || snapshot.createdAt);
      if (timestampMs === null) {
        return;
      }

      const bucketTimestampMs = Math.floor(timestampMs / this.bucketIntervalMs) * this.bucketIntervalMs;
      const bucketKey = new Date(bucketTimestampMs).toISOString();
      const bucket = activityBuckets.get(bucketKey) || {
        timestamp: bucketKey,
        count: 0,
        uniqueSeeds: new Set(),
        scores: [],
        cpuSamples: [],
        memorySamples: [],
        bestScore: null,
      };

      bucket.count += 1;
      if (event?.seedId) {
        bucket.uniqueSeeds.add(event.seedId);
      }
      if (score !== null) {
        bucket.scores.push(score);
        bucket.bestScore = bucket.bestScore === null ? score : Math.max(bucket.bestScore, score);
      }
      if (cpuUsage !== null) {
        bucket.cpuSamples.push(cpuUsage);
      }
      if (memoryUsagePercent !== null) {
        bucket.memorySamples.push(memoryUsagePercent);
      }
      activityBuckets.set(bucketKey, bucket);
    });

    this.state.topicMetrics = [...topicGroups.values()]
      .map((entry) => ({
        topic: entry.topic,
        count: entry.count,
        uniqueSeedCount: entry.uniqueSeeds.size,
        averageScore: this.average(entry.scores),
        bestScore: Number.isFinite(entry.bestScore) ? entry.bestScore : null,
      }))
      .sort((left, right) => right.count - left.count);

    this.state.activityBuckets = [...activityBuckets.values()]
      .sort((left, right) => this.parseTimestamp(left.timestamp) - this.parseTimestamp(right.timestamp))
      .map((entry) => ({
        timestamp: entry.timestamp,
        count: entry.count,
        uniqueSeedCount: entry.uniqueSeeds.size,
        averageScore: this.average(entry.scores),
        avgCpuUsage: this.average(entry.cpuSamples),
        avgMemoryUsagePercent: this.average(entry.memorySamples),
        bestScore: entry.bestScore,
      }));

    this.state.analyticsDirty = false;
  }

  ensureAnalytics() {
    if (this.state.analyticsDirty) {
      this.rebuildAnalytics();
    }
  }

  ensureSummary() {
    if (!this.state.summaryDirty) {
      return;
    }

    this.state.summary = graspMonitorSummaryService.summarize(this.getRuns(), this.state.events);
    this.state.summaryDirty = false;
  }

  getRuns(limit = null) {
    const orderedRuns = [...this.state.runsBySeed.values()].sort(
      (left, right) => this.parseTimestamp(right.updatedAt) - this.parseTimestamp(left.updatedAt)
    );

    if (!Number.isFinite(limit) || limit === null) {
      return orderedRuns;
    }

    return orderedRuns.slice(0, Math.max(Number(limit) || 0, 0));
  }

  getEvents(limit = null) {
    if (!Number.isFinite(limit) || limit === null) {
      return [...this.state.events];
    }

    return this.state.events.slice(0, Math.max(Number(limit) || 0, 0));
  }

  getSummary() {
    this.ensureSummary();
    return this.state.summary;
  }

  getProjection(options = {}) {
    const bucketLimit = Math.max(Number(options.bucketLimit || 72) || 72, 1);
    this.ensureAnalytics();

    return {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      generatedAt: this.state.generatedAt,
      hydratedAt: this.state.hydratedAt,
      bucketIntervalMs: this.bucketIntervalMs,
      runCount: this.state.runsBySeed.size,
      eventWindowSize: this.state.events.length,
      topicMetrics: this.state.topicMetrics,
      activityBuckets:
        bucketLimit > 0
          ? this.state.activityBuckets.slice(-bucketLimit)
          : this.state.activityBuckets,
      summary: this.getSummary(),
    };
  }
}

module.exports = new GraspMonitorProjectionService();
