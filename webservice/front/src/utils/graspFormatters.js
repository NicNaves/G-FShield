const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export const formatPercent = (value, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return `${Number(value).toFixed(digits)}%`;
};

export const formatCompactPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return `${percentFormatter.format(Number(value))}%`;
};

export const formatMetric = (value, suffix = "") => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return `${numberFormatter.format(Number(value))}${suffix}`;
};

export const formatDateTime = (value) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : dateFormatter.format(date);
};

export const formatShortTime = (value) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatRelativeTime = (value) => {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return "agora";
  }

  if (Math.abs(diffMinutes) < 60) {
    return `${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} d`;
};

export const formatDuration = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  const totalSeconds = Math.max(0, Math.floor(Number(value) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  if (parts.length === 0 || (days === 0 && hours === 0)) {
    parts.push(`${seconds}s`);
  }

  return parts.slice(0, 3).join(" ");
};

export const formatElapsedDuration = (startValue, endValue = Date.now()) => {
  if (!startValue) {
    return "--";
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "--";
  }

  return formatDuration(Math.max(end.getTime() - start.getTime(), 0));
};

export const getStatusColor = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "requested":
      return "info";
    default:
      return "warning";
  }
};

export const getStageLabel = (stage) => {
  switch (String(stage || "").toLowerCase()) {
    case "initial_solution":
      return "Initial Solution";
    case "neighborhood_restart":
      return "Neighborhood Restart";
    case "best_solution":
      return "Best Solution";
    case "solution_update":
      return "Solution Update";
    case "bit_flip":
      return "Bit-Flip";
    case "iwss":
      return "IWSS";
    case "iwssr":
      return "IWSSr";
    default:
      return stage || "--";
  }
};

export const getDatasetRoleLabel = (role) => {
  switch (String(role || "").toLowerCase()) {
    case "training":
      return "Training";
    case "testing":
      return "Testing";
    default:
      return "Flexible";
  }
};

export const formatFeatureSubset = (features, limit = 8) => {
  if (!Array.isArray(features) || features.length === 0) {
    return "--";
  }

  const visible = features.slice(0, limit).join(", ");
  return features.length > limit ? `${visible}...` : visible;
};

export const shortenSeed = (seedId) => {
  if (!seedId) {
    return "--";
  }

  return String(seedId).length > 12 ? `${String(seedId).slice(0, 12)}...` : String(seedId);
};
