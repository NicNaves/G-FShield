const sanitizeFilePart = (value, fallback = "all") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
};

const serializeValue = (value) => {
  if (Array.isArray(value)) {
    return value.join(" | ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
};

const escapeCsvValue = (value) => {
  const serialized = serializeValue(value).replace(/"/g, '""');

  if (/[",\n\r]/.test(serialized)) {
    return `"${serialized}"`;
  }

  return serialized;
};

const buildExportSummary = (runs = [], snapshots = [], request = null) => ({
  runs: runs.length,
  snapshots: snapshots.length,
  uniqueSeeds: new Set(
    [...runs, ...snapshots]
      .map((entry) => entry?.seedId)
      .filter(Boolean)
  ).size,
  uniqueRequests: new Set(
    [
      ...runs.map((entry) => entry?.requestId),
      ...snapshots.map((entry) => entry?.requestId),
      request?.requestId || null,
    ].filter(Boolean)
  ).size,
});

export const buildDashboardExportFileName = (prefix, filters = {}) => {
  const scope = sanitizeFilePart(filters.exportScope, "visible");
  const algorithm = sanitizeFilePart(filters.algorithm, "all");
  const dataset = sanitizeFilePart(filters.dataset, "all");
  const timeWindow = sanitizeFilePart(filters.timelineWindow || filters.timeWindow, "all");
  const seedId = sanitizeFilePart(
    filters.seedId ? String(filters.seedId).slice(0, 12) : "",
    ""
  );
  const requestId = sanitizeFilePart(
    filters.requestId ? String(filters.requestId).slice(0, 18) : "",
    ""
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return [
    sanitizeFilePart(prefix, "dashboard"),
    scope,
    algorithm,
    dataset,
    timeWindow,
    requestId || null,
    seedId || null,
    stamp,
  ]
    .filter(Boolean)
    .join("-");
};

export const buildMonitorSnapshotsCsv = (snapshots = []) => {
  const headers = [
    "timestamp",
    "topic",
    "stage",
    "status",
    "algorithm",
    "search",
    "neighborhood",
    "currentF1Score",
    "bestF1Score",
    "previousBestF1Score",
    "scoreDelta",
    "seedId",
    "requestId",
    "trainingFileName",
    "testingFileName",
    "solutionFeatures",
    "rclFeatures",
    "cpuUsage",
    "memoryUsage",
    "memoryUsagePercent",
  ];

  const rows = snapshots.map((event) => [
    event?.timestamp || "",
    event?.topic || "",
    event?.stage || "",
    event?.status || "",
    event?.rclAlgorithm || "",
    event?.localSearch || "",
    event?.neighborhood || "",
    event?.currentF1Score ?? "",
    event?.bestF1Score ?? "",
    event?.previousBestF1Score ?? "",
    event?.scoreDelta ?? "",
    event?.seedId || "",
    event?.requestId || "",
    event?.trainingFileName || "",
    event?.testingFileName || "",
    event?.solutionFeatures || [],
    event?.rclFeatures || [],
    event?.cpuUsage ?? "",
    event?.memoryUsage ?? "",
    event?.memoryUsagePercent ?? "",
  ]);

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
};

export const buildDashboardExportPayload = ({
  filters = {},
  runs = [],
  snapshots = [],
  request = null,
  events = [],
  generatedAt = new Date().toISOString(),
} = {}) => ({
  generatedAt,
  filters,
  summary: buildExportSummary(runs, snapshots, request),
  request,
  runs,
  snapshots,
  events,
});

export const downloadTextFile = (filename, content, mimeType = "text/plain;charset=utf-8") => {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};
