const prisma = require("../lib/prisma");
const logger = require("../utils/jsonLogger");
const { MONITOR_SCHEMA_VERSION } = require("./GraspMonitorSummaryService");

class GraspExecutionStoreService {
  isProgressTopic(topic) {
    return topic === "LOCAL_SEARCH_PROGRESS_TOPIC";
  }

  topicPriority(topic) {
    if (topic === "BEST_SOLUTION_TOPIC") {
      return 2;
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
      .map((event) => {
        const payload = event.payload || {};
        const snapshot = payload.payload || {};
        const historyEntry = snapshot.historyEntry || {};
        const solutionFeatures = historyEntry.solutionFeatures || snapshot.solutionFeatures || [];
        const rclFeatures = historyEntry.rclFeatures || snapshot.rclfeatures || snapshot.rclFeatures || [];

        return {
          timestamp: event.createdAt.toISOString(),
          stage: historyEntry.stage || event.stage || snapshot.stage || null,
          topic: historyEntry.topic || event.topic || snapshot.topic || null,
          eventType: event.eventType || null,
          f1Score: historyEntry.f1Score ?? snapshot.currentF1Score ?? snapshot.f1Score ?? null,
          previousBestF1Score: historyEntry.previousBestF1Score ?? snapshot.previousBestF1Score ?? null,
          scoreDelta: historyEntry.scoreDelta ?? snapshot.scoreDelta ?? null,
          improved: historyEntry.improved ?? snapshot.improved ?? null,
          cpuUsage: historyEntry.cpuUsage ?? snapshot.cpuUsage ?? null,
          memoryUsage: historyEntry.memoryUsage ?? snapshot.memoryUsage ?? null,
          memoryUsagePercent: historyEntry.memoryUsagePercent ?? snapshot.memoryUsagePercent ?? null,
          localSearch: historyEntry.localSearch || snapshot.localSearch || null,
          neighborhood: historyEntry.neighborhood || snapshot.neighborhood || null,
          iterationNeighborhood: historyEntry.iterationNeighborhood ?? snapshot.iterationNeighborhood ?? null,
          iterationLocalSearch: historyEntry.iterationLocalSearch ?? snapshot.iterationLocalSearch ?? null,
          solutionSize: historyEntry.solutionSize ?? snapshot.solutionSize ?? solutionFeatures.length,
          rclSize: historyEntry.rclSize ?? snapshot.rclSize ?? rclFeatures.length,
          enabledLocalSearches: historyEntry.enabledLocalSearches || snapshot.enabledLocalSearches || [],
          rclFeatures,
          solutionFeatures,
        };
      })
      .reverse();
  }

  mapRun(runRecord) {
    const bestSolutionEvent = (runRecord.bestSolutionEvents || [])[0] || null;
    const bestSnapshot = this.extractSnapshotFromEventPayload(bestSolutionEvent?.payload);
    const latestEvent = (runRecord.events || [])[0] || null;
    const latestSnapshot = this.extractSnapshotFromEventPayload(latestEvent?.payload);
    const history = this.buildHistory(runRecord.events || []);
    const bestSolutionFeatures = bestSnapshot.solutionFeatures || runRecord.solutionFeatures || [];
    const bestRclFeatures = bestSnapshot.rclfeatures
      || bestSnapshot.rclFeatures
      || latestSnapshot.rclfeatures
      || latestSnapshot.rclFeatures
      || runRecord.rclFeatures
      || [];

    return {
      seedId: runRecord.seedId,
      createdAt: runRecord.createdAt.toISOString(),
      updatedAt: runRecord.updatedAt.toISOString(),
      completedAt: runRecord.completedAt ? runRecord.completedAt.toISOString() : null,
      status: runRecord.status.toLowerCase(),
      stage: runRecord.stage,
      topic: runRecord.topic,
      rclAlgorithm: bestSnapshot.rclAlgorithm || runRecord.rclAlgorithm,
      classifier: bestSnapshot.classifier || bestSnapshot.classfier || runRecord.classifier,
      localSearch: bestSnapshot.localSearch || runRecord.localSearch,
      neighborhood: bestSnapshot.neighborhood || runRecord.neighborhood,
      trainingFileName: bestSnapshot.trainingFileName || runRecord.trainingFileName,
      testingFileName: bestSnapshot.testingFileName || runRecord.testingFileName,
      iterationNeighborhood: runRecord.iterationNeighborhood ?? bestSnapshot.iterationNeighborhood ?? latestSnapshot.iterationNeighborhood,
      iterationLocalSearch: runRecord.iterationLocalSearch ?? bestSnapshot.iterationLocalSearch ?? latestSnapshot.iterationLocalSearch,
      currentF1Score: runRecord.currentF1Score,
      bestF1Score: runRecord.bestF1Score,
      accuracy: bestSnapshot.accuracy ?? runRecord.accuracy,
      precision: bestSnapshot.precision ?? runRecord.precision,
      recall: bestSnapshot.recall ?? runRecord.recall,
      cpuUsage: runRecord.cpuUsage,
      memoryUsage: runRecord.memoryUsage,
      memoryUsagePercent: runRecord.memoryUsagePercent,
      monitorSchemaVersion: MONITOR_SCHEMA_VERSION,
      runnigTime: bestSnapshot.runnigTime ?? bestSnapshot.runningTime ?? runRecord.runningTime,
      solutionFeatures: bestSolutionFeatures,
      rclfeatures: bestRclFeatures,
      rclFeatures: bestRclFeatures,
      enabledLocalSearches: bestSnapshot.enabledLocalSearches || latestSnapshot.enabledLocalSearches || [],
      neighborhoodMaxIterations: bestSnapshot.neighborhoodMaxIterations ?? latestSnapshot.neighborhoodMaxIterations ?? null,
      bitFlipMaxIterations: bestSnapshot.bitFlipMaxIterations ?? latestSnapshot.bitFlipMaxIterations ?? null,
      iwssMaxIterations: bestSnapshot.iwssMaxIterations ?? latestSnapshot.iwssMaxIterations ?? null,
      iwssrMaxIterations: bestSnapshot.iwssrMaxIterations ?? latestSnapshot.iwssrMaxIterations ?? null,
      solutionSize: bestSnapshot.solutionSize ?? bestSolutionFeatures.length,
      rclSize: bestSnapshot.rclSize ?? bestRclFeatures.length,
      previousBestF1Score: bestSnapshot.previousBestF1Score ?? latestSnapshot.previousBestF1Score ?? null,
      scoreDelta: bestSnapshot.scoreDelta ?? latestSnapshot.scoreDelta ?? null,
      improved: bestSnapshot.improved ?? latestSnapshot.improved ?? null,
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
      schemaVersion: MONITOR_SCHEMA_VERSION,
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
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return events.map((event) => this.mapEvent(event));
  }

  async resetMonitorState() {
    await prisma.$transaction([
      prisma.graspExecutionEvent.deleteMany({}),
      prisma.graspExecutionRun.deleteMany({}),
      prisma.graspExecutionLaunch.deleteMany({}),
    ]);
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
