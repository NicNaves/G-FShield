const { graspMonitorSummaryService } = require("../src/services/GraspMonitorSummaryService");

describe("GraspMonitorSummaryService", () => {
  it("builds research-focused quality, observability, and exploration metrics", () => {
    const runs = [
      {
        seedId: "seed-1",
        requestId: "req-1",
        status: "completed",
        topic: "BEST_SOLUTION_TOPIC",
        stage: "best_solution",
        rclAlgorithm: "IG",
        localSearch: "IWSS",
        neighborhood: "VND",
        trainingFileName: "train-a.arff",
        testingFileName: "test-a.arff",
        createdAt: "2026-03-30T12:00:00.000Z",
        updatedAt: "2026-03-30T12:00:10.000Z",
        bestF1Score: 96,
        cpuUsage: 42,
        memoryUsagePercent: 61,
        solutionFeatures: ["f1", "f2"],
        rclFeatures: ["f1", "f2", "f3"],
        enabledLocalSearches: ["BIT_FLIP", "IWSS"],
        history: [
          {
            timestamp: "2026-03-30T12:00:04.000Z",
            requestId: "req-1",
            f1Score: 88,
            improved: true,
            scoreDelta: 6,
            localSearch: "BIT_FLIP",
            neighborhood: "VND",
            cpuUsage: 40,
          },
          {
            timestamp: "2026-03-30T12:00:07.000Z",
            requestId: "req-1",
            f1Score: 96,
            improved: true,
            scoreDelta: 8,
            localSearch: "IWSS",
            neighborhood: "VND",
            memoryUsagePercent: 61,
          },
        ],
      },
      {
        seedId: "seed-2",
        requestId: "req-2",
        status: "running",
        topic: "SOLUTIONS_TOPIC",
        stage: "iwssr",
        rclAlgorithm: "RF",
        localSearch: "IWSSR",
        neighborhood: "RVND",
        trainingFileName: "train-b.arff",
        testingFileName: "test-b.arff",
        createdAt: "2026-03-30T12:00:03.000Z",
        updatedAt: "2026-03-30T12:00:20.000Z",
        bestF1Score: 93,
        solutionFeatures: ["f2", "f4"],
        rclFeatures: ["f2", "f4", "f5"],
        enabledLocalSearches: ["IWSSR"],
        history: [
          {
            timestamp: "2026-03-30T12:00:12.000Z",
            requestId: "req-2",
            f1Score: 93,
            improved: true,
            scoreDelta: 5,
            localSearch: "IWSSR",
            neighborhood: "RVND",
          },
        ],
      },
    ];

    const events = [
      {
        topic: "BEST_SOLUTION_TOPIC",
        requestId: "req-1",
        timestamp: "2026-03-30T12:00:10.000Z",
      },
      {
        topic: "SOLUTIONS_TOPIC",
        requestId: "req-2",
        timestamp: "2026-03-30T12:00:20.000Z",
      },
    ];

    const summary = graspMonitorSummaryService.summarize(runs, events);

    expect(summary.totals.runs).toBe(2);
    expect(summary.totals.datasetPairs).toBe(2);

    expect(summary.quality.highQualityThreshold).toBe(95);
    expect(summary.quality.highQualityRuns).toBe(1);
    expect(summary.quality.firstHighQualityAt).toBe("2026-03-30T12:00:07.000Z");
    expect(summary.quality.timeToFirstHighQualitySeconds).toBe(7);
    expect(summary.quality.bestOverall).toMatchObject({
      seedId: "seed-1",
      rclAlgorithm: "IG",
      bestF1Score: 96,
      datasetPair: "train-a.arff|test-a.arff",
    });
    expect(summary.quality.improvementsObserved).toBe(3);
    expect(summary.quality.averageImprovementGain).toBeCloseTo(19 / 3, 4);
    expect(summary.quality.largestImprovementGain).toBe(8);

    expect(summary.observability.requestCount).toBe(2);
    expect(summary.observability.runsWithHistory).toBe(2);
    expect(summary.observability.runsWithTelemetry).toBe(1);
    expect(summary.observability.historyCoverageRatio).toBe(1);
    expect(summary.observability.telemetryCoverageRatio).toBe(0.5);
    expect(summary.observability.avgHistoryDepth).toBe(1.5);
    expect(summary.observability.observationWindowSeconds).toBe(20);

    expect(summary.exploration.uniqueFeatures).toBe(3);
    expect(summary.exploration.avgSolutionSize).toBe(2);
    expect(summary.exploration.avgRclSize).toBe(3);
    expect(summary.exploration.avgEnabledLocalSearches).toBe(1.5);
    expect(summary.exploration.localSearchCoverage).toEqual(["BIT_FLIP", "IWSS", "IWSSR"]);
    expect(summary.exploration.neighborhoods).toEqual(["RVND", "VND"]);
  });
});
