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

    return this.mapLaunch(launch);
  }

  async listLaunches(limit = 50) {
    const launches = await prisma.graspExecutionLaunch.findMany({
      orderBy: { requestedAt: "desc" },
      take: limit,
      include: {
        requestedBy: true,
      },
    });

    const queuedLaunches = launches
      .filter((launch) => (launch.metadata?.queueState || "").toLowerCase() === "queued")
      .sort((left, right) => new Date(left.requestedAt) - new Date(right.requestedAt));
    const queuedPositionById = new Map(
      queuedLaunches.map((launch, index) => [launch.requestId, index + 1])
    );

    return launches.map((launch) => this.mapLaunch(launch, queuedPositionById.get(launch.requestId) || null));
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
