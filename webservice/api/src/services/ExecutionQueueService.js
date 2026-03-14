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
    if (activeItem) {
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
    this.pendingQueue = [];
    this.activeQueue.clear();
  }

  async runExecution(queueItem) {
    this.activeQueue.set(queueItem.requestId, queueItem);

    try {
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
        shouldCancel: () => queueItem.cancelRequested,
        afterDispatch: async (execution, executions) => {
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
        status: "COMPLETED",
        metadataPatch: {
          queueState: "dispatched",
          dispatchedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          executions: dispatchResult.executions,
          dispatchCount: dispatchResult.executions.length,
          note: "All selected algorithms were submitted to the distributed pipeline.",
        },
      });
    } catch (error) {
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
      this.activeQueue.delete(queueItem.requestId);
      this.scheduleProcessing();
    }
  }
}

module.exports = new ExecutionQueueService();
