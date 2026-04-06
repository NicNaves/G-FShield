const queryKeys = {
  monitorRun: (seedId, options = {}) => [
    "monitor-run",
    seedId || "none",
    options.historyLimit || "default",
    Boolean(options.includeInsights),
    options.page || 1,
    options.pageSize || "default",
    options.start || "all",
    options.end || "all",
    options.timelineBucketMs || "default",
    options.timelineBucketLimit || "default",
  ],
  executionLaunch: (requestId, options = {}) => [
    "execution-launch",
    requestId || "none",
    Boolean(options.includeMonitor),
    options.historyLimit || "default",
    options.eventLimit || "default",
  ],
  monitorEventFeed: (options = {}) => [
    "monitor-event-feed",
    options.page || 1,
    options.pageSize || "default",
    options.query || "",
    options.algorithm || "all",
    options.datasetKey || "all",
    options.status || "all",
    options.searchLabel || "all",
    options.requestId || "all",
    options.seedId || "all",
    options.start || "all",
    options.end || "all",
    Array.isArray(options.topics) ? options.topics.join(",") : (options.topics || "all"),
  ],
  monitorDashboardAggregate: (options = {}) => [
    "monitor-dashboard-aggregate",
    options.bucketLimit || "default",
    options.timelineBucketLimit || "default",
  ],
};

export default queryKeys;
