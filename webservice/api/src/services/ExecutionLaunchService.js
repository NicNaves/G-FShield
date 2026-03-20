const prisma = require("../lib/prisma");

class ExecutionLaunchService {
  normalizeStatus(status, fallback = "REQUESTED") {
    const allowed = new Set(["REQUESTED", "RUNNING", "COMPLETED", "FAILED"]);
    const normalized = String(status || fallback).trim().toUpperCase();
    return allowed.has(normalized) ? normalized : fallback;
  }

  parseDate(value) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  mergeMetadata(currentMetadata = {}, metadataPatch = {}) {
    return {
      ...(currentMetadata && typeof currentMetadata === "object" ? currentMetadata : {}),
      ...(metadataPatch && typeof metadataPatch === "object" ? metadataPatch : {}),
    };
  }

  resolveLaunchStartedAt(record) {
    return this.parseDate(record?.metadata?.startedAt || record?.metadata?.dispatchedAt || null);
  }

  buildExpectedSeedCount(record) {
    const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
    const metadataValue = Number(metadata.expectedSeedCount);
    if (Number.isFinite(metadataValue) && metadataValue > 0) {
      return metadataValue;
    }

    const algorithmCount = Array.isArray(record?.algorithms) ? record.algorithms.filter(Boolean).length : 0;
    const maxGenerations = Number(record?.maxGenerations || metadata?.params?.maxGenerations || 0);
    return Math.max(algorithmCount * maxGenerations, 0);
  }

  numberOrNull(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  cloneList(value, fallback = []) {
    if (Array.isArray(value)) {
      return [...value];
    }

    if (Array.isArray(fallback)) {
      return [...fallback];
    }

    return [];
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

  resolveNeighborhoodCycles(snapshot = {}) {
    const configuredCycles = this.numberOrNull(snapshot.neighborhoodMaxIterations ?? null);
    return configuredCycles && configuredCycles > 0 ? configuredCycles : 1;
  }

  resolveEnabledLocalSearches(snapshot = {}) {
    const configured = this.cloneList(snapshot.enabledLocalSearches, ["BIT_FLIP", "IWSS", "IWSSR"]);
    const normalized = configured
      .map((entry) => String(entry || "").trim().toUpperCase())
      .filter(Boolean);

    return normalized.length ? [...new Set(normalized)] : ["BIT_FLIP", "IWSS", "IWSSR"];
  }

  resolveVndDispatchBudget(snapshot = {}) {
    const enabledLocalSearches = this.resolveEnabledLocalSearches(snapshot);
    const searchesPerCycle = Math.max(enabledLocalSearches.length, 1);
    const configuredCycles = this.resolveNeighborhoodCycles(snapshot);
    return Math.max(configuredCycles * searchesPerCycle, searchesPerCycle);
  }

  isTerminalSolutionEvent(event) {
    if (!event || event.topic !== "SOLUTIONS_TOPIC") {
      return false;
    }

    const snapshot = this.extractSnapshotFromEventPayload(event.payload);
    const neighborhood = String(snapshot.neighborhood || "").trim().toUpperCase();
    const iterationNeighborhood = this.numberOrNull(snapshot.iterationNeighborhood ?? null);

    if (!Number.isFinite(iterationNeighborhood)) {
      return false;
    }

    if (neighborhood === "VND") {
      return iterationNeighborhood >= this.resolveVndDispatchBudget(snapshot);
    }

    if (neighborhood === "RVND") {
      return iterationNeighborhood >= this.resolveNeighborhoodCycles(snapshot);
    }

    return false;
  }

  isCompletedSnapshot(snapshot = {}) {
    return String(snapshot.status || "").trim().toUpperCase() === "COMPLETED";
  }

  isSeedStillProcessingEvent(event) {
    if (!event) {
      return false;
    }

    const snapshot = this.extractSnapshotFromEventPayload(event.payload);

    if (event.topic === "INITIAL_SOLUTION_TOPIC" || event.topic === "NEIGHBORHOOD_RESTART_TOPIC") {
      return true;
    }

    if (event.topic === "LOCAL_SEARCH_PROGRESS_TOPIC") {
      return !this.isCompletedSnapshot(snapshot);
    }

    if (event.topic === "SOLUTIONS_TOPIC") {
      return !this.isTerminalSolutionEvent(event);
    }

    return false;
  }

  summarizeSeedLifecycle(events = []) {
    let terminalEventAt = null;

    events
      .filter((event) => event && event.seedId)
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
      .forEach((event) => {
        if (this.isTerminalSolutionEvent(event)) {
          terminalEventAt = event.createdAt;
          return;
        }

        if (this.isSeedStillProcessingEvent(event)) {
          terminalEventAt = null;
        }
      });

    return {
      completed: Boolean(terminalEventAt),
      terminalEventAt: terminalEventAt?.toISOString?.() || null,
    };
  }

  async summarizePipelineProgress(record, nextStartedLaunch = null) {
    const algorithms = Array.isArray(record?.algorithms)
      ? record.algorithms.map((algorithm) => String(algorithm).trim().toUpperCase()).filter(Boolean)
      : [];
    const startedAt = this.resolveLaunchStartedAt(record);
    const nextStartedAt = this.resolveLaunchStartedAt(nextStartedLaunch);
    const expectedSeedCount = this.buildExpectedSeedCount(record);

    if (!startedAt || algorithms.length === 0 || expectedSeedCount === 0) {
      return {
        expectedSeedCount,
        observedSeedCount: 0,
        completedSeedCount: 0,
        pendingSeedCount: expectedSeedCount,
        pipelineCompleted: false,
        firstResultAt: null,
        lastResultAt: null,
      };
    }

    const runs = await prisma.graspExecutionRun.findMany({
      where: {
        rclAlgorithm: { in: algorithms },
        ...(record.datasetTrainingName ? { trainingFileName: record.datasetTrainingName } : {}),
        ...(record.datasetTestingName ? { testingFileName: record.datasetTestingName } : {}),
        ...(record.classifier ? { classifier: record.classifier } : {}),
        createdAt: {
          gte: startedAt,
          ...(nextStartedAt ? { lt: nextStartedAt } : {}),
        },
      },
      select: {
        seedId: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });

    const latestRunBySeed = new Map();
    runs.forEach((run) => {
      const current = latestRunBySeed.get(run.seedId);
      const currentTimestamp = new Date(
        current?.completedAt || current?.updatedAt || current?.createdAt || 0
      ).getTime();
      const nextTimestamp = new Date(
        run.completedAt || run.updatedAt || run.createdAt || 0
      ).getTime();

      if (!current || nextTimestamp >= currentTimestamp) {
        latestRunBySeed.set(run.seedId, run);
      }
    });

    const uniqueRuns = [...latestRunBySeed.values()];
    const observedSeedCount = uniqueRuns.length;
    const seedIds = uniqueRuns.map((run) => run.seedId).filter(Boolean);
    const events = seedIds.length > 0
      ? await prisma.graspExecutionEvent.findMany({
          where: {
            seedId: { in: seedIds },
            eventType: { in: ["kafka.update", "kafka.progress"] },
            createdAt: {
              gte: startedAt,
              ...(nextStartedAt ? { lt: nextStartedAt } : {}),
            },
          },
          orderBy: { createdAt: "asc" },
          select: {
            seedId: true,
            topic: true,
            createdAt: true,
            payload: true,
          },
        })
      : [];

    const eventsBySeed = new Map();
    events.forEach((event) => {
      if (!event.seedId) {
        return;
      }

      const currentSeedEvents = eventsBySeed.get(event.seedId) || [];
      currentSeedEvents.push(event);
      eventsBySeed.set(event.seedId, currentSeedEvents);
    });

    const completedSeedCount = seedIds.reduce((count, seedId) => {
      const lifecycle = this.summarizeSeedLifecycle(eventsBySeed.get(seedId) || []);
      return lifecycle.completed ? count + 1 : count;
    }, 0);

    const timestamps = (events.length > 0 ? events.map((event) => event.createdAt) : uniqueRuns
      .flatMap((run) => [run.createdAt, run.updatedAt, run.completedAt]))
      .filter(Boolean)
      .map((value) => new Date(value));

    const firstResultAt = timestamps.length > 0
      ? new Date(Math.min(...timestamps.map((value) => value.getTime())))
      : null;
    const lastResultAt = timestamps.length > 0
      ? new Date(Math.max(...timestamps.map((value) => value.getTime())))
      : null;

    return {
      expectedSeedCount,
      observedSeedCount,
      completedSeedCount,
      pendingSeedCount: Math.max(expectedSeedCount - completedSeedCount, 0),
      pipelineCompleted: expectedSeedCount > 0 && completedSeedCount >= expectedSeedCount,
      firstResultAt: firstResultAt?.toISOString?.() || null,
      lastResultAt: lastResultAt?.toISOString?.() || null,
    };
  }

  async enrichLaunchRecord(record, nextStartedLaunch = null) {
    const metadata = record?.metadata && typeof record.metadata === "object" ? record.metadata : {};
    const queueState = String(metadata.queueState || record.status || "").toLowerCase();
    const terminalQueueState = new Set(["cancelled", "failed"]);
    const progress = await this.summarizePipelineProgress(record, nextStartedLaunch);
    const nextMetadata = this.mergeMetadata(metadata, progress);

    if (terminalQueueState.has(queueState)) {
      return {
        ...record,
        metadata: nextMetadata,
      };
    }

    if (progress.pipelineCompleted) {
      return {
        ...record,
        status: "COMPLETED",
        metadata: this.mergeMetadata(nextMetadata, {
          queueState: "completed",
          completedAt: metadata.completedAt || progress.lastResultAt || new Date().toISOString(),
          note: "Distributed pipeline reached a terminal local-search result for every expected seed.",
        }),
      };
    }

    if (queueState === "dispatched" || queueState === "dispatching" || progress.observedSeedCount > 0) {
      return {
        ...record,
        status: "RUNNING",
        metadata: this.mergeMetadata(nextMetadata, {
          completedAt: null,
          note:
            progress.observedSeedCount > 0
              ? "Distributed pipeline is still processing generated seeds."
              : "Algorithms dispatched. Waiting for the first generated seeds.",
        }),
      };
    }

    return {
      ...record,
      metadata: nextMetadata,
    };
  }

  async enrichLaunchRecords(records = []) {
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    const chronological = [...records].sort((left, right) => new Date(left.requestedAt) - new Date(right.requestedAt));
    const nextStartedLaunchById = new Map();
    let nextStartedLaunch = null;

    for (let index = chronological.length - 1; index >= 0; index -= 1) {
      const record = chronological[index];
      nextStartedLaunchById.set(record.id, nextStartedLaunch);

      if (this.resolveLaunchStartedAt(record)) {
        nextStartedLaunch = record;
      }
    }

    return Promise.all(
      records.map((record) => this.enrichLaunchRecord(record, nextStartedLaunchById.get(record.id) || null))
    );
  }

  async findNextStartedLaunch(record) {
    const candidates = await prisma.graspExecutionLaunch.findMany({
      where: {
        requestedAt: {
          gt: record.requestedAt,
        },
      },
      orderBy: {
        requestedAt: "asc",
      },
      take: 50,
    });

    return candidates.find((candidate) => this.resolveLaunchStartedAt(candidate)) || null;
  }

  buildLaunchData(preparedExecution, requestedById = null, metadata = {}, status = "REQUESTED") {
    return {
      status: this.normalizeStatus(status),
      algorithms: preparedExecution.algorithms || [],
      maxGenerations: Number(preparedExecution.params?.maxGenerations || 0),
      rclCutoff: Number(preparedExecution.params?.rclCutoff || 0),
      sampleSize: Number(preparedExecution.params?.sampleSize || 0),
      datasetTrainingName: preparedExecution.params?.datasetTrainingName || "",
      datasetTestingName: preparedExecution.params?.datasetTestingName || "",
      classifier: preparedExecution.params?.classifier || "J48",
      requestedAt: this.parseDate(preparedExecution.requestedAt) || new Date(),
      requestedById: requestedById || null,
      metadata: {
        params: preparedExecution.params || {},
        queueState: "queued",
        queueRequestedAt: preparedExecution.requestedAt || new Date().toISOString(),
        executions: [],
        dispatchCount: 0,
        cancelRequested: false,
        ...metadata,
      },
    };
  }

  async ensureRequestedById(requestedById = null) {
    const normalizedId = Number(requestedById);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: normalizedId },
      select: { id: true },
    });

    return user?.id || null;
  }

  mapLaunch(record, queuePosition = null) {
    const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
    const queueState = metadata.queueState || record.status.toLowerCase();

    return {
      requestId: record.requestId,
      status: String(record.status || "").toLowerCase(),
      queueState,
      queuePosition,
      requestedAt: record.requestedAt?.toISOString?.() || null,
      createdAt: record.createdAt?.toISOString?.() || null,
      updatedAt: record.updatedAt?.toISOString?.() || null,
      requestedBy: record.requestedBy
        ? {
            id: record.requestedBy.id,
            name: record.requestedBy.name,
            email: record.requestedBy.email,
            role: record.requestedBy.role,
          }
        : null,
      algorithms: record.algorithms || [],
      params: metadata.params || {
        maxGenerations: record.maxGenerations,
        rclCutoff: record.rclCutoff,
        sampleSize: record.sampleSize,
        datasetTrainingName: record.datasetTrainingName,
        datasetTestingName: record.datasetTestingName,
        classifier: record.classifier,
      },
      executions: metadata.executions || [],
      dispatchCount: metadata.dispatchCount || 0,
      queuedAt: metadata.queueRequestedAt || null,
      startedAt: metadata.startedAt || null,
      dispatchedAt: metadata.dispatchedAt || null,
      completedAt: metadata.completedAt || null,
      cancelledAt: metadata.cancelledAt || null,
      cancelRequested: Boolean(metadata.cancelRequested),
      note: metadata.note || null,
      error: metadata.error || null,
      partialDispatch: Boolean(metadata.partialDispatch),
      expectedSeedCount: Number(metadata.expectedSeedCount || 0),
      observedSeedCount: Number(metadata.observedSeedCount || 0),
      completedSeedCount: Number(metadata.completedSeedCount || 0),
      pendingSeedCount: Number(metadata.pendingSeedCount || 0),
      pipelineCompleted: Boolean(metadata.pipelineCompleted),
      firstResultAt: metadata.firstResultAt || null,
      lastResultAt: metadata.lastResultAt || null,
      canCancel: ["queued", "dispatching", "cancelling"].includes(queueState),
    };
  }

  async createQueuedLaunch(preparedExecution, requestedById = null, metadata = {}) {
    const safeRequestedById = await this.ensureRequestedById(requestedById);
    const launch = await prisma.graspExecutionLaunch.upsert({
      where: { requestId: preparedExecution.requestId },
      update: this.buildLaunchData(preparedExecution, safeRequestedById, metadata, "REQUESTED"),
      create: {
        requestId: preparedExecution.requestId,
        ...this.buildLaunchData(preparedExecution, safeRequestedById, metadata, "REQUESTED"),
      },
      include: {
        requestedBy: true,
      },
    });

    return this.mapLaunch(launch);
  }

  async updateLaunch(requestId, updates = {}) {
    const existing = await prisma.graspExecutionLaunch.findUnique({
      where: { requestId },
      include: {
        requestedBy: true,
      },
    });

    if (!existing) {
      throw new Error("Execution launch not found.");
    }

    const nextMetadata = updates.metadata
      ? updates.metadata
      : this.mergeMetadata(existing.metadata, updates.metadataPatch);
    const safeRequestedById = updates.requestedById !== undefined
      ? await this.ensureRequestedById(updates.requestedById)
      : undefined;

    const launch = await prisma.graspExecutionLaunch.update({
      where: { requestId },
      data: {
        ...(updates.status ? { status: this.normalizeStatus(updates.status, existing.status) } : {}),
        ...(safeRequestedById !== undefined ? { requestedById: safeRequestedById } : {}),
        ...(updates.algorithms ? { algorithms: updates.algorithms } : {}),
        ...(updates.params
          ? {
              maxGenerations: Number(updates.params.maxGenerations || existing.maxGenerations || 0),
              rclCutoff: Number(updates.params.rclCutoff || existing.rclCutoff || 0),
              sampleSize: Number(updates.params.sampleSize || existing.sampleSize || 0),
              datasetTrainingName: updates.params.datasetTrainingName || existing.datasetTrainingName,
              datasetTestingName: updates.params.datasetTestingName || existing.datasetTestingName,
              classifier: updates.params.classifier || existing.classifier,
            }
          : {}),
        metadata: nextMetadata,
      },
      include: {
        requestedBy: true,
      },
    });

    return this.mapLaunch(launch);
  }

  async getLaunch(requestId) {
    const launch = await prisma.graspExecutionLaunch.findUnique({
      where: { requestId },
      include: {
        requestedBy: true,
      },
    });

    if (!launch) {
      return null;
    }

    const enrichedLaunch = await this.enrichLaunchRecord(launch, await this.findNextStartedLaunch(launch));
    return this.mapLaunch(enrichedLaunch);
  }

  async listLaunches(limit = 50) {
    const launches = await prisma.graspExecutionLaunch.findMany({
      orderBy: { requestedAt: "desc" },
      take: limit,
      include: {
        requestedBy: true,
      },
    });
    const enrichedLaunches = await this.enrichLaunchRecords(launches);

    const queuedLaunches = enrichedLaunches
      .filter((launch) => (launch.metadata?.queueState || "").toLowerCase() === "queued")
      .sort((left, right) => new Date(left.requestedAt) - new Date(right.requestedAt));
    const queuedPositionById = new Map(
      queuedLaunches.map((launch, index) => [launch.requestId, index + 1])
    );

    return enrichedLaunches.map((launch) =>
      this.mapLaunch(launch, queuedPositionById.get(launch.requestId) || null)
    );
  }

  async listPendingQueuedLaunches(limit = 100) {
    const launches = await prisma.graspExecutionLaunch.findMany({
      where: {
        status: "REQUESTED",
      },
      orderBy: { requestedAt: "asc" },
      take: limit,
      include: {
        requestedBy: true,
      },
    });

    return launches
      .filter((launch) => {
        const queueState = String(launch.metadata?.queueState || "").toLowerCase();
        return queueState === "queued" || queueState === "";
      })
      .map((launch, index) => this.mapLaunch(launch, index + 1));
  }
}

module.exports = new ExecutionLaunchService();
