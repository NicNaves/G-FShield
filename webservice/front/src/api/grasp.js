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

export const getMonitorRun = async (seedId) => {
  const { data } = await api.get(`/grasp/monitor/runs/${seedId}`);
  return data;
};

export const compareMonitorRuns = async (seedIds = [], historyLimit = 50) => {
  const { data } = await api.get("/grasp/monitor/compare", {
    params: {
      seedIds: seedIds.join(","),
      historyLimit,
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
