import {
  buildDashboardExportFileName,
  buildDashboardExportPayload,
  buildMonitorSnapshotsCsv,
} from "./graspDashboardExport";

describe("graspDashboardExport", () => {
  it("builds a csv with headers and flattened values", () => {
    const csv = buildMonitorSnapshotsCsv([
      {
        timestamp: "2026-03-23T12:00:00.000Z",
        topic: "BEST_SOLUTION_TOPIC",
        stage: "best_solution",
        status: "completed",
        rclAlgorithm: "IG",
        localSearch: "IWSSR",
        neighborhood: "VND",
        currentF1Score: 95.5,
        bestF1Score: 96.1,
        previousBestF1Score: 94.4,
        scoreDelta: 1.7,
        seedId: "seed-1",
        requestId: "req-1",
        trainingFileName: "train.arff",
        testingFileName: "test.arff",
        solutionFeatures: ["1", "2", "3"],
        rclFeatures: ["7", "8"],
        cpuUsage: 40.2,
        memoryUsage: 256,
        memoryUsagePercent: 66.7,
      },
    ]);

    expect(csv).toContain("timestamp,topic,stage,status,algorithm");
    expect(csv).toContain("BEST_SOLUTION_TOPIC");
    expect(csv).toContain("1 | 2 | 3");
  });

  it("builds a structured payload with summary counts", () => {
    const payload = buildDashboardExportPayload({
      filters: { algorithm: "IG", timeWindow: "24h" },
      runs: [{ seedId: "seed-1", requestId: "req-1" }, { seedId: "seed-2", requestId: "req-1" }],
      snapshots: [{ seedId: "seed-1", requestId: "req-1" }, { seedId: "seed-3", requestId: "req-2" }],
      request: { requestId: "req-1" },
      events: [{ requestId: "req-1" }],
      generatedAt: "2026-03-23T12:00:00.000Z",
    });

    expect(payload.summary).toEqual({
      runs: 2,
      snapshots: 2,
      uniqueSeeds: 3,
      uniqueRequests: 2,
    });
    expect(payload.filters.algorithm).toBe("IG");
    expect(payload.request.requestId).toBe("req-1");
    expect(payload.events).toHaveLength(1);
    expect(payload.generatedAt).toBe("2026-03-23T12:00:00.000Z");
  });

  it("includes scope, request and seed in export filenames when available", () => {
    const fileName = buildDashboardExportFileName("run-history", {
      exportScope: "run",
      algorithm: "IG",
      dataset: "ereno1k",
      timelineWindow: "custom",
      requestId: "request-1234567890abcdef",
      seedId: "12345678-1234-1234-1234-123456789abc",
    });

    expect(fileName).toContain("run-history-run-ig-ereno1k-custom-request-1234567890-12345678-123");
  });
});
