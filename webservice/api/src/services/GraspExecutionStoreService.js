const prisma = require("../lib/prisma");
const logger = require("../utils/jsonLogger");

class GraspExecutionStoreService {
  isProgressTopic(topic) {
    return topic === "LOCAL_SEARCH_PROGRESS_TOPIC";
  }

  topicPriority(topic) {
    if (topic === "BEST_SOLUTION_TOPIC") {
      return 3;
    }

    if (topic === "SOLUTIONS_TOPIC") {
      return 2;
    }

    if (topic === "LOCAL_SEARCH_PROGRESS_TOPIC") {
      return 1;
    }

    return 0;
  }

  normalizeStatus(status, fallback = "RUNNING") {
    if (!status) {
      return fallback;
    }

    const normalized = String(status).trim().toUpperCase();
    const allowed = new Set(["REQUESTED", "RUNNING", "COMPLETED", "FAILED"]);
    return allowed.has(normalized) ? normalized : fallback;
  }

  parseDate(value) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  normalizeRunningTime(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    return String(value);
  }

  extractSnapshotFromEventPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return {};
    }

    if (payload.payload && typeof payload.payload === "object") {
      return payload.payload;
    }

    return payload;
  }

  buildLaunchData(dispatchResult) {
    return {
      status: this.normalizeStatus(dispatchResult.status, "REQUESTED"),
      algorithms: dispatchResult.algorithms || [],
      maxGenerations: Number(dispatchResult.params?.maxGenerations || 0),
      rclCutoff: Number(dispatchResult.params?.rclCutoff || 0),
      sampleSize: Number(dispatchResult.params?.sampleSize || 0),
      datasetTrainingName: dispatchResult.params?.datasetTrainingName || "",
      datasetTestingName: dispatchResult.params?.datasetTestingName || "",
      classifier: dispatchResult.params?.classifier || "J48",
      requestedAt: this.parseDate(dispatchResult.requestedAt) || new Date(),
      metadata: dispatchResult,
    };
  }

  buildRunData(snapshot) {
    return {
      status: this.normalizeStatus(snapshot.status, "RUNNING"),
      stage: snapshot.stage || null,
      topic: snapshot.topic || null,
      rclAlgorithm: snapshot.rclAlgorithm || null,
      classifier: snapshot.classifier || null,
      localSearch: snapshot.localSearch || null,
      neighborhood: snapshot.neighborhood || null,
      trainingFileName: snapshot.trainingFileName || null,
      testingFileName: snapshot.testingFileName || null,
      iterationNeighborhood: snapshot.iterationNeighborhood ?? null,
      iterationLocalSearch: snapshot.iterationLocalSearch ?? null,
      currentF1Score: snapshot.currentF1Score ?? null,
      bestF1Score: snapshot.bestF1Score ?? null,
      accuracy: snapshot.accuracy ?? null,
      precision: snapshot.precision ?? null,
      recall: snapshot.recall ?? null,
      cpuUsage: snapshot.cpuUsage ?? null,
      memoryUsage: snapshot.memoryUsage ?? null,
      memoryUsagePercent: snapshot.memoryUsagePercent ?? null,
      runningTime: this.normalizeRunningTime(snapshot.runnigTime ?? snapshot.runningTime ?? null),
      solutionFeatures: snapshot.solutionFeatures ?? [],
      rclFeatures: snapshot.rclfeatures ?? snapshot.rclFeatures ?? [],
      updates: snapshot.updates ?? 0,
      createdAt: this.parseDate(snapshot.createdAt) || new Date(),
      completedAt: this.parseDate(snapshot.completedAt) || null,
    };
  }

  buildHistory(events = []) {
    return events
      .filter((event) => !this.isProgressTopic(event.topic))
      .map((event) => {
        const payload = event.payload || {};
        const snapshot = payload.payload || {};

        return {
          timestamp: event.createdAt.toISOString(),
          stage: event.stage || snapshot.stage || null,
          topic: event.topic || snapshot.topic || null,
          f1Score: snapshot.currentF1Score ?? snapshot.f1Score ?? null,
          cpuUsage: snapshot.cpuUsage ?? null,
          memoryUsage: snapshot.memoryUsage ?? null,
          memoryUsagePercent: snapshot.memoryUsagePercent ?? null,
          localSearch: snapshot.localSearch || null,
          neighborhood: snapshot.neighborhood || null,
          solutionFeatures: snapshot.solutionFeatures || [],
        };
      })
      .reverse();
  }

  mapRun(runRecord) {
    const bestSolutionEvent = (runRecord.bestSolutionEvents || [])[0] || null;
    const bestSnapshot = this.extractSnapshotFromEventPayload(bestSolutionEvent?.payload);
    const shouldPromoteBestSnapshot =
      this.topicPriority(bestSnapshot.topic || bestSolutionEvent?.topic) > this.topicPriority(runRecord.topic);

    const effectiveTopic = shouldPromoteBestSnapshot ? (bestSnapshot.topic || bestSolutionEvent?.topic) : runRecord.topic;
    const effectiveStage = shouldPromoteBestSnapshot ? (bestSnapshot.stage || bestSolutionEvent?.stage) : runRecord.stage;
    const effectiveCompletedAt = shouldPromoteBestSnapshot
      ? (this.parseDate(bestSnapshot.completedAt) || bestSolutionEvent?.createdAt || runRecord.completedAt)
      : runRecord.completedAt;
    const history = this.buildHistory(runRecord.events || []);

    return {
      seedId: runRecord.seedId,
      createdAt: runRecord.createdAt.toISOString(),
      updatedAt: runRecord.updatedAt.toISOString(),
      completedAt: effectiveCompletedAt ? effectiveCompletedAt.toISOString() : null,
      status: shouldPromoteBestSnapshot ? "completed" : runRecord.status.toLowerCase(),
      stage: effectiveStage,
      topic: effectiveTopic,
      rclAlgorithm: bestSnapshot.rclAlgorithm || runRecord.rclAlgorithm,
      classifier: bestSnapshot.classifier || bestSnapshot.classfier || runRecord.classifier,
      localSearch: bestSnapshot.localSearch || runRecord.localSearch,
      neighborhood: bestSnapshot.neighborhood || runRecord.neighborhood,
      trainingFileName: bestSnapshot.trainingFileName || runRecord.trainingFileName,
      testingFileName: bestSnapshot.testingFileName || runRecord.testingFileName,
      iterationNeighborhood: bestSnapshot.iterationNeighborhood ?? runRecord.iterationNeighborhood,
      iterationLocalSearch: bestSnapshot.iterationLocalSearch ?? runRecord.iterationLocalSearch,
      currentF1Score: shouldPromoteBestSnapshot
        ? (bestSnapshot.currentF1Score ?? bestSnapshot.f1Score ?? runRecord.currentF1Score)
        : runRecord.currentF1Score,
      bestF1Score: runRecord.bestF1Score,
      accuracy: bestSnapshot.accuracy ?? runRecord.accuracy,
      precision: bestSnapshot.precision ?? runRecord.precision,
      recall: bestSnapshot.recall ?? runRecord.recall,
      cpuUsage: runRecord.cpuUsage,
      memoryUsage: runRecord.memoryUsage,
      memoryUsagePercent: runRecord.memoryUsagePercent,
      runnigTime: bestSnapshot.runnigTime ?? bestSnapshot.runningTime ?? runRecord.runningTime,
      solutionFeatures: bestSnapshot.solutionFeatures || runRecord.solutionFeatures || [],
      rclfeatures: bestSnapshot.rclfeatures || bestSnapshot.rclFeatures || runRecord.rclFeatures || [],
      updates: runRecord.updates,
      history,
    };
  }

  mapEvent(eventRecord) {
    return {
      fingerprint: eventRecord.fingerprint,
      timestamp: eventRecord.createdAt.toISOString(),
      type: eventRecord.eventType,
      topic: eventRecord.topic,
      stage: eventRecord.stage,
      status: eventRecord.status ? eventRecord.status.toLowerCase() : null,
      seedId: eventRecord.seedId,
      requestId: eventRecord.requestId,
      sourcePartition: eventRecord.sourcePartition,
      sourceOffset: eventRecord.sourceOffset,
      payload: eventRecord.payload,
    };
  }

  async recordGatewayDispatch(dispatchResult) {
    if (!dispatchResult.requestId) {
      return null;
    }

    const launch = await prisma.graspExecutionLaunch.upsert({
      where: { requestId: dispatchResult.requestId },
      update: this.buildLaunchData(dispatchResult),
      create: {
        requestId: dispatchResult.requestId,
        ...this.buildLaunchData(dispatchResult),
      },
    });

    await prisma.graspExecutionEvent.upsert({
      where: { fingerprint: `gateway:${dispatchResult.requestId}` },
      update: {
        eventType: "gateway.dispatch",
        topic: "API_GATEWAY",
        status: "REQUESTED",
        requestId: dispatchResult.requestId,
        payload: dispatchResult,
        launchId: launch.id,
      },
      create: {
        fingerprint: `gateway:${dispatchResult.requestId}`,
        eventType: "gateway.dispatch",
        topic: "API_GATEWAY",
        status: "REQUESTED",
        requestId: dispatchResult.requestId,
        payload: dispatchResult,
        launchId: launch.id,
      },
    });

    return launch;
  }

  async recordKafkaUpdate(event) {
    if (!event.seedId || !event.payload) {
      return null;
    }

    const snapshot = event.payload;
    const run = await prisma.graspExecutionRun.upsert({
      where: { seedId: event.seedId },
      update: this.buildRunData(snapshot),
      create: {
        seedId: event.seedId,
        ...this.buildRunData(snapshot),
      },
    });

    if (!event.fingerprint) {
      return run;
    }

    await prisma.graspExecutionEvent.upsert({
      where: { fingerprint: event.fingerprint },
      update: {
        eventType: event.type || "kafka.update",
        topic: event.topic || null,
        stage: event.stage || null,
        status: this.normalizeStatus(event.status, "RUNNING"),
        seedId: event.seedId,
        sourcePartition: event.sourcePartition ?? null,
        sourceOffset: event.sourceOffset ?? null,
        payload: event,
        runId: run.id,
      },
      create: {
        fingerprint: event.fingerprint,
        eventType: event.type || "kafka.update",
        topic: event.topic || null,
        stage: event.stage || null,
        status: this.normalizeStatus(event.status, "RUNNING"),
        seedId: event.seedId,
        sourcePartition: event.sourcePartition ?? null,
        sourceOffset: event.sourceOffset ?? null,
        payload: event,
        runId: run.id,
      },
    });

    return run;
  }

  async listRuns(limit = 100, historyLimit = Number(process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 30)) {
    const runs = await prisma.graspExecutionRun.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        events: {
          where: { eventType: { in: ["kafka.update", "kafka.progress"] } },
          orderBy: { createdAt: "desc" },
          ...(historyLimit > 0 ? { take: historyLimit } : {}),
        },
      },
    });

    const seedIds = runs.map((run) => run.seedId);
    const bestSolutionEvents = seedIds.length > 0
      ? await prisma.graspExecutionEvent.findMany({
          where: {
            seedId: { in: seedIds },
            topic: "BEST_SOLUTION_TOPIC",
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const bestEventBySeedId = new Map();
    bestSolutionEvents.forEach((event) => {
      if (event.seedId && !bestEventBySeedId.has(event.seedId)) {
        bestEventBySeedId.set(event.seedId, event);
      }
    });

    return runs.map((run) => this.mapRun({
      ...run,
      bestSolutionEvents: bestEventBySeedId.has(run.seedId) ? [bestEventBySeedId.get(run.seedId)] : [],
    }));
  }

  async getRun(seedId, historyLimit = Number(process.env.GRASP_RUN_HISTORY_LIMIT || 2000)) {
    const run = await prisma.graspExecutionRun.findUnique({
      where: { seedId },
      include: {
        events: {
          where: { eventType: { in: ["kafka.update", "kafka.progress"] } },
          orderBy: { createdAt: "desc" },
          ...(historyLimit > 0 ? { take: historyLimit } : {}),
        },
      },
    });

    if (!run) {
      return null;
    }

    const bestSolutionEvent = await prisma.graspExecutionEvent.findFirst({
      where: {
        seedId,
        topic: "BEST_SOLUTION_TOPIC",
      },
      orderBy: { createdAt: "desc" },
    });

    return this.mapRun({
      ...run,
      bestSolutionEvents: bestSolutionEvent ? [bestSolutionEvent] : [],
    });
  }

  async listEvents(limit = 100) {
    const events = await prisma.graspExecutionEvent.findMany({
      where: {
        OR: [
          { topic: null },
          { topic: { not: "LOCAL_SEARCH_PROGRESS_TOPIC" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return events.map((event) => this.mapEvent(event));
  }

  async disconnect() {
    try {
      await prisma.$disconnect();
    } catch (error) {
      logger.warn("Falha ao desconectar Prisma", { error: error.message });
    }
  }
}

module.exports = new GraspExecutionStoreService();
