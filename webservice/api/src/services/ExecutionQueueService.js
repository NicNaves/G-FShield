const executionLaunchService = require("./ExecutionLaunchService");
const graspGatewayService = require("./GraspGatewayService");
const logger = require("../utils/jsonLogger");

class ExecutionQueueService {
  constructor() {
    this.started = false;
    this.processing = false;
    this.pendingQueue = [];
    this.activeQueue = new Map();
    this.concurrency = Math.max(Number(process.env.GRASP_EXECUTION_QUEUE_CONCURRENCY || 1), 1);
    this.completionPollIntervalMs = Math.max(
      Number(process.env.GRASP_EXECUTION_QUEUE_COMPLETION_POLL_MS || 5000),
      250
    );
    this.resetVersion = 0;
  }

  async start() {
    if (this.started) {
      return;
    }

    const pendingLaunches = await executionLaunchService.listPendingQueuedLaunches(100);
    this.pendingQueue = pendingLaunches.map((launch) => ({
      requestId: launch.requestId,
      preparedExecution: {
        requestId: launch.requestId,
        requestedAt: launch.requestedAt,
        algorithms: launch.algorithms,
        params: launch.params,
      },
      requestedById: launch.requestedBy?.id || null,
      cancelRequested: false,
    }));
    this.started = true;
    this.scheduleProcessing();
  }

  scheduleProcessing() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    setImmediate(async () => {
      try {
        await this.processQueue();
      } finally {
        this.processing = false;
      }
    });
  }

  async processQueue() {
    while (this.activeQueue.size < this.concurrency && this.pendingQueue.length > 0) {
      const nextItem = this.pendingQueue.shift();
      if (!nextItem || nextItem.cancelRequested) {
        continue;
      }

      this.runExecution(nextItem).catch((error) => {
        logger.error("Falha ao processar item da fila de execucao", {
          requestId: nextItem.requestId,
          error: error.message,
        });
      });
    }
  }

  async enqueueExecution(payload, requestedBy = null) {
    await this.start();

    const preparedExecution = graspGatewayService.prepareExecution(payload);
    const requestedById = requestedBy?.id || null;
    const launch = await executionLaunchService.createQueuedLaunch(preparedExecution, requestedById, {
      queueState: "queued",
      queueRequestedAt: preparedExecution.requestedAt,
      params: preparedExecution.params,
      algorithms: preparedExecution.algorithms,
      executions: [],
      dispatchCount: 0,
      cancelRequested: false,
    });

    this.pendingQueue.push({
      requestId: preparedExecution.requestId,
      preparedExecution,
      requestedById,
      cancelRequested: false,
    });

    this.scheduleProcessing();
    return launch;
  }

  async cancelExecution(requestId) {
    await this.start();

    const queuedIndex = this.pendingQueue.findIndex((item) => item.requestId === requestId);
    if (queuedIndex >= 0) {
      this.pendingQueue.splice(queuedIndex, 1);
      return executionLaunchService.updateLaunch(requestId, {
        status: "FAILED",
        metadataPatch: {
          queueState: "cancelled",
          cancelledAt: new Date().toISOString(),
          cancelRequested: false,
          note: "Cancelled before dispatch.",
        },
      });
    }

    const activeItem = this.activeQueue.get(requestId);
    if (activeItem?.stage === "dispatching") {
      activeItem.cancelRequested = true;
      return executionLaunchService.updateLaunch(requestId, {
        metadataPatch: {
          queueState: "cancelling",
          cancelRequested: true,
          cancelRequestedAt: new Date().toISOString(),
          note: "Cancellation requested while dispatching.",
        },
      });
    }

    const launch = await executionLaunchService.getLaunch(requestId);
    if (!launch) {
      throw new Error("Execution launch not found.");
    }

    return launch;
  }

  async listLaunches(limit = 50) {
    await this.start();
    return executionLaunchService.listLaunches(limit);
  }

  async getLaunch(requestId) {
    await this.start();
    return executionLaunchService.getLaunch(requestId);
  }

  async reset() {
    this.resetVersion += 1;
    for (const item of this.activeQueue.values()) {
      item.cancelRequested = true;
      item.cancelReason = "system-reset";
    }
    this.pendingQueue = [];
    this.activeQueue.clear();
  }

  async runExecution(queueItem) {
    const runVersion = this.resetVersion;
    queueItem.stage = "dispatching";
    this.activeQueue.set(queueItem.requestId, queueItem);

    try {
      if (this.isStaleRun(runVersion)) {
        return;
      }

      await executionLaunchService.updateLaunch(queueItem.requestId, {
        status: "RUNNING",
        metadataPatch: {
          queueState: "dispatching",
          startedAt: new Date().toISOString(),
          cancelRequested: false,
          note: "Dispatching execution to the selected RCL services.",
        },
      });

      const dispatchResult = await graspGatewayService.dispatchExecution(queueItem.preparedExecution, {
        shouldCancel: () => queueItem.cancelRequested || this.isStaleRun(runVersion),
        afterDispatch: async (execution, executions) => {
          if (this.isStaleRun(runVersion)) {
            return;
          }

          await executionLaunchService.updateLaunch(queueItem.requestId, {
            status: "RUNNING",
            metadataPatch: {
              queueState: queueItem.cancelRequested ? "cancelling" : "dispatching",
              lastDispatchAt: execution.dispatchedAt,
              lastDispatchedAlgorithm: execution.algorithm,
              executions,
              dispatchCount: executions.length,
            },
          });
        },
      });

      if (this.isStaleRun(runVersion)) {
        logger.warn("Discarding stale queue execution after environment reset", {
          requestId: queueItem.requestId,
        });
        return;
      }

      if (queueItem.cancelRequested && dispatchResult.executions.length < queueItem.preparedExecution.algorithms.length) {
        await executionLaunchService.updateLaunch(queueItem.requestId, {
          status: "FAILED",
          metadataPatch: {
            queueState: "cancelled",
            cancelledAt: new Date().toISOString(),
            executions: dispatchResult.executions,
            dispatchCount: dispatchResult.executions.length,
            partialDispatch: dispatchResult.executions.length > 0,
            note: "Dispatch cancelled before all algorithms were submitted.",
          },
        });
        return;
      }

      await executionLaunchService.updateLaunch(queueItem.requestId, {
        status: "RUNNING",
        metadataPatch: {
          queueState: "dispatched",
          dispatchedAt: new Date().toISOString(),
          executions: dispatchResult.executions,
          dispatchCount: dispatchResult.executions.length,
          expectedSeedCount: dispatchResult.executions.length * Number(queueItem.preparedExecution.params?.maxGenerations || 0),
          note: "All selected algorithms were submitted. Waiting for all generated seeds to finish the distributed pipeline.",
        },
      });

      queueItem.stage = "monitoring";
      await this.waitForCompletion(queueItem, runVersion);
    } catch (error) {
      if (this.isStaleRun(runVersion)) {
        logger.warn("Ignoring queue execution failure after environment reset", {
          requestId: queueItem.requestId,
          error: error.message,
        });
        return;
      }

      await executionLaunchService.updateLaunch(queueItem.requestId, {
        status: "FAILED",
        metadataPatch: {
          queueState: queueItem.cancelRequested ? "cancelled" : "failed",
          cancelledAt: queueItem.cancelRequested ? new Date().toISOString() : null,
          error: error.message,
          note: queueItem.cancelRequested
            ? "Execution cancelled while dispatch was in progress."
            : "Execution dispatch failed.",
        },
      });
      logger.error("Falha ao despachar execucao da fila", {
        requestId: queueItem.requestId,
        error: error.message,
      });
    } finally {
      if (!this.isStaleRun(runVersion)) {
        this.activeQueue.delete(queueItem.requestId);
        this.scheduleProcessing();
      }
    }
  }

  isStaleRun(runVersion) {
    return runVersion !== this.resetVersion;
  }

  async waitForCompletion(queueItem, runVersion) {
    while (!this.isStaleRun(runVersion)) {
      const launch = await executionLaunchService.getLaunch(queueItem.requestId);
      const status = String(launch?.status || "").toUpperCase();
      const queueState = String(launch?.queueState || "").toLowerCase();

      if (status === "COMPLETED" || status === "FAILED" || queueState === "cancelled" || queueState === "failed") {
        return launch;
      }

      await this.sleep(this.completionPollIntervalMs);
    }

    return null;
  }

  async sleep(durationMs) {
    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
  }
}

module.exports = new ExecutionQueueService();
