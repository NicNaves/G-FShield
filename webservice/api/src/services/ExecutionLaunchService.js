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
        status: true,
        topic: true,
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
    const completedSeedCount = uniqueRuns.filter((run) =>
      String(run.topic || "").toUpperCase() === "BEST_SOLUTION_TOPIC"
      || String(run.status || "").toUpperCase() === "COMPLETED"
    ).length;

    const timestamps = uniqueRuns
      .flatMap((run) => [run.createdAt, run.updatedAt, run.completedAt])
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
      observedSeedCount: uniqueRuns.length,
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
          completedAt: metadata.completedAt || progress.lastResultAt || new Date().toISOString(),
          note: "Distributed pipeline finished all expected seeds for this execution.",
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
    const launch = await prisma.graspExecutionLaunch.upsert({
      where: { requestId: preparedExecution.requestId },
      update: this.buildLaunchData(preparedExecution, requestedById, metadata, "REQUESTED"),
      create: {
        requestId: preparedExecution.requestId,
        ...this.buildLaunchData(preparedExecution, requestedById, metadata, "REQUESTED"),
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

    const launch = await prisma.graspExecutionLaunch.update({
      where: { requestId },
      data: {
        ...(updates.status ? { status: this.normalizeStatus(updates.status, existing.status) } : {}),
        ...(updates.requestedById !== undefined ? { requestedById: updates.requestedById } : {}),
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
