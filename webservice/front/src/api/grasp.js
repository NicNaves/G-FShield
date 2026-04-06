import api, { API_URL } from "./client";

export const getGraspServices = async () => {
  const { data } = await api.get("/grasp/services");
  return data.services || [];
};

export const getAvailableDatasets = async () => {
  const { data } = await api.get("/grasp/datasets");
  return data;
};

export const getMonitorRuns = async (limit = 100, historyLimit = 30) => {
  const { data } = await api.get("/grasp/monitor/runs", {
    params: { limit, historyLimit },
  });

  return data.runs || [];
};

export const getMonitorBootstrap = async (limit = 100, historyLimit = 30, eventLimit = 300) => {
  const { data } = await api.get("/grasp/monitor/bootstrap", {
    params: { limit, historyLimit, eventLimit },
  });

  return {
    runs: data.runs || [],
    events: data.events || [],
    summary: data.summary || null,
    projection: data.projection || null,
  };
};

export const getMonitorDashboardAggregate = async (options = {}) => {
  const params = {
    bucketLimit: options.bucketLimit ?? 72,
    timelineBucketLimit: options.timelineBucketLimit ?? 1440,
  };
  const { data } = await api.get("/grasp/monitor/dashboard", {
    params,
  });

  return data.dashboard || null;
};

export const getMonitorEventFeed = async (options = {}) => {
  const params = {
    ...options,
    topics: Array.isArray(options.topics) ? options.topics.join(",") : options.topics,
  };
  const { data } = await api.get("/grasp/monitor/feed", {
    params,
  });

  return data.feed || null;
};

export const getMonitorRun = async (seedId, options = {}) => {
  const { data } = await api.get(`/grasp/monitor/runs/${seedId}`, {
    params: options,
  });
  return data;
};

export const compareMonitorRuns = async (seedIds = [], options = {}) => {
  const { data } = await api.get("/grasp/monitor/compare", {
    params: {
      seedIds: seedIds.join(","),
      historyLimit: options.historyLimit ?? 0,
      summaryOnly: options.summaryOnly ?? true,
      includeInsights: options.includeInsights ?? false,
      timelineBucketMs: options.timelineBucketMs,
      timelineBucketLimit: options.timelineBucketLimit,
    },
  });

  return data;
};

export const getMonitorEvents = async (limit = 100) => {
  const { data } = await api.get("/grasp/monitor/events", {
    params: { limit },
  });

  return data.events || [];
};

export const getMonitorSummary = async (runLimit = 300, eventLimit = 300) => {
  const { data } = await api.get("/grasp/monitor/summary", {
    params: { runLimit, eventLimit },
  });

  return data.summary || null;
};

export const resetMonitorState = async () => {
  const { data } = await api.post("/grasp/monitor/reset");
  return data;
};

export const resetDistributedEnvironment = async () => {
  const { data } = await api.post("/grasp/environment/reset", null, {
    timeout: 5 * 60 * 1000,
  });
  return data;
};

export const getExecutionLaunches = async (limit = 25) => {
  const { data } = await api.get("/grasp/executions", {
    params: { limit },
  });

  return data.launches || [];
};

export const getExecutionLaunch = async (requestId, options = {}) => {
  const { data } = await api.get(`/grasp/executions/${requestId}`, {
    params: options,
  });
  return data.launch || null;
};

export const cancelExecutionLaunch = async (requestId) => {
  const { data } = await api.post(`/grasp/executions/${requestId}/cancel`);
  return data.launch || null;
};

export const startGraspExecution = async (payload) => {
  const { data } = await api.post("/grasp/run", payload);
  return data;
};

export const createGraspMonitorStream = () => {
  return new EventSource(`${API_URL}/grasp/monitor/stream`, { withCredentials: true });
};
