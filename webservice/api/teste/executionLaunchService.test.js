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

const buildEvent = (seedId, topic, createdAt, payload = {}) => ({
  seedId,
  topic,
  createdAt: new Date(createdAt),
  payload: { payload },
});

describe("ExecutionLaunchService", () => {
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
});
