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

export const getMonitorEvents = async (limit = 100) => {
  const { data } = await api.get("/grasp/monitor/events", {
    params: { limit },
  });

  return data.events || [];
};

export const startGraspExecution = async (payload) => {
  const { data } = await api.post("/grasp/run", payload);
  return data;
};

export const createGraspMonitorStream = () => {
  const token = localStorage.getItem("token");
  const streamUrl = token
    ? `${API_URL}/grasp/monitor/stream?token=${encodeURIComponent(token)}`
    : `${API_URL}/grasp/monitor/stream`;

  return new EventSource(streamUrl);
};
