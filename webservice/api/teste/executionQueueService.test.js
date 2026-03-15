jest.mock("../src/services/ExecutionLaunchService", () => ({
  listPendingQueuedLaunches: jest.fn().mockResolvedValue([]),
  createQueuedLaunch: jest.fn(),
  updateLaunch: jest.fn().mockImplementation(async (requestId, updates = {}) => ({
    requestId,
    status: String(updates.status || "RUNNING").toLowerCase(),
    queueState: updates.metadataPatch?.queueState || "queued",
  })),
  getLaunch: jest.fn(),
}));

jest.mock("../src/services/GraspGatewayService", () => ({
  prepareExecution: jest.fn(),
  dispatchExecution: jest.fn(),
}));

jest.mock("../src/utils/jsonLogger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const executionLaunchService = require("../src/services/ExecutionLaunchService");
const graspGatewayService = require("../src/services/GraspGatewayService");
const executionQueueService = require("../src/services/ExecutionQueueService");

describe("ExecutionQueueService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executionQueueService.started = false;
    executionQueueService.processing = false;
    executionQueueService.pendingQueue = [];
    executionQueueService.activeQueue.clear();
    executionQueueService.resetVersion = 0;
    executionQueueService.concurrency = 1;
    executionQueueService.completionPollIntervalMs = 1;
  });

  test("only dispatches the next execution after the previous one is completed", async () => {
    const dispatchedRequestIds = [];
    const launchStates = {
      "req-1": [
        { requestId: "req-1", status: "running", queueState: "dispatched" },
        { requestId: "req-1", status: "running", queueState: "dispatched" },
        { requestId: "req-1", status: "completed", queueState: "dispatched" },
      ],
      "req-2": [
        { requestId: "req-2", status: "completed", queueState: "dispatched" },
      ],
    };

    graspGatewayService.prepareExecution
      .mockImplementationOnce((payload) => ({
        requestId: "req-1",
        requestedAt: "2026-03-15T00:00:00.000Z",
        algorithms: payload.algorithms,
        params: payload,
      }))
      .mockImplementationOnce((payload) => ({
        requestId: "req-2",
        requestedAt: "2026-03-15T00:00:01.000Z",
        algorithms: payload.algorithms,
        params: payload,
      }));

    executionLaunchService.createQueuedLaunch.mockImplementation(async (preparedExecution) => ({
      requestId: preparedExecution.requestId,
      status: "requested",
      queueState: "queued",
    }));

    graspGatewayService.dispatchExecution.mockImplementation(async (preparedExecution) => {
      dispatchedRequestIds.push(preparedExecution.requestId);
      return {
        executions: preparedExecution.algorithms.map((algorithm, index) => ({
          algorithm,
          dispatchedAt: `2026-03-15T00:00:0${index}.000Z`,
        })),
      };
    });

    executionLaunchService.getLaunch.mockImplementation(async (requestId) => {
      const states = launchStates[requestId] || [];
      return states.length > 1 ? states.shift() : states[0] || null;
    });

    await executionQueueService.enqueueExecution({
      algorithms: ["GA"],
      maxGenerations: 3,
    });
    await executionQueueService.enqueueExecution({
      algorithms: ["GRASP"],
      maxGenerations: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(dispatchedRequestIds).toEqual(["req-1", "req-2"]);
    expect(executionLaunchService.getLaunch).toHaveBeenCalledWith("req-1");
    expect(executionLaunchService.getLaunch).toHaveBeenCalledWith("req-2");
    expect(graspGatewayService.dispatchExecution.mock.calls[1][0].requestId).toBe("req-2");
  });

  test("does not mark a monitoring execution as cancellable dispatch work", async () => {
    executionLaunchService.getLaunch.mockResolvedValue({
      requestId: "req-1",
      status: "running",
      queueState: "dispatched",
    });

    executionQueueService.started = true;
    executionQueueService.activeQueue.set("req-1", {
      requestId: "req-1",
      stage: "monitoring",
      cancelRequested: false,
    });

    await executionQueueService.cancelExecution("req-1");

    expect(executionLaunchService.updateLaunch).not.toHaveBeenCalled();
    expect(executionQueueService.activeQueue.get("req-1").cancelRequested).toBe(false);
  });
});
