jest.mock("../src/lib/prisma", () => ({
  graspExecutionRun: {
    findMany: jest.fn(),
  },
  graspExecutionEvent: {
    findMany: jest.fn(),
  },
  graspExecutionLaunch: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
}));

const executionLaunchService = require("../src/services/ExecutionLaunchService");
const prisma = require("../src/lib/prisma");

const buildEvent = (seedId, topic, createdAt, payload = {}) => ({
  seedId,
  topic,
  createdAt: new Date(createdAt),
  payload: { payload },
});

describe("ExecutionLaunchService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("does not complete a seed when a best solution is followed by a neighborhood restart", () => {
    const lifecycle = executionLaunchService.summarizeSeedLifecycle([
      buildEvent("seed-1", "INITIAL_SOLUTION_TOPIC", "2026-03-19T10:00:00.000Z"),
      buildEvent("seed-1", "SOLUTIONS_TOPIC", "2026-03-19T10:01:00.000Z", {
        neighborhood: "VND",
        iterationNeighborhood: 1,
        neighborhoodMaxIterations: 2,
        enabledLocalSearches: ["BIT_FLIP", "IWSS"],
      }),
      buildEvent("seed-1", "BEST_SOLUTION_TOPIC", "2026-03-19T10:01:05.000Z"),
      buildEvent("seed-1", "NEIGHBORHOOD_RESTART_TOPIC", "2026-03-19T10:01:10.000Z"),
    ]);

    expect(lifecycle).toEqual({
      completed: false,
      terminalEventAt: null,
    });
  });

  test("keeps a seed completed when a late best solution arrives after the terminal solution", () => {
    const lifecycle = executionLaunchService.summarizeSeedLifecycle([
      buildEvent("seed-2", "INITIAL_SOLUTION_TOPIC", "2026-03-19T10:00:00.000Z"),
      buildEvent("seed-2", "SOLUTIONS_TOPIC", "2026-03-19T10:02:00.000Z", {
        neighborhood: "RVND",
        iterationNeighborhood: 3,
        neighborhoodMaxIterations: 3,
      }),
      buildEvent("seed-2", "BEST_SOLUTION_TOPIC", "2026-03-19T10:02:02.000Z"),
    ]);

    expect(lifecycle).toEqual({
      completed: true,
      terminalEventAt: "2026-03-19T10:02:00.000Z",
    });
  });

  test("reopens a seed if processing events appear after a terminal solution snapshot", () => {
    const lifecycle = executionLaunchService.summarizeSeedLifecycle([
      buildEvent("seed-3", "SOLUTIONS_TOPIC", "2026-03-19T10:00:00.000Z", {
        neighborhood: "RVND",
        iterationNeighborhood: 3,
        neighborhoodMaxIterations: 3,
      }),
      buildEvent("seed-3", "LOCAL_SEARCH_PROGRESS_TOPIC", "2026-03-19T10:00:05.000Z"),
      buildEvent("seed-3", "SOLUTIONS_TOPIC", "2026-03-19T10:00:10.000Z", {
        neighborhood: "RVND",
        iterationNeighborhood: 2,
        neighborhoodMaxIterations: 3,
      }),
    ]);

    expect(lifecycle).toEqual({
      completed: false,
      terminalEventAt: null,
    });
  });

  test("keeps a seed completed when a completed progress snapshot arrives after the terminal solution", () => {
    const lifecycle = executionLaunchService.summarizeSeedLifecycle([
      buildEvent("seed-4", "SOLUTIONS_TOPIC", "2026-03-19T10:00:00.000Z", {
        neighborhood: "VND",
        iterationNeighborhood: 3,
        neighborhoodMaxIterations: 1,
        enabledLocalSearches: ["BIT_FLIP", "IWSS", "IWSSR"],
        status: "completed",
      }),
      buildEvent("seed-4", "LOCAL_SEARCH_PROGRESS_TOPIC", "2026-03-19T10:00:01.000Z", {
        neighborhood: "VND",
        iterationNeighborhood: 3,
        localSearch: "BIT_FLIP",
        status: "completed",
      }),
      buildEvent("seed-4", "BEST_SOLUTION_TOPIC", "2026-03-19T10:00:02.000Z", {
        neighborhood: "VND",
        iterationNeighborhood: 3,
        status: "completed",
      }),
    ]);

    expect(lifecycle).toEqual({
      completed: true,
      terminalEventAt: "2026-03-19T10:00:00.000Z",
    });
  });

  test("builds a request monitor bundle with every run and mapped request events", async () => {
    prisma.graspExecutionRun.findMany.mockResolvedValue([
      {
        seedId: "seed-1",
        createdAt: new Date("2026-03-22T10:00:00.000Z"),
        updatedAt: new Date("2026-03-22T10:05:00.000Z"),
        completedAt: new Date("2026-03-22T10:06:00.000Z"),
        status: "COMPLETED",
        stage: "best_solution",
        topic: "BEST_SOLUTION_TOPIC",
        rclAlgorithm: "IG",
        classifier: "J48",
        localSearch: "IWSSR",
        neighborhood: "VND",
        trainingFileName: "train.arff",
        testingFileName: "test.arff",
        iterationNeighborhood: 3,
        iterationLocalSearch: 8,
        currentF1Score: 96.4,
        bestF1Score: 96.4,
        accuracy: 95.1,
        precision: 94.7,
        recall: 96.8,
        cpuUsage: 25.4,
        memoryUsage: 512,
        memoryUsagePercent: 44.3,
        runningTime: "00:12:31",
        solutionFeatures: ["1", "4", "7"],
        rclFeatures: ["1", "2", "4", "7"],
        updates: 12,
        events: [
          {
            createdAt: new Date("2026-03-22T10:05:00.000Z"),
            topic: "LOCAL_SEARCH_PROGRESS_TOPIC",
            stage: "iwssr",
            eventType: "kafka.progress",
            requestId: "req-1",
            payload: {
              payload: {
                requestId: "req-1",
                localSearch: "IWSSR",
                currentF1Score: 96.4,
                historyEntry: {
                  stage: "iwssr",
                  topic: "LOCAL_SEARCH_PROGRESS_TOPIC",
                  f1Score: 96.4,
                },
              },
            },
          },
        ],
      },
    ]);

    prisma.graspExecutionEvent.findMany
      .mockResolvedValueOnce([
        {
          seedId: "seed-1",
          topic: "BEST_SOLUTION_TOPIC",
          createdAt: new Date("2026-03-22T10:06:00.000Z"),
          requestId: "req-1",
          payload: {
            payload: {
              requestId: "req-1",
              rclAlgorithm: "IG",
              classifier: "J48",
              solutionFeatures: ["1", "4", "7"],
              rclFeatures: ["1", "2", "4", "7"],
              currentF1Score: 96.4,
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          fingerprint: "gateway:req-1",
          createdAt: new Date("2026-03-22T09:59:59.000Z"),
          eventType: "gateway.dispatch",
          topic: "API_GATEWAY",
          stage: null,
          status: "REQUESTED",
          seedId: null,
          requestId: "req-1",
          sourcePartition: null,
          sourceOffset: null,
          payload: {
            requestId: "req-1",
            algorithms: ["IG"],
          },
        },
      ]);

    const bundle = await executionLaunchService.buildLaunchMonitorBundle({
      id: 12,
      requestId: "req-1",
      requestedAt: new Date("2026-03-22T09:59:00.000Z"),
      algorithms: ["IG"],
      datasetTrainingName: "train.arff",
      datasetTestingName: "test.arff",
      classifier: "J48",
      metadata: {
        startedAt: "2026-03-22T10:00:00.000Z",
      },
    });

    expect(bundle.requestId).toBe("req-1");
    expect(bundle.runCount).toBe(1);
    expect(bundle.eventCount).toBe(1);
    expect(bundle.runs[0].seedId).toBe("seed-1");
    expect(bundle.runs[0].requestId).toBe("req-1");
    expect(bundle.runs[0].history[0].requestId).toBe("req-1");
    expect(bundle.events[0].requestId).toBe("req-1");
  });
});
