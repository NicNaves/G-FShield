import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Icon from "@mui/material/Icon";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import MDProgress from "components/MDProgress";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import DataTable from "examples/Tables/DataTable";
import ExecutionComparison from "./execution-comparison";

import { getExecutionLaunch, getExecutionLaunches, getMonitorRun } from "api/grasp";
import useI18n from "hooks/useI18n";
import useGraspMonitor from "hooks/useGraspMonitor";
import { useMaterialUIController } from "context";
import {
  formatCompactPercent,
  formatDateTime,
  formatFeatureSubset,
  formatMetric,
  formatRelativeTime,
  formatShortTime,
  getStageLabel,
  shortenSeed,
} from "utils/graspFormatters";
import {
  buildDashboardExportFileName,
  buildDashboardExportPayload,
  buildMonitorSnapshotsCsv,
  downloadTextFile,
} from "utils/graspDashboardExport";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const mergeRunDetail = (currentRun = {}, incomingRun = {}) => ({
  ...currentRun,
  ...incomingRun,
  history:
    (incomingRun.history?.length || 0) >= (currentRun.history?.length || 0)
      ? incomingRun.history || []
      : currentRun.history || [],
});

const parseFeatureList = (features) => {
  if (Array.isArray(features)) {
    return features.map((feature) => String(feature));
  }

  if (typeof features === "string") {
    return features
      .split(/[\s,]+/)
      .map((feature) => feature.trim())
      .filter(Boolean);
  }

  return [];
};

const buildDatasetKey = (trainingFileName, testingFileName) =>
  `${trainingFileName || "--"}|${testingFileName || "--"}`;

const extractEventSnapshot = (event) => {
  const snapshot = event?.payload?.payload || event?.payload || {};
  const historyEntry = snapshot.historyEntry || {};
  const solutionFeatures = parseFeatureList(historyEntry.solutionFeatures || snapshot.solutionFeatures);
  const rclFeatures = parseFeatureList(historyEntry.rclFeatures || snapshot.rclFeatures || snapshot.rclfeatures);
  const enabledLocalSearches = Array.isArray(historyEntry.enabledLocalSearches)
    ? historyEntry.enabledLocalSearches
    : Array.isArray(snapshot.enabledLocalSearches)
      ? snapshot.enabledLocalSearches
      : [];

  return {
    ...event,
    seedId: snapshot.seedId || event?.seedId || null,
    topic: historyEntry.topic || event?.topic || snapshot.topic || null,
    stage: historyEntry.stage || event?.stage || snapshot.stage || null,
    timestamp: event?.timestamp || snapshot.updatedAt || snapshot.createdAt || null,
    rclAlgorithm: snapshot.rclAlgorithm || null,
    classifier: snapshot.classifier || snapshot.classfier || null,
    localSearch: historyEntry.localSearch || snapshot.localSearch || null,
    neighborhood: historyEntry.neighborhood || snapshot.neighborhood || null,
    currentF1Score: historyEntry.f1Score ?? snapshot.currentF1Score ?? snapshot.f1Score ?? null,
    bestF1Score: snapshot.bestF1Score ?? snapshot.currentF1Score ?? snapshot.f1Score ?? null,
    trainingFileName: snapshot.trainingFileName || null,
    testingFileName: snapshot.testingFileName || null,
    iterationNeighborhood: historyEntry.iterationNeighborhood ?? snapshot.iterationNeighborhood ?? null,
    iterationLocalSearch: historyEntry.iterationLocalSearch ?? snapshot.iterationLocalSearch ?? null,
    previousBestF1Score: historyEntry.previousBestF1Score ?? snapshot.previousBestF1Score ?? null,
    scoreDelta: historyEntry.scoreDelta ?? snapshot.scoreDelta ?? null,
    improved: historyEntry.improved ?? snapshot.improved ?? null,
    solutionFeatures,
    rclFeatures,
    enabledLocalSearches,
    solutionSize: historyEntry.solutionSize ?? snapshot.solutionSize ?? solutionFeatures.length,
    rclSize: historyEntry.rclSize ?? snapshot.rclSize ?? rclFeatures.length,
    memoryUsage: historyEntry.memoryUsage ?? snapshot.memoryUsage ?? null,
    memoryUsagePercent: historyEntry.memoryUsagePercent ?? snapshot.memoryUsagePercent ?? null,
    cpuUsage: historyEntry.cpuUsage ?? snapshot.cpuUsage ?? null,
  };
};

const extractHistorySnapshot = (run, entry) => {
  const solutionFeatures = parseFeatureList(entry?.solutionFeatures || run?.solutionFeatures);
  const rclFeatures = parseFeatureList(entry?.rclFeatures || run?.rclFeatures || run?.rclfeatures);
  const enabledLocalSearches = Array.isArray(entry?.enabledLocalSearches)
    ? entry.enabledLocalSearches
    : Array.isArray(run?.enabledLocalSearches)
      ? run.enabledLocalSearches
      : [];

  return {
    seedId: run?.seedId || null,
    requestId: entry?.requestId || run?.requestId || null,
    topic: entry?.topic || null,
    stage: entry?.stage || null,
    status: entry?.status || run?.status || null,
    timestamp: entry?.timestamp || run?.updatedAt || run?.createdAt || null,
    rclAlgorithm: run?.rclAlgorithm || null,
    classifier: run?.classifier || null,
    localSearch: entry?.localSearch || run?.localSearch || null,
    neighborhood: entry?.neighborhood || run?.neighborhood || null,
    currentF1Score: entry?.f1Score ?? run?.currentF1Score ?? null,
    bestF1Score: entry?.f1Score ?? run?.bestF1Score ?? run?.currentF1Score ?? null,
    trainingFileName: run?.trainingFileName || null,
    testingFileName: run?.testingFileName || null,
    iterationNeighborhood: entry?.iterationNeighborhood ?? run?.iterationNeighborhood ?? null,
    iterationLocalSearch: entry?.iterationLocalSearch ?? run?.iterationLocalSearch ?? null,
    previousBestF1Score: entry?.previousBestF1Score ?? run?.previousBestF1Score ?? null,
    scoreDelta: entry?.scoreDelta ?? run?.scoreDelta ?? null,
    improved: entry?.improved ?? run?.improved ?? null,
    solutionFeatures,
    rclFeatures,
    enabledLocalSearches,
    solutionSize: entry?.solutionSize ?? solutionFeatures.length,
    rclSize: entry?.rclSize ?? rclFeatures.length,
    memoryUsage: entry?.memoryUsage ?? run?.memoryUsage ?? null,
    memoryUsagePercent: entry?.memoryUsagePercent ?? run?.memoryUsagePercent ?? null,
    cpuUsage: entry?.cpuUsage ?? run?.cpuUsage ?? null,
  };
};

const getSortableDateValue = (value) => {
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getNumericScore = (value, fallback = -1) => {
  const score = Number(value);
  return Number.isNaN(score) ? fallback : score;
};

const getFiniteMetric = (value) => {
  const metric = Number(value);
  return Number.isFinite(metric) ? metric : null;
};

const averageMetric = (values = []) => {
  const finiteValues = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    return null;
  }

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
};

const dashboardTabDescriptions = {
  overview: "dashboard.tabDescOverview",
  performance: "dashboard.tabDescPerformance",
  algorithms: "dashboard.tabDescAlgorithms",
  analytics: "dashboard.tabDescAnalytics",
  executions: "dashboard.tabDescExecutions",
};

const dashboardTabs = [
  { value: "overview", labelKey: "dashboard.tabOverview", icon: "space_dashboard" },
  { value: "performance", labelKey: "dashboard.tabPerformance", icon: "monitoring" },
  { value: "algorithms", labelKey: "dashboard.tabAlgorithms", icon: "hub" },
  { value: "analytics", labelKey: "dashboard.tabAnalytics", icon: "analytics" },
  { value: "executions", labelKey: "dashboard.tabExecutions", icon: "lan" },
];

const stageLensOptions = [
  { value: "all", labelKey: "dashboard.allStages" },
  { value: "initial", labelKey: "dashboard.stageInitial" },
  { value: "restart", labelKey: "dashboard.stageRestart" },
  { value: "local", labelKey: "dashboard.stageLocal" },
  { value: "progress", labelKey: "dashboard.stageProgress" },
  { value: "best", labelKey: "dashboard.stageBest" },
];

const timeWindowOptions = [
  { value: "15m", labelKey: "dashboard.timeWindowLast15Minutes" },
  { value: "all", labelKey: "dashboard.timeWindowAll" },
  { value: "1h", labelKey: "dashboard.timeWindowLastHour" },
  { value: "6h", labelKey: "dashboard.timeWindowLast6Hours" },
  { value: "24h", labelKey: "dashboard.timeWindowLast24Hours" },
  { value: "7d", labelKey: "dashboard.timeWindowLast7Days" },
  { value: "custom", labelKey: "dashboard.timeWindowCustom" },
];

const timelineWindowOptions = [
  { value: "15m", labelKey: "dashboard.timelineWindowLast15Minutes" },
  { value: "all", labelKey: "dashboard.timelineWindowAll" },
  { value: "1h", labelKey: "dashboard.timelineWindowLastHour" },
  { value: "6h", labelKey: "dashboard.timelineWindowLast6Hours" },
  { value: "custom", labelKey: "dashboard.timelineWindowCustom" },
];

const DASHBOARD_MONITOR_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_GRASP_MONITOR_LIMIT || 800) || 800, 1200),
  200
);

const DASHBOARD_MONITOR_HISTORY_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_GRASP_MONITOR_HISTORY_LIMIT || 40) || 40, 120),
  10
);

const DASHBOARD_MONITOR_SUMMARY_EVENT_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_GRASP_MONITOR_SUMMARY_EVENT_LIMIT || 300) || 300, DASHBOARD_MONITOR_LIMIT),
  50
);

const getEntryTimestamp = (entry = {}) => entry?.timestamp || entry?.updatedAt || entry?.createdAt || null;

const parseDateTimeValue = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const toDateTimeLocalValue = (value) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
};

const buildRelativeRangeValues = (durationMs, anchorValue = Date.now()) => {
  const anchorTimestamp = parseDateTimeValue(anchorValue) ?? Date.now();
  const end = new Date(anchorTimestamp);
  const start = new Date(anchorTimestamp - durationMs);

  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
};

const buildTodayRangeValues = (anchorValue = Date.now()) => {
  const anchorTimestamp = parseDateTimeValue(anchorValue) ?? Date.now();
  const end = new Date(anchorTimestamp);
  const start = new Date(anchorTimestamp);
  start.setHours(0, 0, 0, 0);

  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
};

function FriendlyDateTimeField({
  label,
  value,
  onChange,
  helperText,
}) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.focus();
  };

  return (
    <TextField
      type="datetime-local"
      size="small"
      fullWidth
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputRef={inputRef}
      InputLabelProps={{ shrink: true }}
      helperText={helperText}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton size="small" onClick={openPicker}>
              <Icon fontSize="small">event</Icon>
            </IconButton>
            {value ? (
              <IconButton size="small" onClick={() => onChange("")}>
                <Icon fontSize="small">close</Icon>
              </IconButton>
            ) : null}
          </InputAdornment>
        ),
      }}
    />
  );
}

FriendlyDateTimeField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  helperText: PropTypes.string,
};

FriendlyDateTimeField.defaultProps = {
  helperText: "",
};

const resolveTimeRangeBounds = (timeWindow, customStart, customEnd) => {
  const now = Date.now();

  switch (timeWindow) {
    case "15m":
      return { from: now - 15 * 60 * 1000, to: now };
    case "1h":
      return { from: now - 60 * 60 * 1000, to: now };
    case "6h":
      return { from: now - 6 * 60 * 60 * 1000, to: now };
    case "24h":
      return { from: now - 24 * 60 * 60 * 1000, to: now };
    case "7d":
      return { from: now - 7 * 24 * 60 * 60 * 1000, to: now };
    case "custom":
      return {
        from: parseDateTimeValue(customStart),
        to: parseDateTimeValue(customEnd),
      };
    default:
      return { from: null, to: null };
  }
};

const isTimestampWithinRange = (timestampValue, range = {}) => {
  const parsed = parseDateTimeValue(timestampValue);
  if (parsed === null) {
    return true;
  }

  if (range.from !== null && parsed < range.from) {
    return false;
  }

  if (range.to !== null && parsed > range.to) {
    return false;
  }

  return true;
};

const hasActiveTimeFilter = (timeWindow, customStart, customEnd) => {
  if (timeWindow === "15m") {
    return false;
  }

  if (timeWindow === "custom") {
    return Boolean(customStart) || Boolean(customEnd);
  }

  return true;
};

const resolveAnchoredTimeRangeBounds = (timeWindow, customStart, customEnd, anchorTimestamp) => {
  const anchor = parseDateTimeValue(anchorTimestamp);

  switch (timeWindow) {
    case "15m":
      return anchor === null ? { from: null, to: null } : { from: anchor - 15 * 60 * 1000, to: anchor };
    case "1h":
      return anchor === null ? { from: null, to: null } : { from: anchor - 60 * 60 * 1000, to: anchor };
    case "6h":
      return anchor === null ? { from: null, to: null } : { from: anchor - 6 * 60 * 60 * 1000, to: anchor };
    case "custom":
      return {
        from: parseDateTimeValue(customStart),
        to: parseDateTimeValue(customEnd),
      };
    default:
      return { from: null, to: null };
  }
};

const matchesTimelineTimestampQuery = (entry, query) => {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const timestamp = getEntryTimestamp(entry);
  const parsed = timestamp ? new Date(timestamp) : null;
  const isoTimestamp = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "";
  const compactLocalTimestamp = parsed && !Number.isNaN(parsed.getTime())
    ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
      parsed.getDate()
    ).padStart(2, "0")} ${String(parsed.getHours()).padStart(2, "0")}:${String(
      parsed.getMinutes()
    ).padStart(2, "0")}`
    : "";
  const searchTarget = [
    timestamp,
    isoTimestamp,
    compactLocalTimestamp,
    formatDateTime(timestamp),
    formatShortTime(timestamp),
    entry?.order ? `#${entry.order}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchTarget.includes(normalizedQuery);
};

const startOfHourIso = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setMinutes(0, 0, 0);
  return parsed.toISOString();
};

const formatHourBucketLabel = (value) => {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const chartColorPalettes = {
  algorithm: {
    IG: "#4361ee",
    INFORMATION_GAIN: "#4361ee",
    GR: "#ff8c42",
    GAIN_RATIO: "#ff8c42",
    SU: "#11b5ae",
    SYMMETRICAL_UNCERTAINTY: "#11b5ae",
    RF: "#8b5cf6",
    RELIEF: "#8b5cf6",
    RELIEFF: "#8b5cf6",
    UNKNOWN: "#94a3b8",
  },
  search: {
    BIT_FLIP: "#36c56c",
    IWSS: "#f59e0b",
    IWSSR: "#ef476f",
    VND: "#6366f1",
    RVND: "#14b8a6",
    UNKNOWN: "#94a3b8",
  },
};

const fallbackBarColors = ["#4361ee", "#11b5ae", "#ff8c42", "#8b5cf6", "#ef476f", "#36c56c"];

const formatWorkspaceLabel = (value = "") =>
  String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatSearchPlan = (searches = []) => {
  if (!Array.isArray(searches) || searches.length === 0) {
    return "--";
  }

  return searches.join(", ");
};

const resolveDlsAlgorithmLabel = (entry = {}) =>
  entry.searchLabel || entry.localSearch || entry.neighborhood || "Unknown";

const formatTopicLabel = (topic = "") =>
  String(topic || "--")
    .replace(/_TOPIC$/i, "")
    .replace(/_/g, " ")
    .trim();

const resolveCount = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatScoreDelta = (currentValue, previousValue) => {
  const current = Number(currentValue);
  const previous = Number(previousValue);

  if (Number.isNaN(current) || Number.isNaN(previous)) {
    return "--";
  }

  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatMetric(delta, " pts")}`;
};

const normalizeChartKey = (value = "") =>
  String(value)
    .trim()
    .toUpperCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

const hexToRgba = (hex, alpha) => {
  const safeHex = String(hex || "").replace("#", "");
  if (safeHex.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const red = Number.parseInt(safeHex.slice(0, 2), 16);
  const green = Number.parseInt(safeHex.slice(2, 4), 16);
  const blue = Number.parseInt(safeHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const pickFallbackColor = (label) => {
  const normalized = normalizeChartKey(label);
  if (!normalized) {
    return fallbackBarColors[0];
  }

  const hash = [...normalized].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return fallbackBarColors[hash % fallbackBarColors.length];
};

const getBarPaletteForLabels = (labels = [], paletteName = "algorithm") => {
  const palette = chartColorPalettes[paletteName] || {};

  const borderColor = labels.map((label) => {
    const normalized = normalizeChartKey(label);
    return palette[normalized] || pickFallbackColor(label);
  });

  return {
    borderColor,
    backgroundColor: borderColor.map((color) => hexToRgba(color, 0.84)),
    hoverBackgroundColor: borderColor.map((color) => hexToRgba(color, 0.96)),
  };
};

const filterPanelSx = (darkMode) => ({
  height: "100%",
  p: 2.25,
  borderRadius: 3,
  color: darkMode ? "#edf4ff" : "#1f2937",
  border: `1px solid ${darkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)"}`,
  background: darkMode
    ? "linear-gradient(180deg, rgba(14, 22, 37, 0.92) 0%, rgba(18, 28, 47, 0.94) 100%)"
    : "linear-gradient(180deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.92) 100%)",
  boxShadow: darkMode
    ? "0 22px 42px rgba(2, 6, 23, 0.34)"
    : "0 14px 30px rgba(15, 23, 42, 0.06)",
  "& .MuiFormControl-root": {
    mb: 0,
  },
  "& .MuiInputLabel-root": {
    color: darkMode ? "rgba(212, 222, 238, 0.76)" : "rgba(71, 85, 105, 0.82)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: darkMode ? "#8dc2ff" : "#3d8ef5",
  },
  "& .MuiOutlinedInput-root": {
    color: darkMode ? "#edf4ff" : "#1f2937",
    backgroundColor: darkMode ? "rgba(8, 14, 24, 0.44)" : "rgba(255, 255, 255, 0.82)",
    borderRadius: 2.2,
    transition: "border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: darkMode ? "rgba(143, 160, 191, 0.28)" : "rgba(15, 23, 42, 0.12)",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: darkMode ? "rgba(141, 194, 255, 0.48)" : "rgba(61, 142, 245, 0.28)",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: darkMode ? "#8dc2ff" : "#3d8ef5",
    borderWidth: "1px",
  },
  "& .MuiSelect-icon": {
    color: darkMode ? "rgba(212, 222, 238, 0.82)" : "rgba(71, 85, 105, 0.82)",
  },
  "& .MuiDivider-root": {
    borderColor: darkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)",
  },
});

const filterPanelHeadingSx = (darkMode) => ({
  color: darkMode ? "#f8fafc" : "#1f2937",
});

const filterPanelCaptionSx = (darkMode) => ({
  color: darkMode ? "rgba(212, 222, 238, 0.68)" : "rgba(71, 85, 105, 0.9)",
});

const dashboardContentSx = (darkMode) => ({
  "& .MuiCard-root": {
    borderRadius: 3,
    border: darkMode ? "1px solid rgba(255, 255, 255, 0.08)" : undefined,
    background: darkMode
      ? "linear-gradient(180deg, rgba(16, 24, 38, 0.94) 0%, rgba(18, 28, 47, 0.96) 100%)"
      : undefined,
    boxShadow: darkMode ? "0 20px 40px rgba(2, 6, 23, 0.32)" : undefined,
  },
  "& .MuiCard-root .MuiTypography-root": {
    color: darkMode ? "#edf4ff !important" : undefined,
  },
  "& .MuiCard-root .MuiTypography-caption, & .MuiCard-root .MuiTypography-button, & .MuiCard-root .MuiTypography-body2": {
    color: darkMode ? "rgba(212, 222, 238, 0.76) !important" : undefined,
  },
  "& .MuiCard-root .MuiDivider-root": {
    borderColor: darkMode ? "rgba(255, 255, 255, 0.08)" : undefined,
  },
});

const isBestSolutionRun = (run = {}) => run.topic === "BEST_SOLUTION_TOPIC";

const isFinalOutcomeRun = (run = {}) => String(run.status || "").toLowerCase() === "completed";

const pickPreferredRun = (currentRun, candidateRun) => {
  if (!currentRun) {
    return candidateRun;
  }

  const currentFinal = isFinalOutcomeRun(currentRun);
  const candidateFinal = isFinalOutcomeRun(candidateRun);
  if (candidateFinal !== currentFinal) {
    return candidateFinal ? candidateRun : currentRun;
  }

  const currentScore = getNumericScore(currentRun.bestF1Score);
  const candidateScore = getNumericScore(candidateRun.bestF1Score);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidateRun : currentRun;
  }

  const currentCompleted = String(currentRun.status || "").toLowerCase() === "completed";
  const candidateCompleted = String(candidateRun.status || "").toLowerCase() === "completed";
  if (candidateCompleted !== currentCompleted) {
    return candidateCompleted ? candidateRun : currentRun;
  }

  return getSortableDateValue(candidateRun.updatedAt) >= getSortableDateValue(currentRun.updatedAt)
    ? candidateRun
    : currentRun;
};

const promoteBestSolutionEvent = (event = {}) => ({
  seedId: event.seedId || null,
  createdAt: event.timestamp || null,
  updatedAt: event.timestamp || null,
  completedAt: String(event.status || "").toLowerCase() === "completed" ? event.timestamp || null : null,
  status: String(event.status || "").toLowerCase() || "running",
  stage: event.stage || "best_solution",
  topic: event.topic || "BEST_SOLUTION_TOPIC",
  rclAlgorithm: event.rclAlgorithm || null,
  classifier: event.classifier || null,
  localSearch: event.localSearch || null,
  neighborhood: event.neighborhood || null,
  trainingFileName: event.trainingFileName || null,
  testingFileName: event.testingFileName || null,
  currentF1Score: event.currentF1Score ?? event.bestF1Score ?? null,
  bestF1Score: event.bestF1Score ?? event.currentF1Score ?? null,
  solutionFeatures: event.solutionFeatures || [],
});

const buildSeriesLabels = (entries) =>
  entries.map((entry, index) =>
    entries.length > 24 ? `#${index + 1}` : formatShortTime(entry.timestamp)
  );

const buildEmptyLineData = (primaryLabel, secondaryLabel) => ({
  labels: ["#1"],
  datasets: [
    {
      label: primaryLabel,
      data: [0],
      borderColor: "#4361ee",
      backgroundColor: "rgba(67, 97, 238, 0.10)",
      tension: 0.35,
      fill: true,
    },
    {
      label: secondaryLabel,
      data: [0],
      borderColor: "#36c56c",
      backgroundColor: "rgba(54, 197, 108, 0.08)",
      tension: 0.35,
      fill: true,
    },
  ],
});

const buildEmptyBarData = (label) => ({
  labels: ["No data"],
  datasets: [
    {
      label,
      data: [0],
      backgroundColor: "#d6dae6",
      borderRadius: 8,
    },
  ],
});

const buildEmptyDoughnutData = () => ({
  labels: ["No data"],
  datasets: [
    {
      data: [1],
      backgroundColor: ["#d6dae6"],
      borderWidth: 0,
    },
  ],
});

const pickPreferredSnapshot = (currentEntry, candidateEntry) => {
  if (!currentEntry) {
    return candidateEntry;
  }

  const currentScore = getNumericScore(currentEntry.bestF1Score ?? currentEntry.currentF1Score);
  const candidateScore = getNumericScore(candidateEntry.bestF1Score ?? candidateEntry.currentF1Score);

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidateEntry : currentEntry;
  }

  return getSortableDateValue(candidateEntry.timestamp || candidateEntry.updatedAt)
    >= getSortableDateValue(currentEntry.timestamp || currentEntry.updatedAt)
    ? candidateEntry
    : currentEntry;
};

const deriveWorkflowSteps = (run = {}, initialEvent = null) => {
  const steps = [];

  if (initialEvent?.rclAlgorithm) {
    steps.push(`RCL ${initialEvent.rclAlgorithm}`);
  } else if (run.rclAlgorithm) {
    steps.push(`RCL ${run.rclAlgorithm}`);
  }

  if (run.neighborhood) {
    steps.push(run.neighborhood);
  }

  const historySearches = (run.history || [])
    .map((entry) => entry.localSearch)
    .filter(Boolean)
    .map((entry) => String(entry).toUpperCase());

  const distinctSearches = [...new Set(historySearches)];
  if (distinctSearches.length === 0 && run.localSearch) {
    distinctSearches.push(String(run.localSearch).toUpperCase());
  }

  distinctSearches.forEach((search) => steps.push(search));

  if (run.topic === "BEST_SOLUTION_TOPIC") {
    steps.push("BEST");
  }

  return steps;
};

function Dashboard() {
  const { t } = useI18n();
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;
  const {
    runs: liveRuns,
    events: liveEvents,
    loading,
    error,
    connected,
  } = useGraspMonitor(DASHBOARD_MONITOR_LIMIT, {
    historyLimit: DASHBOARD_MONITOR_HISTORY_LIMIT,
    summaryEventLimit: DASHBOARD_MONITOR_SUMMARY_EVENT_LIMIT,
  });
  const runs = useDeferredValue(liveRuns);
  const events = useDeferredValue(liveEvents);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedSeedId, setSelectedSeedId] = useState("");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("all");
  const [selectedDataset, setSelectedDataset] = useState("all");
  const [selectedStageLens, setSelectedStageLens] = useState("all");
  const [selectedRunStatus, setSelectedRunStatus] = useState("all");
  const [selectedSearch, setSelectedSearch] = useState("all");
  const [selectedTimeWindow, setSelectedTimeWindow] = useState("15m");
  const [customRangeStart, setCustomRangeStart] = useState("");
  const [customRangeEnd, setCustomRangeEnd] = useState("");
  const [selectedTimelineWindow, setSelectedTimelineWindow] = useState("15m");
  const [timelineRangeStart, setTimelineRangeStart] = useState("");
  const [timelineRangeEnd, setTimelineRangeEnd] = useState("");
  const [timelineTimestampQuery, setTimelineTimestampQuery] = useState("");
  const [selectedExportScope, setSelectedExportScope] = useState("visible");
  const [executionRequests, setExecutionRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [selectedRequestDetails, setSelectedRequestDetails] = useState(null);
  const [selectedRunDetails, setSelectedRunDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [requestDetailsLoading, setRequestDetailsLoading] = useState(false);

  const setGlobalCustomRange = (startValue, endValue) => {
    setSelectedTimeWindow("custom");
    setCustomRangeStart(startValue || "");
    setCustomRangeEnd(endValue || "");
  };

  const snapshotEvents = useMemo(
    () =>
      events
        .filter((event) => event.type === "kafka.update")
        .map(extractEventSnapshot),
    [events]
  );

  const algorithmOptions = useMemo(() => {
    const values = new Set();
    runs.forEach((run) => {
      if (run.rclAlgorithm) {
        values.add(run.rclAlgorithm);
      }
    });
    snapshotEvents.forEach((event) => {
      if (event.rclAlgorithm) {
        values.add(event.rclAlgorithm);
      }
    });

    return [...values].sort();
  }, [runs, snapshotEvents]);

  const datasetOptions = useMemo(() => {
    const values = new Map();
    [...runs, ...snapshotEvents].forEach((entry) => {
      const datasetKey = buildDatasetKey(entry.trainingFileName, entry.testingFileName);
      if (datasetKey !== "--|--" && !values.has(datasetKey)) {
        values.set(datasetKey, {
          key: datasetKey,
          label: `${entry.trainingFileName || "--"} -> ${entry.testingFileName || "--"}`,
        });
      }
    });

    return [...values.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [runs, snapshotEvents]);

  const searchOptions = useMemo(() => {
    const values = new Set();

    [...runs, ...snapshotEvents].forEach((entry) => {
      if (entry.localSearch) {
        values.add(String(entry.localSearch).toUpperCase());
      }

      if (entry.neighborhood) {
        values.add(String(entry.neighborhood).toUpperCase());
      }
    });

    return [...values].sort();
  }, [runs, snapshotEvents]);

  const runStatusOptions = useMemo(() => {
    const values = new Set();

    [...runs, ...snapshotEvents].forEach((entry) => {
      const status = String(entry?.status || "")
        .trim()
        .toLowerCase();

      if (status) {
        values.add(status);
      }
    });

    if (values.size === 0) {
      values.add("running");
      values.add("completed");
    }

    return [...values].sort();
  }, [runs, snapshotEvents]);

  const timeRangeBounds = useMemo(
    () => resolveTimeRangeBounds(selectedTimeWindow, customRangeStart, customRangeEnd),
    [selectedTimeWindow, customRangeStart, customRangeEnd]
  );

  const matchesSelection = (entry) => {
    if (!entry) {
      return false;
    }

    const matchesAlgorithm = selectedAlgorithm === "all" || entry.rclAlgorithm === selectedAlgorithm;
    const matchesDataset =
      selectedDataset === "all"
      || buildDatasetKey(entry.trainingFileName, entry.testingFileName) === selectedDataset;
    const entryTopic = entry.topic || null;
    const matchesStageLens =
      selectedStageLens === "all"
      || (selectedStageLens === "initial" && entryTopic === "INITIAL_SOLUTION_TOPIC")
      || (selectedStageLens === "restart" && entryTopic === "NEIGHBORHOOD_RESTART_TOPIC")
      || (selectedStageLens === "local" && entryTopic === "SOLUTIONS_TOPIC")
      || (selectedStageLens === "progress" && entryTopic === "LOCAL_SEARCH_PROGRESS_TOPIC")
      || (selectedStageLens === "best" && entryTopic === "BEST_SOLUTION_TOPIC");
    const normalizedStatus = String(entry.status || "running").toLowerCase();
    const matchesRunStatus = selectedRunStatus === "all" || normalizedStatus === selectedRunStatus;
    const normalizedSearch = String(entry.localSearch || entry.neighborhood || "").toUpperCase();
    const matchesSearch = selectedSearch === "all" || normalizedSearch === selectedSearch;
    const matchesTime = isTimestampWithinRange(getEntryTimestamp(entry), timeRangeBounds);

    return matchesAlgorithm
      && matchesDataset
      && matchesStageLens
      && matchesRunStatus
      && matchesSearch
      && matchesTime;
  };

  const filteredRuns = useMemo(
    () => runs.filter(matchesSelection),
    [
      runs,
      selectedAlgorithm,
      selectedDataset,
      selectedStageLens,
      selectedRunStatus,
      selectedSearch,
      timeRangeBounds,
    ]
  );

  const filteredSnapshotEvents = useMemo(
    () => snapshotEvents.filter(matchesSelection),
    [
      snapshotEvents,
      selectedAlgorithm,
      selectedDataset,
      selectedStageLens,
      selectedRunStatus,
      selectedSearch,
      timeRangeBounds,
    ]
  );

  const activeFilterCount = useMemo(
    () =>
      [
        selectedAlgorithm !== "all",
        selectedDataset !== "all",
        selectedStageLens !== "all",
        selectedRunStatus !== "all",
        selectedSearch !== "all",
        hasActiveTimeFilter(selectedTimeWindow, customRangeStart, customRangeEnd),
        Boolean(selectedSeedId),
      ].filter(Boolean).length,
    [
      selectedAlgorithm,
      selectedDataset,
      selectedStageLens,
      selectedRunStatus,
      selectedSearch,
      selectedTimeWindow,
      customRangeStart,
      customRangeEnd,
      selectedSeedId,
    ]
  );

  const historySnapshots = useMemo(
    () =>
      filteredRuns.flatMap((run) =>
        (run.history || [])
          .filter((entry) => entry?.topic)
          .map((entry) => extractHistorySnapshot(run, entry))
          .filter(matchesSelection)
      ),
    [filteredRuns, timeRangeBounds, selectedAlgorithm, selectedDataset, selectedStageLens, selectedRunStatus, selectedSearch]
  );

  const monitorSnapshots = useMemo(() => {
    const merged = new Map();

    [...historySnapshots, ...filteredSnapshotEvents].forEach((event) => {
      if (!event?.seedId || !event?.topic) {
        return;
      }

      const searchLabel = event.localSearch || event.neighborhood || event.stage || "none";
      const key = `${event.seedId}:${event.topic}:${searchLabel}:${event.timestamp || "time"}`;
      if (!merged.has(key)) {
        merged.set(key, event);
      }
    });

    return [...merged.values()].sort(
      (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
    );
  }, [historySnapshots, filteredSnapshotEvents]);

  const initialSolutionEvents = useMemo(() => {
    const initialBySeed = new Map();

    monitorSnapshots
      .filter((event) => event.topic === "INITIAL_SOLUTION_TOPIC" && event.seedId)
      .forEach((event) => {
        const current = initialBySeed.get(event.seedId);
        initialBySeed.set(event.seedId, pickPreferredSnapshot(current, event));
      });

    return [...initialBySeed.values()].sort(
      (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
    );
  }, [monitorSnapshots]);

  const bestSolutionRuns = useMemo(
    () => {
      const bestBySeed = new Map();

      filteredRuns
        .filter((run) => isBestSolutionRun(run))
        .forEach((run) => {
          bestBySeed.set(run.seedId, pickPreferredRun(bestBySeed.get(run.seedId), run));
        });

      monitorSnapshots
        .filter((event) => event.topic === "BEST_SOLUTION_TOPIC" && event.seedId)
        .forEach((event) => {
          const promotedRun = promoteBestSolutionEvent(event);
          bestBySeed.set(event.seedId, pickPreferredRun(bestBySeed.get(event.seedId), promotedRun));
        });

      return [...bestBySeed.values()].sort(
        (left, right) => getSortableDateValue(right.updatedAt) - getSortableDateValue(left.updatedAt)
      );
    },
    [filteredRuns, monitorSnapshots]
  );

  const preferredRunBySeed = useMemo(() => {
    const next = new Map();

    filteredRuns.forEach((run) => {
      if (!run?.seedId) {
        return;
      }

      next.set(run.seedId, pickPreferredRun(next.get(run.seedId), run));
    });

    bestSolutionRuns.forEach((run) => {
      if (!run?.seedId) {
        return;
      }

      next.set(run.seedId, pickPreferredRun(next.get(run.seedId), run));
    });

    return next;
  }, [filteredRuns, bestSolutionRuns]);

  const initialEventBySeed = useMemo(
    () => new Map(initialSolutionEvents.map((event) => [event.seedId, event])),
    [initialSolutionEvents]
  );

  const localSearchOutcomeEvents = useMemo(() => {
    const outcomesBySeedAndSearch = new Map();

    monitorSnapshots
      .filter((event) => event.topic === "SOLUTIONS_TOPIC" && event.seedId && (event.localSearch || event.neighborhood))
      .forEach((event) => {
        const searchLabel = event.localSearch || event.neighborhood || getStageLabel(event.stage);
        const key = `${event.seedId}:${searchLabel}`;
        const current = outcomesBySeedAndSearch.get(key);
        outcomesBySeedAndSearch.set(key, pickPreferredSnapshot(current, {
          ...event,
          searchLabel,
        }));
      });

    return [...outcomesBySeedAndSearch.values()].sort(
      (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
    );
  }, [monitorSnapshots]);

  const localSearchProgressEvents = useMemo(
    () =>
      monitorSnapshots
        .filter((event) => event.topic === "LOCAL_SEARCH_PROGRESS_TOPIC" && event.seedId)
        .sort((left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)),
    [monitorSnapshots]
  );

  const dlsActivityEvents = useMemo(() => {
    const activityBySeedAndSearch = new Map();

    [...localSearchProgressEvents, ...localSearchOutcomeEvents].forEach((event) => {
      if (!event?.seedId) {
        return;
      }

      const algorithm = resolveDlsAlgorithmLabel(event);
      if (!algorithm || algorithm === "Unknown") {
        return;
      }

      const key = `${event.seedId}:${algorithm}`;
      const current = activityBySeedAndSearch.get(key);
      activityBySeedAndSearch.set(key, current ? pickPreferredSnapshot(current, event) : event);
    });

    return [...activityBySeedAndSearch.values()].sort(
      (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
    );
  }, [localSearchOutcomeEvents, localSearchProgressEvents]);

  const bestSolutionSnapshotEvents = useMemo(
    () =>
      monitorSnapshots
        .filter((event) => event.topic === "BEST_SOLUTION_TOPIC" && event.seedId)
        .sort((left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)),
    [monitorSnapshots]
  );

  const rawTopicMetrics = useMemo(() => {
    const grouped = new Map();

    monitorSnapshots.forEach((event) => {
      const topic = event.topic || "UNKNOWN_TOPIC";
      const current = grouped.get(topic) || {
        topic,
        count: 0,
        uniqueSeeds: new Set(),
        scores: [],
        bestScore: Number.NEGATIVE_INFINITY,
      };

      current.count += 1;

      if (event.seedId) {
        current.uniqueSeeds.add(event.seedId);
      }

      const score = getFiniteMetric(event.bestF1Score ?? event.currentF1Score);
      if (score !== null) {
        current.scores.push(score);
        current.bestScore = Math.max(current.bestScore, score);
      }

      grouped.set(topic, current);
    });

    return [...grouped.values()]
      .map((entry) => ({
        topic: entry.topic,
        count: entry.count,
        uniqueSeedCount: entry.uniqueSeeds.size,
        averageScore: averageMetric(entry.scores),
        bestScore: Number.isFinite(entry.bestScore) ? entry.bestScore : null,
      }))
      .sort((left, right) => right.count - left.count);
  }, [monitorSnapshots]);

  const improvementEvents = useMemo(() => {
    const bestBySeed = new Map();

    return [...monitorSnapshots]
      .filter((event) =>
        ["INITIAL_SOLUTION_TOPIC", "NEIGHBORHOOD_RESTART_TOPIC", "LOCAL_SEARCH_PROGRESS_TOPIC", "SOLUTIONS_TOPIC", "BEST_SOLUTION_TOPIC"].includes(event.topic)
      )
      .sort((left, right) => getSortableDateValue(left.timestamp) - getSortableDateValue(right.timestamp))
      .reduce((nextEvents, event) => {
        const score = getNumericScore(event.bestF1Score ?? event.currentF1Score);
        const previous = bestBySeed.get(event.seedId);
        bestBySeed.set(event.seedId, Math.max(previous ?? Number.NEGATIVE_INFINITY, score));

        if (
          ["INITIAL_SOLUTION_TOPIC", "NEIGHBORHOOD_RESTART_TOPIC", "LOCAL_SEARCH_PROGRESS_TOPIC", "SOLUTIONS_TOPIC", "BEST_SOLUTION_TOPIC"].includes(event.topic)
          && previous !== undefined
          && score > previous
        ) {
          nextEvents.push({
            ...event,
            previousBestScore: previous,
          });
        }

        return nextEvents;
      }, [])
      .reverse()
      .slice(0, 8);
  }, [monitorSnapshots]);

  const resourceAveragesByAlgorithm = useMemo(() => {
    const grouped = new Map();

    monitorSnapshots.forEach((event) => {
      if (event.topic !== "INITIAL_SOLUTION_TOPIC") {
        return;
      }

      const algorithm = event.rclAlgorithm || "Unknown";
      const cpuUsage = getFiniteMetric(event.cpuUsage);
      const memoryUsage = getFiniteMetric(event.memoryUsage);
      const memoryUsagePercent = getFiniteMetric(event.memoryUsagePercent);

      if (cpuUsage === null && memoryUsage === null && memoryUsagePercent === null) {
        return;
      }

      const current = grouped.get(algorithm) || {
        algorithm,
        sampleCount: 0,
        cpuTotal: 0,
        cpuCount: 0,
        memoryTotal: 0,
        memoryCount: 0,
        memoryPercentTotal: 0,
        memoryPercentCount: 0,
      };

      current.sampleCount += 1;

      if (cpuUsage !== null) {
        current.cpuTotal += cpuUsage;
        current.cpuCount += 1;
      }

      if (memoryUsage !== null) {
        current.memoryTotal += memoryUsage;
        current.memoryCount += 1;
      }

      if (memoryUsagePercent !== null) {
        current.memoryPercentTotal += memoryUsagePercent;
        current.memoryPercentCount += 1;
      }

      grouped.set(algorithm, current);
    });

    return [...grouped.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        sampleCount: entry.sampleCount,
        avgCpuUsage: entry.cpuCount > 0 ? entry.cpuTotal / entry.cpuCount : null,
        avgMemoryUsage: entry.memoryCount > 0 ? entry.memoryTotal / entry.memoryCount : null,
        avgMemoryUsagePercent:
          entry.memoryPercentCount > 0 ? entry.memoryPercentTotal / entry.memoryPercentCount : null,
      }))
      .sort(
        (left, right) =>
          getNumericScore(right.avgCpuUsage, Number.NEGATIVE_INFINITY)
          - getNumericScore(left.avgCpuUsage, Number.NEGATIVE_INFINITY)
      );
  }, [monitorSnapshots]);

  const resourceAveragesByLocalSearch = useMemo(() => {
    const grouped = new Map();

    monitorSnapshots.forEach((event) => {
      if (!["LOCAL_SEARCH_PROGRESS_TOPIC", "SOLUTIONS_TOPIC"].includes(event.topic)) {
        return;
      }

      const localSearch = event.localSearch || event.searchLabel;
      const cpuUsage = getFiniteMetric(event.cpuUsage);
      const memoryUsage = getFiniteMetric(event.memoryUsage);
      const memoryUsagePercent = getFiniteMetric(event.memoryUsagePercent);

      if (!localSearch || (cpuUsage === null && memoryUsage === null && memoryUsagePercent === null)) {
        return;
      }

      const current = grouped.get(localSearch) || {
        algorithm: localSearch,
        sampleCount: 0,
        cpuTotal: 0,
        cpuCount: 0,
        memoryTotal: 0,
        memoryCount: 0,
        memoryPercentTotal: 0,
        memoryPercentCount: 0,
      };

      current.sampleCount += 1;

      if (cpuUsage !== null) {
        current.cpuTotal += cpuUsage;
        current.cpuCount += 1;
      }

      if (memoryUsage !== null) {
        current.memoryTotal += memoryUsage;
        current.memoryCount += 1;
      }

      if (memoryUsagePercent !== null) {
        current.memoryPercentTotal += memoryUsagePercent;
        current.memoryPercentCount += 1;
      }

      grouped.set(localSearch, current);
    });

    return [...grouped.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        sampleCount: entry.sampleCount,
        avgCpuUsage: entry.cpuCount > 0 ? entry.cpuTotal / entry.cpuCount : null,
        avgMemoryUsage: entry.memoryCount > 0 ? entry.memoryTotal / entry.memoryCount : null,
        avgMemoryUsagePercent:
          entry.memoryPercentCount > 0 ? entry.memoryPercentTotal / entry.memoryPercentCount : null,
      }))
      .sort(
        (left, right) =>
          getNumericScore(right.avgCpuUsage, Number.NEGATIVE_INFINITY)
          - getNumericScore(left.avgCpuUsage, Number.NEGATIVE_INFINITY)
      );
  }, [monitorSnapshots]);

  const finalRunsByAlgorithm = useMemo(() => {
    const groups = new Map();

    bestSolutionRuns.forEach((run) => {
      const label = run.rclAlgorithm || "Unknown";
      const current = groups.get(label);

      if (!current) {
        groups.set(label, {
          algorithm: label,
          runCount: 1,
          bestRun: run,
        });
        return;
      }

      current.runCount += 1;
      current.bestRun = pickPreferredRun(current.bestRun, run);
    });

    return [...groups.values()].sort(
      (left, right) => getNumericScore(right.bestRun?.bestF1Score) - getNumericScore(left.bestRun?.bestF1Score)
    );
  }, [bestSolutionRuns]);

  const finalRunsByRclAlgorithm = useMemo(() => {
    const initialSeedCountByAlgorithm = initialSolutionEvents.reduce((counts, event) => {
      const algorithm = event.rclAlgorithm || "Unknown";
      counts.set(algorithm, (counts.get(algorithm) || 0) + 1);
      return counts;
    }, new Map());

    const groups = new Map();

    bestSolutionRuns.forEach((run) => {
      const algorithm = run.rclAlgorithm || "Unknown";
      const initialEvent = initialEventBySeed.get(run.seedId);
      const finalScore = getFiniteMetric(run.bestF1Score);
      const initialScore = getFiniteMetric(initialEvent?.bestF1Score ?? initialEvent?.currentF1Score);
      const gain = Number.isFinite(finalScore) && Number.isFinite(initialScore)
        ? finalScore - initialScore
        : null;
      const searchLabel = run.localSearch || run.neighborhood || "--";
      const datasetLabel = `${run.trainingFileName || "--"} -> ${run.testingFileName || "--"}`;
      const current = groups.get(algorithm) || {
        algorithm,
        initialSeedCount: initialSeedCountByAlgorithm.get(algorithm) || 0,
        finalSeedCount: 0,
        bestRun: null,
        finalScores: [],
        gains: [],
        searches: new Set(),
        datasets: new Set(),
      };

      current.finalSeedCount += 1;
      current.bestRun = current.bestRun ? pickPreferredRun(current.bestRun, run) : run;
      if (Number.isFinite(finalScore)) {
        current.finalScores.push(finalScore);
      }
      if (Number.isFinite(gain)) {
        current.gains.push(gain);
      }
      current.searches.add(searchLabel);
      current.datasets.add(datasetLabel);
      groups.set(algorithm, current);
    });

    return [...groups.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        initialSeedCount: entry.initialSeedCount,
        finalSeedCount: entry.finalSeedCount,
        bestRun: entry.bestRun,
        avgFinalF1Score: averageMetric(entry.finalScores),
        avgGain: averageMetric(entry.gains),
        searches: [...entry.searches].sort(),
        datasets: [...entry.datasets].sort(),
      }))
      .sort(
        (left, right) =>
          getNumericScore(right.bestRun?.bestF1Score, Number.NEGATIVE_INFINITY)
          - getNumericScore(left.bestRun?.bestF1Score, Number.NEGATIVE_INFINITY)
      );
  }, [bestSolutionRuns, initialEventBySeed, initialSolutionEvents]);

  const dlsOutcomeSummary = useMemo(() => {
    const groups = new Map();

    dlsActivityEvents.forEach((event) => {
      const algorithm = resolveDlsAlgorithmLabel(event);
      const initialEvent = initialEventBySeed.get(event.seedId);
      const localScore = getFiniteMetric(event.bestF1Score ?? event.currentF1Score);
      const initialScore = getFiniteMetric(initialEvent?.bestF1Score ?? initialEvent?.currentF1Score);
      const gain = Number.isFinite(localScore) && Number.isFinite(initialScore)
        ? localScore - initialScore
        : null;
      const rclAlgorithm = event.rclAlgorithm || "Unknown";
      const datasetLabel = `${event.trainingFileName || "--"} -> ${event.testingFileName || "--"}`;
      const linkedFinalRun = preferredRunBySeed.get(event.seedId);
      const finalAlgorithm = resolveDlsAlgorithmLabel(linkedFinalRun || {});
      const current = groups.get(algorithm) || {
        algorithm,
        outcomeSeeds: new Set(),
        finalWins: new Set(),
        bestOutcome: null,
        outcomeScores: [],
        gains: [],
        rclAlgorithms: new Set(),
        datasets: new Set(),
      };

      if (event.seedId) {
        current.outcomeSeeds.add(event.seedId);
      }
      if (event.seedId && finalAlgorithm === algorithm) {
        current.finalWins.add(event.seedId);
      }
      current.bestOutcome = current.bestOutcome
        ? pickPreferredSnapshot(current.bestOutcome, event)
        : event;
      if (Number.isFinite(localScore)) {
        current.outcomeScores.push(localScore);
      }
      if (Number.isFinite(gain)) {
        current.gains.push(gain);
      }
      current.rclAlgorithms.add(rclAlgorithm);
      current.datasets.add(datasetLabel);
      groups.set(algorithm, current);
    });

    return [...groups.values()]
      .map((entry) => ({
        algorithm: entry.algorithm,
        visibleOutcomeSeedCount: entry.outcomeSeeds.size,
        visibleFinalSeedCount: entry.finalWins.size,
        bestOutcome: entry.bestOutcome,
        avgLocalF1Score: averageMetric(entry.outcomeScores),
        avgGain: averageMetric(entry.gains),
        rclAlgorithms: [...entry.rclAlgorithms].sort(),
        datasets: [...entry.datasets].sort(),
      }))
      .sort(
        (left, right) =>
          getNumericScore(right.bestOutcome?.bestF1Score ?? right.bestOutcome?.currentF1Score, Number.NEGATIVE_INFINITY)
          - getNumericScore(left.bestOutcome?.bestF1Score ?? left.bestOutcome?.currentF1Score, Number.NEGATIVE_INFINITY)
      );
  }, [dlsActivityEvents, initialEventBySeed, preferredRunBySeed]);

  const finalizedRuns = useMemo(
    () => bestSolutionRuns,
    [bestSolutionRuns]
  );

  useEffect(() => {
    if (filteredRuns.length === 0) {
      setSelectedSeedId("");
      setSelectedRunDetails(null);
      return;
    }

    const stillExists = filteredRuns.some((run) => run.seedId === selectedSeedId);
    if (!selectedSeedId || !stillExists) {
      setSelectedSeedId(filteredRuns[0].seedId);
    }
  }, [filteredRuns, selectedSeedId]);

  useEffect(() => {
    if (!selectedSeedId) {
      return;
    }

    const liveRun = filteredRuns.find((run) => run.seedId === selectedSeedId);
    if (liveRun) {
      setSelectedRunDetails((currentRun) => mergeRunDetail(currentRun || {}, liveRun));
    }
  }, [filteredRuns, selectedSeedId]);

  useEffect(() => {
    let cancelled = false;

    const loadRunDetails = async () => {
      if (!selectedSeedId) {
        return;
      }

      try {
        setDetailsLoading(true);
        const run = await getMonitorRun(selectedSeedId);

        if (!cancelled && run) {
          setSelectedRunDetails((currentRun) => mergeRunDetail(currentRun || {}, run));
        }
      } catch (runError) {
        if (!cancelled) {
          console.error(runError);
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    };

    loadRunDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedSeedId]);

  useEffect(() => {
    let cancelled = false;

    const loadExecutionRequests = async () => {
      try {
        const launches = await getExecutionLaunches(50);

        if (!cancelled) {
          setExecutionRequests(launches);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error(requestError);
          setExecutionRequests([]);
        }
      }
    };

    loadExecutionRequests();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!executionRequests.length) {
      setSelectedRequestId("");
      setSelectedRequestDetails(null);
      return;
    }

    const availableRequestIds = new Set(executionRequests.map((launch) => launch.requestId).filter(Boolean));
    if (selectedRequestId && availableRequestIds.has(selectedRequestId)) {
      return;
    }

    const preferredRequestId = selectedRunDetails?.requestId
      || filteredRuns.find((run) => run.seedId === selectedSeedId)?.requestId
      || "";

    if (preferredRequestId && availableRequestIds.has(preferredRequestId)) {
      setSelectedRequestId(preferredRequestId);
      return;
    }

    setSelectedRequestId(executionRequests[0]?.requestId || "");
  }, [executionRequests, filteredRuns, selectedRequestId, selectedRunDetails?.requestId, selectedSeedId]);

  useEffect(() => {
    let cancelled = false;

    const loadRequestDetails = async () => {
      if (!selectedRequestId) {
        setSelectedRequestDetails(null);
        return;
      }

      try {
        setRequestDetailsLoading(true);
        const launch = await getExecutionLaunch(selectedRequestId, {
          includeMonitor: true,
          historyLimit: 2000,
          eventLimit: 5000,
        });

        if (!cancelled) {
          setSelectedRequestDetails(launch);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error(requestError);
          setSelectedRequestDetails(null);
        }
      } finally {
        if (!cancelled) {
          setRequestDetailsLoading(false);
        }
      }
    };

    loadRequestDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedRequestId]);

  const overview = useMemo(() => {
    const activeRuns = filteredRuns.filter((run) => run.status !== "completed").length;
    const completedRuns = filteredRuns.filter((run) => run.status === "completed").length;
    const bestRun = filteredRuns.reduce((currentBest, run) => {
      if (!currentBest) {
        return run;
      }

      return (run.bestF1Score ?? -1) > (currentBest.bestF1Score ?? -1) ? run : currentBest;
    }, null);

    const datasetPairs = new Set(
      filteredRuns
        .map((run) => `${run.trainingFileName || "--"}|${run.testingFileName || "--"}`)
        .filter((pair) => !pair.startsWith("--"))
    );

    return {
      activeRuns,
      completedRuns,
      initialSolutions: initialSolutionEvents.length,
      localSearchOutcomes: localSearchOutcomeEvents.length,
      progressSnapshots: localSearchProgressEvents.length,
      bestSolutions: bestSolutionRuns.length,
      bestSolutionSnapshots: monitorSnapshots.filter((event) => event.topic === "BEST_SOLUTION_TOPIC").length,
      bestRun,
      datasetPairs: datasetPairs.size,
      algorithms: new Set(filteredRuns.map((run) => run.rclAlgorithm).filter(Boolean)).size,
    };
  }, [
    filteredRuns,
    initialSolutionEvents.length,
    localSearchOutcomeEvents.length,
    localSearchProgressEvents.length,
    monitorSnapshots,
    bestSolutionRuns.length,
  ]);

  const analyticsOverview = useMemo(() => {
    const uniqueSeeds = new Set(monitorSnapshots.map((event) => event.seedId).filter(Boolean));
    const initialScores = monitorSnapshots
      .filter((event) => event.topic === "INITIAL_SOLUTION_TOPIC")
      .map((event) => event.bestF1Score ?? event.currentF1Score);

    return {
      rawSnapshots: monitorSnapshots.length,
      rawEvents: filteredSnapshotEvents.length,
      uniqueSeeds: uniqueSeeds.size,
      topics: rawTopicMetrics.length,
      avgInitialF1: averageMetric(initialScores),
    };
  }, [filteredSnapshotEvents.length, monitorSnapshots, rawTopicMetrics.length]);

  const bestAlgorithmOutcome = useMemo(
    () => finalRunsByAlgorithm[0]?.bestRun || null,
    [finalRunsByAlgorithm]
  );

  const improvementSummary = useMemo(() => {
    if (!improvementEvents.length) {
      return {
        total: 0,
        strongest: null,
        latest: null,
      };
    }

    const strongest = improvementEvents.reduce((currentBest, event) => {
      if (!currentBest) {
        return event;
      }

      const currentDelta = getNumericScore(
        (event.bestF1Score ?? event.currentF1Score) - event.previousBestScore,
        Number.NEGATIVE_INFINITY
      );
      const bestDelta = getNumericScore(
        (currentBest.bestF1Score ?? currentBest.currentF1Score) - currentBest.previousBestScore,
        Number.NEGATIVE_INFINITY
      );

      return currentDelta > bestDelta ? event : currentBest;
    }, null);

    return {
      total: improvementEvents.length,
      strongest,
      latest: improvementEvents[0],
    };
  }, [improvementEvents]);

  const activeTimeWindowLabel = useMemo(() => {
    if (selectedTimeWindow === "custom") {
      if (customRangeStart && customRangeEnd) {
        return `${formatDateTime(customRangeStart)} - ${formatDateTime(customRangeEnd)}`;
      }

      if (customRangeStart) {
        return `${t("dashboard.fromLabel")} ${formatDateTime(customRangeStart)}`;
      }

      if (customRangeEnd) {
        return `${t("dashboard.toLabel")} ${formatDateTime(customRangeEnd)}`;
      }
    }

    const currentOption = timeWindowOptions.find((option) => option.value === selectedTimeWindow);
    return currentOption ? t(currentOption.labelKey) : t("dashboard.timeWindowAll");
  }, [customRangeEnd, customRangeStart, selectedTimeWindow, t]);

  const exportFilters = useMemo(
    () => ({
      algorithm: selectedAlgorithm,
      dataset: selectedDataset,
      stage: selectedStageLens,
      status: selectedRunStatus,
      search: selectedSearch,
      timeWindow: selectedTimeWindow,
      customStart: customRangeStart || null,
      customEnd: customRangeEnd || null,
      seedId: selectedSeedId || null,
    }),
    [
      customRangeEnd,
      customRangeStart,
      selectedAlgorithm,
      selectedDataset,
      selectedSeedId,
      selectedRunStatus,
      selectedSearch,
      selectedStageLens,
      selectedTimeWindow,
    ]
  );

  const exportScopeLabel = useMemo(() => {
    switch (selectedExportScope) {
      case "request":
        return t("dashboard.exportScopeRequest");
      case "run":
        return t("dashboard.exportScopeRun");
      case "timeline":
        return t("dashboard.exportScopeTimeline");
      default:
        return t("dashboard.exportScopeVisible");
    }
  }, [selectedExportScope, t]);

  const resetWorkspaceFilters = () => {
    setSelectedAlgorithm("all");
    setSelectedDataset("all");
    setSelectedStageLens("all");
    setSelectedRunStatus("all");
    setSelectedSearch("all");
    setSelectedTimeWindow("15m");
    setCustomRangeStart("");
    setCustomRangeEnd("");
    setSelectedTimelineWindow("15m");
    setTimelineRangeStart("");
    setTimelineRangeEnd("");
    setTimelineTimestampQuery("");
    setSelectedExportScope("visible");
    setSelectedSeedId("");
    setSelectedRequestId("");
  };

  const featuredRun = useMemo(() => {
    const liveRun = filteredRuns.find((run) => run.seedId === selectedSeedId);

    if (liveRun || selectedRunDetails) {
      return mergeRunDetail(selectedRunDetails || {}, liveRun || {});
    }

    return filteredRuns[0] || null;
  }, [filteredRuns, selectedRunDetails, selectedSeedId]);

  const selectedRequestSummary = useMemo(
    () => executionRequests.find((launch) => launch.requestId === selectedRequestId) || null,
    [executionRequests, selectedRequestId]
  );

  const runFocusOptions = useMemo(() => {
    const visibleRuns = filteredRuns.slice(0, 50);

    if (!selectedSeedId || visibleRuns.some((run) => run.seedId === selectedSeedId)) {
      return visibleRuns;
    }

    const selectedRun = filteredRuns.find((run) => run.seedId === selectedSeedId);
    return selectedRun ? [selectedRun, ...visibleRuns] : visibleRuns;
  }, [filteredRuns, selectedSeedId]);

  const safeSelectedSeedId = useMemo(
    () =>
      selectedSeedId && runFocusOptions.some((run) => run.seedId === selectedSeedId)
        ? selectedSeedId
        : "",
    [runFocusOptions, selectedSeedId]
  );

  const safeSelectedRequestId = useMemo(
    () =>
      selectedRequestId && executionRequests.some((launch) => launch.requestId === selectedRequestId)
        ? selectedRequestId
        : "",
    [executionRequests, selectedRequestId]
  );

  const selectedRequestBundle = useMemo(
    () => selectedRequestDetails?.monitor || { runs: [], events: [] },
    [selectedRequestDetails]
  );

  const exportDisabled = useMemo(() => {
    if (selectedExportScope === "request") {
      return !selectedRequestId || requestDetailsLoading;
    }

    if (selectedExportScope === "run" || selectedExportScope === "timeline") {
      return !featuredRun;
    }

    return false;
  }, [featuredRun, requestDetailsLoading, selectedExportScope, selectedRequestId]);

  const customGlobalRangeHelper = useMemo(() => {
    if (customRangeStart || customRangeEnd) {
      if (customRangeStart && customRangeEnd) {
        return `${formatDateTime(customRangeStart)} - ${formatDateTime(customRangeEnd)}`;
      }

      if (customRangeStart) {
        return `${t("dashboard.fromLabel")} ${formatDateTime(customRangeStart)}`;
      }

      return `${t("dashboard.toLabel")} ${formatDateTime(customRangeEnd)}`;
    }

    return t("dashboard.datePickerHint");
  }, [customRangeEnd, customRangeStart, t]);

  const fullHistorySource = useMemo(() => {
    if (!featuredRun?.history?.length) {
      return [];
    }

    return [...featuredRun.history]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((entry, index) => ({
        ...entry,
        order: index + 1,
        solutionFeatures: parseFeatureList(entry.solutionFeatures),
      }));
  }, [featuredRun]);

  const timelineAnchorTimestamp = useMemo(
    () => fullHistorySource[fullHistorySource.length - 1]?.timestamp || featuredRun?.updatedAt || null,
    [featuredRun?.updatedAt, fullHistorySource]
  );

  const customTimelineRangeHelper = useMemo(() => {
    if (timelineRangeStart || timelineRangeEnd) {
      if (timelineRangeStart && timelineRangeEnd) {
        return `${formatDateTime(timelineRangeStart)} - ${formatDateTime(timelineRangeEnd)}`;
      }

      if (timelineRangeStart) {
        return `${t("dashboard.fromLabel")} ${formatDateTime(timelineRangeStart)}`;
      }

      return `${t("dashboard.toLabel")} ${formatDateTime(timelineRangeEnd)}`;
    }

    return t("dashboard.datePickerHint");
  }, [t, timelineRangeEnd, timelineRangeStart]);

  const timelineTimestampSuggestions = useMemo(() => {
    const seen = new Set();

    return [...fullHistorySource]
      .slice(-8)
      .reverse()
      .filter((entry) => entry?.timestamp)
      .map((entry) => ({
        label: `${formatShortTime(entry.timestamp)} · #${entry.order}`,
        value: toDateTimeLocalValue(entry.timestamp).replace("T", " ").slice(0, 16),
      }))
      .filter((entry) => {
        if (!entry.value || seen.has(entry.value)) {
          return false;
        }

        seen.add(entry.value);
        return true;
      });
  }, [fullHistorySource]);

  const timelineRangeBounds = useMemo(
    () => resolveAnchoredTimeRangeBounds(
      selectedTimelineWindow,
      timelineRangeStart,
      timelineRangeEnd,
      timelineAnchorTimestamp
    ),
    [selectedTimelineWindow, timelineRangeStart, timelineRangeEnd, timelineAnchorTimestamp]
  );

  const fullHistory = useMemo(
    () =>
      fullHistorySource.filter(
        (entry) =>
          isTimestampWithinRange(entry?.timestamp, timelineRangeBounds)
          && matchesTimelineTimestampQuery(entry, timelineTimestampQuery)
      ),
    [fullHistorySource, timelineRangeBounds, timelineTimestampQuery]
  );

  const timelineActiveRangeLabel = useMemo(() => {
    if (selectedTimelineWindow === "custom") {
      if (timelineRangeStart && timelineRangeEnd) {
        return `${formatDateTime(timelineRangeStart)} - ${formatDateTime(timelineRangeEnd)}`;
      }

      if (timelineRangeStart) {
        return `${t("dashboard.fromLabel")} ${formatDateTime(timelineRangeStart)}`;
      }

      if (timelineRangeEnd) {
        return `${t("dashboard.toLabel")} ${formatDateTime(timelineRangeEnd)}`;
      }

      if (timelineTimestampQuery) {
        return `${t("dashboard.timelineTimestampSearch")}: ${timelineTimestampQuery}`;
      }

      return t("dashboard.timelineWindowCustom");
    }

    const currentOption = timelineWindowOptions.find((option) => option.value === selectedTimelineWindow);
    return currentOption ? t(currentOption.labelKey) : t("dashboard.timelineWindowAll");
  }, [selectedTimelineWindow, t, timelineRangeEnd, timelineRangeStart, timelineTimestampQuery]);

  const resetTimelineFilters = () => {
    setSelectedTimelineWindow("15m");
    setTimelineRangeStart("");
    setTimelineRangeEnd("");
    setTimelineTimestampQuery("");
  };

  const applyGlobalRelativeRange = (durationMs) => {
    const range = buildRelativeRangeValues(durationMs);
    setGlobalCustomRange(range.start, range.end);
  };

  const applyGlobalTodayRange = () => {
    const range = buildTodayRangeValues();
    setGlobalCustomRange(range.start, range.end);
  };

  const setGlobalRangeEndToNow = () => {
    setGlobalCustomRange(customRangeStart, toDateTimeLocalValue(new Date()));
  };

  const fullRunExportSnapshots = useMemo(
    () =>
      featuredRun
        ? fullHistorySource.map((entry) => ({
          ...extractHistorySnapshot(featuredRun, entry),
          order: entry.order,
        }))
        : [],
    [featuredRun, fullHistorySource]
  );

  const timelineExportSnapshots = useMemo(
    () =>
      featuredRun
        ? fullHistory.map((entry) => ({
          ...extractHistorySnapshot(featuredRun, entry),
          order: entry.order,
        }))
        : [],
    [featuredRun, fullHistory]
  );

  const requestExportSnapshots = useMemo(
    () =>
      (selectedRequestBundle.runs || [])
        .flatMap((run) =>
          (run.history || []).map((entry, index) => ({
            ...extractHistorySnapshot(run, entry),
            order: index + 1,
            requestId: entry?.requestId || run?.requestId || selectedRequestId || null,
          }))
        )
        .sort((left, right) => new Date(left.timestamp || 0) - new Date(right.timestamp || 0)),
    [selectedRequestBundle.runs, selectedRequestId]
  );

  const exportSelection = useMemo(() => {
    const commonFilters = {
      ...exportFilters,
      exportScope: selectedExportScope,
    };

    if (selectedExportScope === "request") {
      return {
        prefix: "request-history",
        filters: {
          ...commonFilters,
          requestId: selectedRequestDetails?.requestId || selectedRequestId || null,
          seedId: null,
          timelineWindow: "all",
          timelineTimestampQuery: null,
        },
        request: selectedRequestDetails || selectedRequestSummary || null,
        runs: selectedRequestBundle.runs || [],
        snapshots: requestExportSnapshots,
        events: selectedRequestBundle.events || [],
      };
    }

    if (selectedExportScope === "run" && featuredRun) {
      return {
        prefix: "run-history",
        filters: {
          ...commonFilters,
          requestId: featuredRun.requestId || null,
          seedId: featuredRun.seedId || selectedSeedId || null,
          timelineWindow: "all",
          timelineTimestampQuery: null,
        },
        request: null,
        runs: [featuredRun],
        snapshots: fullRunExportSnapshots,
        events: [],
      };
    }

    if (selectedExportScope === "timeline" && featuredRun) {
      return {
        prefix: "run-timeline",
        filters: {
          ...commonFilters,
          requestId: featuredRun.requestId || null,
          seedId: featuredRun.seedId || selectedSeedId || null,
          timelineWindow: selectedTimelineWindow,
          timelineStart: timelineRangeStart || null,
          timelineEnd: timelineRangeEnd || null,
          timelineTimestampQuery: timelineTimestampQuery || null,
        },
        request: null,
        runs: [featuredRun],
        snapshots: timelineExportSnapshots,
        events: [],
      };
    }

    return {
      prefix: "dashboard-events",
      filters: commonFilters,
      request: null,
      runs: filteredRuns,
      snapshots: monitorSnapshots,
      events,
    };
  }, [
    events,
    exportFilters,
    featuredRun,
    filteredRuns,
    fullRunExportSnapshots,
    monitorSnapshots,
    requestExportSnapshots,
    selectedExportScope,
    selectedRequestDetails,
    selectedRequestId,
    selectedRequestSummary,
    selectedRequestBundle.events,
    selectedRequestBundle.runs,
    selectedSeedId,
    selectedTimelineWindow,
    timelineExportSnapshots,
    timelineRangeEnd,
    timelineRangeStart,
    timelineTimestampQuery,
  ]);

  const handleExportCsv = () => {
    const fileName = `${buildDashboardExportFileName(exportSelection.prefix, exportSelection.filters)}.csv`;
    downloadTextFile(
      fileName,
      buildMonitorSnapshotsCsv(exportSelection.snapshots),
      "text/csv;charset=utf-8"
    );
  };

  const handleExportJson = () => {
    const fileName = `${buildDashboardExportFileName(exportSelection.prefix, exportSelection.filters)}.json`;
    const payload = buildDashboardExportPayload({
      filters: exportSelection.filters,
      request: exportSelection.request,
      runs: exportSelection.runs,
      snapshots: exportSelection.snapshots,
      events: exportSelection.events,
    });

    downloadTextFile(fileName, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  };

  const fullTimelineChartData = useMemo(() => {
    if (!fullHistory.length) {
      return buildEmptyLineData("Best F1-Score", "F1-Score");
    }

    let rollingBest = null;

    return {
      labels: buildSeriesLabels(fullHistory),
      datasets: [
        {
          label: "Best F1-Score",
          data: fullHistory.map((entry) => {
            if (entry.f1Score === null || entry.f1Score === undefined) {
              return rollingBest ?? 0;
            }

            rollingBest = rollingBest === null ? entry.f1Score : Math.max(rollingBest, entry.f1Score);
            return rollingBest;
          }),
          borderColor: "#4361ee",
          backgroundColor: "rgba(67, 97, 238, 0.12)",
          tension: 0.3,
          fill: true,
        },
        {
          label: "F1-Score",
          data: fullHistory.map((entry) => entry.f1Score ?? 0),
          borderColor: "#36c56c",
          backgroundColor: "rgba(54, 197, 108, 0.08)",
          tension: 0.3,
          fill: true,
        },
      ],
    };
  }, [fullHistory]);

  const fullTimelineChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
          },
        },
      },
      elements: {
        point: {
          radius: fullHistory.length > 80 ? 0 : 2,
          hoverRadius: fullHistory.length > 80 ? 3 : 5,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          grid: {
            color: "rgba(31, 41, 55, 0.08)",
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    }),
    [fullHistory.length]
  );

  const resourceChartData = useMemo(() => {
    if (!fullHistory.length) {
      return buildEmptyLineData("CPU Usage", "Memory Usage");
    }

    return {
      labels: buildSeriesLabels(fullHistory),
      datasets: [
        {
          label: "CPU Usage (%)",
          data: fullHistory.map((entry) => entry.cpuUsage ?? 0),
          borderColor: "#ff8c42",
          backgroundColor: "rgba(255, 140, 66, 0.10)",
          tension: 0.25,
          fill: true,
        },
        {
          label: "Memory Usage (%)",
          data: fullHistory.map((entry) => entry.memoryUsagePercent ?? 0),
          borderColor: "#11b5ae",
          backgroundColor: "rgba(17, 181, 174, 0.10)",
          tension: 0.25,
          fill: true,
        },
      ],
    };
  }, [fullHistory]);

  const resourceChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
          },
        },
      },
      elements: {
        point: {
          radius: fullHistory.length > 80 ? 0 : 2,
          hoverRadius: fullHistory.length > 80 ? 3 : 5,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          grid: {
            color: "rgba(31, 41, 55, 0.08)",
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    }),
    [fullHistory.length]
  );

  const featureFrequencyChartData = useMemo(() => {
    if (!bestSolutionRuns.length) {
      return buildEmptyBarData("Feature frequency");
    }

    const counts = new Map();
    bestSolutionRuns.forEach((run) => {
      parseFeatureList(run.solutionFeatures).forEach((feature) => {
        counts.set(feature, (counts.get(feature) || 0) + 1);
      });
    });

    const topFeatures = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10);

    if (topFeatures.length === 0) {
      return buildEmptyBarData("Feature frequency");
    }

    return {
      labels: topFeatures.map(([feature]) => `Feature ${feature}`),
      datasets: [
        {
          label: "Occurrences",
          data: topFeatures.map(([, count]) => count),
          backgroundColor: "#4361ee",
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [bestSolutionRuns]);

  const featureFrequencyChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: "rgba(31, 41, 55, 0.08)",
          },
        },
        y: {
          grid: {
            display: false,
          },
        },
      },
    }),
    []
  );

  const stageDistributionChartData = useMemo(() => {
    const distribution = [
      ["Initial Solution", initialSolutionEvents.length],
      ["Local Search Final", localSearchOutcomeEvents.length],
      ["Best Solution", bestSolutionRuns.length],
    ].filter(([, count]) => count > 0);

    if (!distribution.length) {
      return buildEmptyDoughnutData();
    }

    const colors = ["#4361ee", "#36c56c", "#ff8c42", "#11b5ae", "#8b5cf6", "#ef476f"];

    return {
      labels: distribution.map(([label]) => label),
      datasets: [
        {
          data: distribution.map(([, count]) => count),
          backgroundColor: distribution.map((_, index) => colors[index % colors.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [initialSolutionEvents.length, localSearchOutcomeEvents.length, bestSolutionRuns.length]);

  const stageDistributionOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
          },
        },
      },
      cutout: "64%",
    }),
    []
  );

  const initialSolutionsByAlgorithm = useMemo(() => {
    const grouped = new Map();

    initialSolutionEvents.forEach((event) => {
      const algorithm = event.rclAlgorithm || "Unknown";
      const linkedBestRun = preferredRunBySeed.get(event.seedId);
      const current = grouped.get(algorithm) || {
        algorithm,
        count: 0,
        bestInitialF1Score: Number.NEGATIVE_INFINITY,
        bestFinalF1Score: Number.NEGATIVE_INFINITY,
      };

      current.count += 1;
      current.bestInitialF1Score = Math.max(current.bestInitialF1Score, getNumericScore(event.bestF1Score ?? event.currentF1Score, 0));
      current.bestFinalF1Score = Math.max(current.bestFinalF1Score, getNumericScore(linkedBestRun?.bestF1Score, 0));
      grouped.set(algorithm, current);
    });

    return [...grouped.values()].sort((left, right) => right.count - left.count);
  }, [initialSolutionEvents, preferredRunBySeed]);

  const localSearchOutcomesBySearch = useMemo(() => {
    const grouped = new Map();

    localSearchOutcomeEvents.forEach((event) => {
      const label = event.searchLabel || event.localSearch || event.neighborhood || "Unknown";
      const current = grouped.get(label) || {
        search: label,
        count: 0,
        bestF1Score: Number.NEGATIVE_INFINITY,
      };

      current.count += 1;
      current.bestF1Score = Math.max(current.bestF1Score, getNumericScore(event.bestF1Score ?? event.currentF1Score, 0));
      grouped.set(label, current);
    });

    return [...grouped.values()].sort((left, right) => right.bestF1Score - left.bestF1Score);
  }, [localSearchOutcomeEvents]);

  const initialSolutionsChartData = useMemo(() => {
    if (!initialSolutionsByAlgorithm.length) {
      return buildEmptyBarData("Initial solutions");
    }

    const labels = initialSolutionsByAlgorithm.map((entry) => entry.algorithm);
    const palette = getBarPaletteForLabels(labels, "algorithm");

    return {
      labels,
      datasets: [
        {
          label: "Initial solutions",
          data: initialSolutionsByAlgorithm.map((entry) => entry.count),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [initialSolutionsByAlgorithm]);

  const localSearchPerformanceChartData = useMemo(() => {
    if (!localSearchOutcomesBySearch.length) {
      return buildEmptyBarData("Local-search outcomes");
    }

    const labels = localSearchOutcomesBySearch.map((entry) => entry.search);
    const palette = getBarPaletteForLabels(labels, "search");

    return {
      labels,
      datasets: [
        {
          label: "Best local-search F1-Score",
          data: localSearchOutcomesBySearch.map((entry) => entry.bestF1Score),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [localSearchOutcomesBySearch]);

  const finalSolutionsChartData = useMemo(() => {
    if (!finalRunsByAlgorithm.length) {
      return buildEmptyBarData("Final solutions");
    }

    const labels = finalRunsByAlgorithm.map((entry) => entry.algorithm);
    const palette = getBarPaletteForLabels(labels, "algorithm");

    return {
      labels,
      datasets: [
        {
          label: "Best F1-Score",
          data: finalRunsByAlgorithm.map((entry) => getNumericScore(entry.bestRun?.bestF1Score, 0)),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [finalRunsByAlgorithm]);

  const averageCpuChartData = useMemo(() => {
    if (!resourceAveragesByAlgorithm.length) {
      return buildEmptyBarData("Average CPU");
    }

    const labels = resourceAveragesByAlgorithm.map((entry) => entry.algorithm);
    const palette = getBarPaletteForLabels(labels, "algorithm");

    return {
      labels,
      datasets: [
        {
          label: "Average CPU (%)",
          data: resourceAveragesByAlgorithm.map((entry) => entry.avgCpuUsage ?? 0),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [resourceAveragesByAlgorithm]);

  const averageMemoryChartData = useMemo(() => {
    if (!resourceAveragesByAlgorithm.length) {
      return buildEmptyBarData("Average memory");
    }

    const labels = resourceAveragesByAlgorithm.map((entry) => entry.algorithm);
    const palette = getBarPaletteForLabels(labels, "algorithm");

    return {
      labels,
      datasets: [
        {
          label: "Average Memory (%)",
          data: resourceAveragesByAlgorithm.map((entry) => entry.avgMemoryUsagePercent ?? 0),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [resourceAveragesByAlgorithm]);

  const averageCpuByLocalSearchChartData = useMemo(() => {
    if (!resourceAveragesByLocalSearch.length) {
      return buildEmptyBarData("Average CPU");
    }

    const labels = resourceAveragesByLocalSearch.map((entry) => entry.algorithm);
    const palette = getBarPaletteForLabels(labels, "search");

    return {
      labels,
      datasets: [
        {
          label: "Average CPU (%)",
          data: resourceAveragesByLocalSearch.map((entry) => entry.avgCpuUsage ?? 0),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [resourceAveragesByLocalSearch]);

  const averageMemoryByLocalSearchChartData = useMemo(() => {
    if (!resourceAveragesByLocalSearch.length) {
      return buildEmptyBarData("Average memory");
    }

    const labels = resourceAveragesByLocalSearch.map((entry) => entry.algorithm);
    const palette = getBarPaletteForLabels(labels, "search");

    return {
      labels,
      datasets: [
        {
          label: "Average Memory (%)",
          data: resourceAveragesByLocalSearch.map((entry) => entry.avgMemoryUsagePercent ?? 0),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [resourceAveragesByLocalSearch]);

  const hourlyActivityMetrics = useMemo(() => {
    const buckets = new Map();

    monitorSnapshots.forEach((event) => {
      const bucketKey = startOfHourIso(getEntryTimestamp(event));
      if (!bucketKey) {
        return;
      }

      const score = Number(event.bestF1Score ?? event.currentF1Score);
      const currentBucket = buckets.get(bucketKey) || {
        timestamp: bucketKey,
        count: 0,
        uniqueSeeds: new Set(),
        bestScore: null,
      };

      currentBucket.count += 1;
      if (event.seedId) {
        currentBucket.uniqueSeeds.add(event.seedId);
      }
      if (Number.isFinite(score)) {
        currentBucket.bestScore = currentBucket.bestScore === null
          ? score
          : Math.max(currentBucket.bestScore, score);
      }

      buckets.set(bucketKey, currentBucket);
    });

    return [...buckets.values()]
      .sort((left, right) => getSortableDateValue(left.timestamp) - getSortableDateValue(right.timestamp))
      .map((bucket) => ({
        ...bucket,
        uniqueSeedCount: bucket.uniqueSeeds.size,
      }));
  }, [monitorSnapshots]);

  const hourlyActivityChartData = useMemo(() => {
    if (!hourlyActivityMetrics.length) {
      return buildEmptyBarData("Hourly activity");
    }

    return {
      labels: hourlyActivityMetrics.map((entry) => formatHourBucketLabel(entry.timestamp)),
      datasets: [
        {
          type: "bar",
          label: t("dashboard.hourlySnapshotsSeries"),
          data: hourlyActivityMetrics.map((entry) => entry.count),
          backgroundColor: "rgba(67, 97, 238, 0.72)",
          borderColor: "#4361ee",
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
          yAxisID: "y",
        },
        {
          type: "line",
          label: t("dashboard.hourlyBestF1Series"),
          data: hourlyActivityMetrics.map((entry) => entry.bestScore),
          borderColor: "#36c56c",
          backgroundColor: "rgba(54, 197, 108, 0.12)",
          pointBackgroundColor: "#36c56c",
          pointRadius: hourlyActivityMetrics.length > 48 ? 0 : 3,
          pointHoverRadius: hourlyActivityMetrics.length > 48 ? 3 : 5,
          tension: 0.3,
          fill: true,
          yAxisID: "y1",
        },
      ],
    };
  }, [hourlyActivityMetrics, t]);

  const hourlyActivityChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(31, 41, 55, 0.08)",
          },
          title: {
            display: true,
            text: t("dashboard.hourlySnapshotsAxis"),
          },
        },
        y1: {
          position: "right",
          beginAtZero: true,
          suggestedMax: 100,
          grid: {
            drawOnChartArea: false,
          },
          title: {
            display: true,
            text: t("dashboard.hourlyBestF1Axis"),
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    }),
    [t]
  );

  const rawTopicVolumeChartData = useMemo(() => {
    if (!rawTopicMetrics.length) {
      return buildEmptyBarData("Topic volume");
    }

    const labels = rawTopicMetrics.map((entry) => formatTopicLabel(entry.topic));
    const palette = getBarPaletteForLabels(labels, "search");

    return {
      labels,
      datasets: [
        {
          label: "Visible snapshots",
          data: rawTopicMetrics.map((entry) => entry.count),
          backgroundColor: palette.backgroundColor,
          hoverBackgroundColor: palette.hoverBackgroundColor,
          borderColor: palette.borderColor,
          borderWidth: 1,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    };
  }, [rawTopicMetrics]);

  const resourceSummaryTableData = useMemo(
    () => ({
      columns: [
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Avg CPU", accessor: "avgCpu", align: "left" },
        { Header: "Avg Memory", accessor: "avgMemory", align: "left" },
        { Header: "Avg Memory %", accessor: "avgMemoryPercent", align: "left" },
        { Header: "Samples", accessor: "samples", align: "left" },
      ],
      rows: resourceAveragesByAlgorithm.map((entry) => ({
        algorithm: entry.algorithm,
        avgCpu: formatMetric(entry.avgCpuUsage, "%"),
        avgMemory: formatMetric(entry.avgMemoryUsage, " MB"),
        avgMemoryPercent: formatMetric(entry.avgMemoryUsagePercent, "%"),
        samples: entry.sampleCount,
      })),
    }),
    [resourceAveragesByAlgorithm]
  );

  const localSearchResourceSummaryTableData = useMemo(
    () => ({
      columns: [
        { Header: "Local Search", accessor: "algorithm", align: "left" },
        { Header: "Avg CPU", accessor: "avgCpu", align: "left" },
        { Header: "Avg Memory", accessor: "avgMemory", align: "left" },
        { Header: "Avg Memory %", accessor: "avgMemoryPercent", align: "left" },
        { Header: "Samples", accessor: "samples", align: "left" },
      ],
      rows: resourceAveragesByLocalSearch.map((entry) => ({
        algorithm: entry.algorithm,
        avgCpu: formatMetric(entry.avgCpuUsage, "%"),
        avgMemory: formatMetric(entry.avgMemoryUsage, " MB"),
        avgMemoryPercent: formatMetric(entry.avgMemoryUsagePercent, "%"),
        samples: entry.sampleCount,
      })),
    }),
    [resourceAveragesByLocalSearch]
  );

  const finalSolutionsChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          grid: {
            color: "rgba(31, 41, 55, 0.08)",
          },
        },
        x: {
          grid: {
            display: false,
          },
        },
      },
    }),
    []
  );

  const initialSolutionsTableData = useMemo(
    () => ({
      columns: [
        { Header: "Time", accessor: "timestamp", align: "left" },
        { Header: "RCL", accessor: "algorithm", align: "left" },
        { Header: "Initial Solution", accessor: "solution", align: "left" },
        { Header: "Initial F1", accessor: "initialF1", align: "left" },
        { Header: "RCL / Solution Size", accessor: "sizes", align: "left" },
        { Header: "Search Plan", accessor: "searchPlan", align: "left" },
        { Header: "Best After Search", accessor: "bestAfterSearch", align: "left" },
        { Header: "Dataset", accessor: "dataset", align: "left" },
      ],
      rows: initialSolutionEvents.map((event) => {
        const linkedBestRun = preferredRunBySeed.get(event.seedId);
        const initialScore = event.bestF1Score ?? event.currentF1Score;

        return {
          timestamp: (
            <MDBox>
              <MDTypography variant="button" fontWeight="medium" color="dark">
                {formatShortTime(event.timestamp)}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {formatRelativeTime(event.timestamp)}
              </MDTypography>
            </MDBox>
          ),
          algorithm: event.rclAlgorithm || "--",
          solution: (
            <MDBox>
              <MDTypography variant="button" fontWeight="medium" color="dark">
                {formatFeatureSubset(event.solutionFeatures, 10)}
              </MDTypography>
              <MDTypography
                component={Link}
                to={`/dashboard/runs/${event.seedId}`}
                variant="caption"
                color="info"
                sx={{ textDecoration: "none" }}
              >
                {shortenSeed(event.seedId)}
              </MDTypography>
            </MDBox>
          ),
          initialF1: formatCompactPercent(event.bestF1Score ?? event.currentF1Score),
          sizes: `RCL ${resolveCount(event.rclSize, event.rclFeatures?.length || 0)} / Sol ${resolveCount(event.solutionSize, event.solutionFeatures?.length || 0)}`,
          searchPlan: (
            <MDBox>
              <MDTypography variant="button" fontWeight="medium" color="dark">
                {formatSearchPlan(event.enabledLocalSearches)}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {event.neighborhood || "--"}
              </MDTypography>
            </MDBox>
          ),
          bestAfterSearch: (
            <MDBox>
              <Chip
                label={formatCompactPercent(linkedBestRun?.bestF1Score)}
                color="info"
                size="small"
                variant="outlined"
              />
              <MDTypography variant="caption" display="block" color="text" mt={0.5}>
                {formatScoreDelta(linkedBestRun?.bestF1Score, initialScore)}
              </MDTypography>
            </MDBox>
          ),
          dataset: `${event.trainingFileName || "--"} -> ${event.testingFileName || "--"}`,
        };
      }),
    }),
    [initialSolutionEvents, preferredRunBySeed]
  );

  const localSearchTableData = useMemo(
    () => ({
      columns: [
        { Header: "Search", accessor: "search", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Iteration", accessor: "iteration", align: "left" },
        { Header: "Solution", accessor: "solution", align: "left" },
        { Header: "Local F1", accessor: "localF1", align: "left" },
        { Header: "Delta vs initial", accessor: "deltaInitial", align: "left" },
        { Header: "Final Best", accessor: "finalBest", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
      ],
      rows: localSearchOutcomeEvents.map((event) => {
        const linkedBestRun = preferredRunBySeed.get(event.seedId);
        const initialEvent = initialEventBySeed.get(event.seedId);
        const localScore = event.bestF1Score ?? event.currentF1Score;

        return {
          search: event.searchLabel,
          algorithm: event.rclAlgorithm || "--",
          iteration: event.iterationLocalSearch ?? "--",
          solution: (
            <MDBox>
              <MDTypography variant="button" fontWeight="medium" color="dark">
                {formatFeatureSubset(event.solutionFeatures, 10)}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {`Sol ${resolveCount(event.solutionSize, event.solutionFeatures?.length || 0)} / RCL ${resolveCount(event.rclSize, event.rclFeatures?.length || 0)}`}
              </MDTypography>
            </MDBox>
          ),
          localF1: (
            <Chip
              label={formatCompactPercent(localScore)}
              color="success"
              size="small"
              variant="outlined"
            />
          ),
          deltaInitial: formatScoreDelta(localScore, initialEvent?.bestF1Score ?? initialEvent?.currentF1Score),
          finalBest: formatCompactPercent(linkedBestRun?.bestF1Score),
          seed: (
            <MDTypography
              component={Link}
              to={`/dashboard/runs/${event.seedId}`}
              variant="button"
              fontWeight="medium"
              color="info"
              sx={{ textDecoration: "none" }}
            >
              {shortenSeed(event.seedId)}
            </MDTypography>
          ),
        };
      }),
    }),
    [initialEventBySeed, localSearchOutcomeEvents, preferredRunBySeed]
  );

  const localSearchProgressTableData = useMemo(
    () => ({
      columns: [
        { Header: "Search", accessor: "search", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Iteration", accessor: "iteration", align: "left" },
        { Header: "Candidate", accessor: "candidate", align: "left" },
        { Header: "F1", accessor: "f1", align: "left" },
        { Header: "Delta", accessor: "delta", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
      ],
      rows: localSearchProgressEvents.map((event) => ({
        search: event.localSearch || event.neighborhood || "--",
        algorithm: event.rclAlgorithm || "--",
        iteration: event.iterationLocalSearch ?? "--",
        candidate: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatFeatureSubset(event.solutionFeatures, 10)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {`Sol ${resolveCount(event.solutionSize, event.solutionFeatures?.length || 0)} / RCL ${resolveCount(event.rclSize, event.rclFeatures?.length || 0)}`}
            </MDTypography>
          </MDBox>
        ),
        f1: formatCompactPercent(event.bestF1Score ?? event.currentF1Score),
        delta: formatScoreDelta(
          event.bestF1Score ?? event.currentF1Score,
          event.previousBestF1Score
        ),
        seed: (
          <MDTypography
            component={Link}
            to={`/dashboard/runs/${event.seedId}`}
            variant="button"
            fontWeight="medium"
            color="info"
            sx={{ textDecoration: "none" }}
          >
            {shortenSeed(event.seedId)}
          </MDTypography>
        ),
      })),
    }),
    [localSearchProgressEvents]
  );

  const rawTopicTableData = useMemo(
    () => ({
      columns: [
        { Header: "Topic", accessor: "topic", align: "left" },
        { Header: "Snapshots", accessor: "count", align: "left" },
        { Header: "Unique Seeds", accessor: "uniqueSeeds", align: "left" },
        { Header: "Avg F1", accessor: "avgScore", align: "left" },
        { Header: "Best F1", accessor: "bestScore", align: "left" },
      ],
      rows: rawTopicMetrics.map((entry) => ({
        topic: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatTopicLabel(entry.topic)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {entry.topic}
            </MDTypography>
          </MDBox>
        ),
        count: entry.count,
        uniqueSeeds: entry.uniqueSeedCount,
        avgScore: formatCompactPercent(entry.averageScore),
        bestScore: (
          <Chip
            label={formatCompactPercent(entry.bestScore)}
            color="info"
            size="small"
            variant="outlined"
          />
        ),
      })),
    }),
    [rawTopicMetrics]
  );

  const rawSolutionFeedTableData = useMemo(
    () => ({
      columns: [
        { Header: "Time", accessor: "timestamp", align: "left" },
        { Header: "Topic", accessor: "topic", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Search / Stage", accessor: "search", align: "left" },
        { Header: "Solution", accessor: "solution", align: "left" },
        { Header: "F1", accessor: "score", align: "left" },
        { Header: "Delta", accessor: "delta", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
        { Header: "Dataset", accessor: "dataset", align: "left" },
      ],
      rows: monitorSnapshots.map((event) => ({
        timestamp: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatShortTime(event.timestamp)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {formatRelativeTime(event.timestamp)}
            </MDTypography>
          </MDBox>
        ),
        topic: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatTopicLabel(event.topic)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {getStageLabel(event.stage)}
            </MDTypography>
          </MDBox>
        ),
        algorithm: event.rclAlgorithm || "--",
        search: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {event.localSearch || event.neighborhood || "--"}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {`Iter ${event.iterationLocalSearch ?? "--"}`}
            </MDTypography>
          </MDBox>
        ),
        solution: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatFeatureSubset(event.solutionFeatures, 10)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {`Sol ${resolveCount(event.solutionSize, event.solutionFeatures?.length || 0)} / RCL ${resolveCount(event.rclSize, event.rclFeatures?.length || 0)}`}
            </MDTypography>
          </MDBox>
        ),
        score: (
          <Chip
            label={formatCompactPercent(event.bestF1Score ?? event.currentF1Score)}
            color="success"
            size="small"
            variant="outlined"
          />
        ),
        delta: formatScoreDelta(
          event.bestF1Score ?? event.currentF1Score,
          event.previousBestF1Score
        ),
        seed: event.seedId ? (
          <MDTypography
            component={Link}
            to={`/dashboard/runs/${event.seedId}`}
            variant="button"
            fontWeight="medium"
            color="info"
            sx={{ textDecoration: "none" }}
          >
            {shortenSeed(event.seedId)}
          </MDTypography>
        ) : "--",
        dataset: `${event.trainingFileName || "--"} -> ${event.testingFileName || "--"}`,
      })),
    }),
    [monitorSnapshots]
  );

  const bestSolutionsDetailedTableData = useMemo(
    () => ({
      columns: [
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Workflow", accessor: "workflow", align: "left" },
        { Header: "Best Solution", accessor: "solution", align: "left" },
        { Header: "Best F1", accessor: "bestF1", align: "left" },
        { Header: "Search / Neighborhood", accessor: "search", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
      ],
      rows: bestSolutionRuns.map((run) => {
        const workflowSteps = deriveWorkflowSteps(run, initialEventBySeed.get(run.seedId));

        return {
          algorithm: run.rclAlgorithm || "--",
          workflow: workflowSteps.join(" -> ") || "--",
          solution: formatFeatureSubset(run.solutionFeatures, 10),
          bestF1: (
            <Chip
              label={formatCompactPercent(run.bestF1Score)}
              color="success"
              size="small"
              variant="outlined"
            />
          ),
          search: `${run.localSearch || "--"} / ${run.neighborhood || "--"}`,
          seed: (
            <MDTypography
              component={Link}
              to={`/dashboard/runs/${run.seedId}`}
              variant="button"
              fontWeight="medium"
              color="info"
              sx={{ textDecoration: "none" }}
            >
              {shortenSeed(run.seedId)}
            </MDTypography>
          ),
        };
      }),
    }),
    [bestSolutionRuns, initialEventBySeed]
  );

  const bestSolutionMomentsTableData = useMemo(
    () => ({
      columns: [
        { Header: "Time", accessor: "timestamp", align: "left" },
        { Header: "RCL", accessor: "algorithm", align: "left" },
        { Header: "Best Solution", accessor: "solution", align: "left" },
        { Header: "Best F1", accessor: "bestF1", align: "left" },
        { Header: "Search / Neighborhood", accessor: "search", align: "left" },
        { Header: "Delta vs previous", accessor: "delta", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
        { Header: "Dataset", accessor: "dataset", align: "left" },
      ],
      rows: bestSolutionSnapshotEvents.map((event) => ({
        timestamp: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatShortTime(event.timestamp)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {formatRelativeTime(event.timestamp)}
            </MDTypography>
          </MDBox>
        ),
        algorithm: event.rclAlgorithm || "--",
        solution: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatFeatureSubset(event.solutionFeatures, 10)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {formatDateTime(event.timestamp)}
            </MDTypography>
          </MDBox>
        ),
        bestF1: (
          <Chip
            label={formatCompactPercent(event.bestF1Score ?? event.currentF1Score)}
            color="success"
            size="small"
            variant="outlined"
          />
        ),
        search: `${event.localSearch || "--"} / ${event.neighborhood || "--"}`,
        delta: formatScoreDelta(
          event.bestF1Score ?? event.currentF1Score,
          event.previousBestF1Score
        ),
        seed: (
          <MDTypography
            component={Link}
            to={`/dashboard/runs/${event.seedId}`}
            variant="button"
            fontWeight="medium"
            color="info"
            sx={{ textDecoration: "none" }}
          >
            {shortenSeed(event.seedId)}
          </MDTypography>
        ),
        dataset: `${event.trainingFileName || "--"} -> ${event.testingFileName || "--"}`,
      })),
    }),
    [bestSolutionSnapshotEvents]
  );

  const rclAlgorithmSummaryTableData = useMemo(
    () => ({
      columns: [
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Initial Seeds", accessor: "initialSeeds", align: "left" },
        { Header: "Visible Final Seeds", accessor: "finalSeeds", align: "left" },
        { Header: "Final Searches", accessor: "search", align: "left" },
        { Header: "Best Run", accessor: "bestRun", align: "left" },
        { Header: "Best F1-Score", accessor: "bestF1Score", align: "left" },
        { Header: "Avg Final F1", accessor: "avgF1Score", align: "left" },
        { Header: "Avg Gain vs initial", accessor: "gain", align: "left" },
        { Header: "Datasets", accessor: "dataset", align: "left" },
      ],
      rows: finalRunsByRclAlgorithm.map((entry) => {
        return {
          algorithm: entry.algorithm,
          initialSeeds: entry.initialSeedCount,
          finalSeeds: entry.finalSeedCount,
          search: entry.searches.join(", ") || "--",
          bestRun: (
            <MDBox>
              <MDTypography variant="button" fontWeight="medium" color="dark">
                {formatFeatureSubset(entry.bestRun?.solutionFeatures, 10)}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {shortenSeed(entry.bestRun?.seedId)}
              </MDTypography>
            </MDBox>
          ),
          bestF1Score: (
            <Chip
              label={formatCompactPercent(entry.bestRun?.bestF1Score)}
              color="success"
              size="small"
              variant="outlined"
            />
          ),
          avgF1Score: formatCompactPercent(entry.avgFinalF1Score),
          gain: formatMetric(entry.avgGain, " pp"),
          dataset: entry.datasets.join(", ") || "--",
        };
      }),
    }),
    [finalRunsByRclAlgorithm]
  );

  const dlsAlgorithmSummaryTableData = useMemo(
    () => ({
      columns: [
        { Header: "DLS Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Visible Outcome Seeds", accessor: "outcomeSeeds", align: "left" },
        { Header: "Final Wins", accessor: "finalSeeds", align: "left" },
        { Header: "Best Outcome", accessor: "bestRun", align: "left" },
        { Header: "Best Local F1", accessor: "bestF1Score", align: "left" },
        { Header: "Avg Local F1", accessor: "avgF1Score", align: "left" },
        { Header: "Avg Gain vs initial", accessor: "gain", align: "left" },
        { Header: "RCL Algorithms", accessor: "rclAlgorithms", align: "left" },
        { Header: "Datasets", accessor: "dataset", align: "left" },
      ],
      rows: dlsOutcomeSummary.map((entry) => ({
        algorithm: entry.algorithm,
        outcomeSeeds: entry.visibleOutcomeSeedCount,
        finalSeeds: entry.visibleFinalSeedCount,
        bestRun: (
          <MDBox>
            <MDTypography variant="button" fontWeight="medium" color="dark">
              {formatFeatureSubset(entry.bestOutcome?.solutionFeatures, 10)}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {`${entry.bestOutcome?.rclAlgorithm || "--"} / ${shortenSeed(entry.bestOutcome?.seedId)}`}
            </MDTypography>
          </MDBox>
        ),
        bestF1Score: (
          <Chip
            label={formatCompactPercent(entry.bestOutcome?.bestF1Score ?? entry.bestOutcome?.currentF1Score)}
            color="success"
            size="small"
            variant="outlined"
          />
        ),
        avgF1Score: formatCompactPercent(entry.avgLocalF1Score),
        gain: formatMetric(entry.avgGain, " pp"),
        rclAlgorithms: entry.rclAlgorithms.join(", ") || "--",
        dataset: entry.datasets.join(", ") || "--",
      })),
    }),
    [dlsOutcomeSummary]
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3} sx={dashboardContentSx(darkMode)}>
        {error ? (
          <MDBox mb={3}>
            <Alert severity="error">{error}</Alert>
          </MDBox>
        ) : null}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard color="dark" icon="rocket_launch" title={t("dashboard.statInitialSolutions")} count={overview.initialSolutions} />
          </Grid>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard color="info" icon="tune" title={t("dashboard.statLocalSearchFinals")} count={overview.localSearchOutcomes} />
          </Grid>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard
              color="success"
              icon="insights"
              title={t("dashboard.statBestFinalF1")}
              count={formatCompactPercent(bestAlgorithmOutcome?.bestF1Score)}
            />
          </Grid>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard
              color="warning"
              icon="emoji_events"
              title={t("dashboard.statBestSolutions")}
              count={overview.bestSolutionSnapshots}
            />
          </Grid>
        </Grid>

        <MDBox mt={4}>
          <Card>
            <MDBox p={3}>
              <MDBox
                display="flex"
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
                flexDirection={{ xs: "column", md: "row" }}
                gap={2}
                mb={3}
              >
                <MDBox>
                  <MDTypography variant="h5" color="dark">
                    {t("dashboard.workspaceTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {activeTab === "overview" ? t("dashboard.workspaceSubtitle") : t(dashboardTabDescriptions[activeTab])}
                  </MDTypography>
                </MDBox>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={`${overview.datasetPairs} datasets`} color="info" size="small" variant="outlined" />
                  <Chip label={`${overview.algorithms} algorithms`} color="secondary" size="small" variant="outlined" />
                  <Chip
                    label={`${filteredRuns.length}/${runs.length || filteredRuns.length} runs`}
                    color="primary"
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${analyticsOverview.rawEvents} live events`}
                    color="warning"
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${analyticsOverview.rawSnapshots} visible snapshots`}
                    color="success"
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={
                      activeFilterCount > 0
                        ? `${activeFilterCount} active filters`
                        : "Global workspace"
                    }
                    color={activeFilterCount > 0 ? "success" : "info"}
                    size="small"
                    variant="outlined"
                    onClick={activeFilterCount > 0 ? resetWorkspaceFilters : undefined}
                  />
                  <Chip
                    label={connected ? t("dashboard.realtimeConnected") : t("dashboard.offlineSnapshot")}
                    color={connected ? "success" : "warning"}
                    size="small"
                    variant="outlined"
                  />
                  {loading || detailsLoading ? <CircularProgress size={18} /> : null}
                </Stack>
              </MDBox>

              <Grid container spacing={2.5}>
                <Grid item xs={12} lg={4}>
                  <MDBox sx={filterPanelSx(darkMode)}>
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <MDBox>
                        <MDTypography variant="button" fontWeight="medium" sx={filterPanelHeadingSx(darkMode)}>
                          {t("dashboard.dataScopeTitle")}
                        </MDTypography>
                        <MDTypography variant="caption" display="block" sx={filterPanelCaptionSx(darkMode)}>
                          {t("dashboard.dataScopeSubtitle")}
                        </MDTypography>
                      </MDBox>
                      <Chip label={t("dashboard.filterBase")} color="info" size="small" variant="outlined" />
                    </MDBox>

                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="selected-algorithm-label">{t("dashboard.filterAlgorithm")}</InputLabel>
                          <Select
                            labelId="selected-algorithm-label"
                            value={selectedAlgorithm}
                            label={t("dashboard.filterAlgorithm")}
                            onChange={(event) => setSelectedAlgorithm(event.target.value)}
                          >
                            <MenuItem value="all">{t("dashboard.allAlgorithms")}</MenuItem>
                            {algorithmOptions.map((algorithm) => (
                              <MenuItem key={algorithm} value={algorithm}>
                                {algorithm}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid item xs={12}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="selected-dataset-label">{t("dashboard.filterDataset")}</InputLabel>
                          <Select
                            labelId="selected-dataset-label"
                            value={selectedDataset}
                            label={t("dashboard.filterDataset")}
                            onChange={(event) => setSelectedDataset(event.target.value)}
                          >
                            <MenuItem value="all">{t("dashboard.allDatasets")}</MenuItem>
                            {datasetOptions.map((dataset) => (
                              <MenuItem key={dataset.key} value={dataset.key}>
                                {dataset.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid item xs={12}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="selected-time-window-label">{t("dashboard.filterTimeWindow")}</InputLabel>
                          <Select
                            labelId="selected-time-window-label"
                            value={selectedTimeWindow}
                            label={t("dashboard.filterTimeWindow")}
                            onChange={(event) => setSelectedTimeWindow(event.target.value)}
                          >
                            {timeWindowOptions.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>

                      {selectedTimeWindow === "custom" ? (
                        <>
                          <Grid item xs={12}>
                            <FriendlyDateTimeField
                              label={t("dashboard.filterFrom")}
                              value={customRangeStart}
                              onChange={setCustomRangeStart}
                              helperText={customGlobalRangeHelper}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <FriendlyDateTimeField
                              label={t("dashboard.filterTo")}
                              value={customRangeEnd}
                              onChange={setCustomRangeEnd}
                              helperText={t("dashboard.datePickerQuickHint")}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip
                                label={t("dashboard.timelineWindowLast15Minutes")}
                                clickable
                                size="small"
                                color="info"
                                variant="outlined"
                                onClick={() => applyGlobalRelativeRange(15 * 60 * 1000)}
                              />
                              <Chip
                                label={t("dashboard.timelineWindowLastHour")}
                                clickable
                                size="small"
                                color="info"
                                variant="outlined"
                                onClick={() => applyGlobalRelativeRange(60 * 60 * 1000)}
                              />
                              <Chip
                                label={t("dashboard.timeWindowLast24Hours")}
                                clickable
                                size="small"
                                color="info"
                                variant="outlined"
                                onClick={() => applyGlobalRelativeRange(24 * 60 * 60 * 1000)}
                              />
                              <Chip
                                label={t("dashboard.quickToday")}
                                clickable
                                size="small"
                                color="secondary"
                                variant="outlined"
                                onClick={applyGlobalTodayRange}
                              />
                              <Chip
                                label={t("dashboard.quickSetEndNow")}
                                clickable
                                size="small"
                                color="secondary"
                                variant="outlined"
                                onClick={setGlobalRangeEndToNow}
                              />
                            </Stack>
                          </Grid>
                        </>
                      ) : null}
                    </Grid>
                  </MDBox>
                </Grid>

                <Grid item xs={12} lg={5}>
                  <MDBox sx={filterPanelSx(darkMode)}>
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <MDBox>
                        <MDTypography variant="button" fontWeight="medium" sx={filterPanelHeadingSx(darkMode)}>
                          {t("dashboard.pipelineLensTitle")}
                        </MDTypography>
                        <MDTypography variant="caption" display="block" sx={filterPanelCaptionSx(darkMode)}>
                          {t("dashboard.pipelineLensSubtitle")}
                        </MDTypography>
                      </MDBox>
                      <Chip label={t("dashboard.filterMonitor")} color="warning" size="small" variant="outlined" />
                    </MDBox>

                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="selected-stage-lens-label">{t("dashboard.filterStage")}</InputLabel>
                          <Select
                            labelId="selected-stage-lens-label"
                            value={selectedStageLens}
                            label={t("dashboard.filterStage")}
                            onChange={(event) => setSelectedStageLens(event.target.value)}
                          >
                            {stageLensOptions.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid item xs={12} md={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="selected-run-status-label">{t("dashboard.filterStatus")}</InputLabel>
                          <Select
                            labelId="selected-run-status-label"
                            value={selectedRunStatus}
                            label={t("dashboard.filterStatus")}
                            onChange={(event) => setSelectedRunStatus(event.target.value)}
                          >
                            <MenuItem value="all">{t("dashboard.allStatuses")}</MenuItem>
                            {runStatusOptions.map((status) => (
                              <MenuItem key={status} value={status}>
                                {formatWorkspaceLabel(status)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>

                      <Grid item xs={12} md={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="selected-search-label">{t("dashboard.filterSearch")}</InputLabel>
                          <Select
                            labelId="selected-search-label"
                            value={selectedSearch}
                            label={t("dashboard.filterSearch")}
                            onChange={(event) => setSelectedSearch(event.target.value)}
                          >
                            <MenuItem value="all">{t("dashboard.allSearches")}</MenuItem>
                            {searchOptions.map((search) => (
                              <MenuItem key={search} value={search}>
                                {search}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>
                  </MDBox>
                </Grid>

                <Grid item xs={12} lg={3}>
                  <MDBox sx={filterPanelSx(darkMode)}>
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <MDBox>
                        <MDTypography variant="button" fontWeight="medium" sx={filterPanelHeadingSx(darkMode)}>
                          {t("dashboard.executionFocusTitle")}
                        </MDTypography>
                        <MDTypography variant="caption" display="block" sx={filterPanelCaptionSx(darkMode)}>
                          {t("dashboard.executionFocusSubtitle")}
                        </MDTypography>
                      </MDBox>
                      <Chip label={t("dashboard.filterFocus")} color="secondary" size="small" variant="outlined" />
                    </MDBox>

                    <FormControl size="small" fullWidth>
                      <InputLabel id="selected-run-label">{t("dashboard.executionFocus")}</InputLabel>
                      <Select
                        labelId="selected-run-label"
                        value={safeSelectedSeedId}
                        label={t("dashboard.executionFocus")}
                        onChange={(event) => setSelectedSeedId(event.target.value)}
                      >
                        <MenuItem value="">Auto highlight latest run</MenuItem>
                        {runFocusOptions.map((run) => (
                          <MenuItem key={run.seedId} value={run.seedId}>
                            {`${run.rclAlgorithm || "Run"} / ${shortenSeed(run.seedId)} / ${formatCompactPercent(run.bestF1Score)}`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Divider sx={{ my: 2 }} />

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        label={
                          selectedAlgorithm === "all"
                            ? t("dashboard.allAlgorithms")
                            : `Algorithm: ${selectedAlgorithm}`
                        }
                        color="info"
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={
                          selectedStageLens === "all"
                            ? t("dashboard.allStages")
                            : `Stage: ${formatWorkspaceLabel(selectedStageLens)}`
                        }
                        color="warning"
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${t("dashboard.filterTimeWindow")}: ${activeTimeWindowLabel}`}
                        color="secondary"
                        size="small"
                        variant="outlined"
                      />
                    </Stack>

                    <Divider sx={{ my: 2 }} />

                    <FormControl size="small" fullWidth>
                      <InputLabel id="export-scope-label">{t("dashboard.exportScopeLabel")}</InputLabel>
                      <Select
                        labelId="export-scope-label"
                        value={selectedExportScope}
                        label={t("dashboard.exportScopeLabel")}
                        onChange={(event) => setSelectedExportScope(event.target.value)}
                      >
                        <MenuItem value="visible">{t("dashboard.exportScopeVisible")}</MenuItem>
                        <MenuItem value="request" disabled={!executionRequests.length}>
                          {t("dashboard.exportScopeRequest")}
                        </MenuItem>
                        <MenuItem value="run" disabled={!featuredRun}>
                          {t("dashboard.exportScopeRun")}
                        </MenuItem>
                        <MenuItem value="timeline" disabled={!featuredRun}>
                          {t("dashboard.exportScopeTimeline")}
                        </MenuItem>
                      </Select>
                    </FormControl>

                    {selectedExportScope === "request" ? (
                      <FormControl size="small" fullWidth sx={{ mt: 2 }}>
                        <InputLabel id="selected-request-export-label">{t("dashboard.exportRequestLabel")}</InputLabel>
                        <Select
                          labelId="selected-request-export-label"
                          value={safeSelectedRequestId}
                          label={t("dashboard.exportRequestLabel")}
                          onChange={(event) => setSelectedRequestId(event.target.value)}
                          disabled={!executionRequests.length}
                        >
                          {executionRequests.map((launch) => (
                            <MenuItem key={launch.requestId} value={launch.requestId}>
                              {`${shortenSeed(launch.requestId)} / ${(launch.algorithms || []).join(", ")} / ${formatDateTime(launch.requestedAt)}`}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : null}

                    <MDTypography variant="caption" color="text" display="block" mt={1}>
                      {selectedExportScope === "request"
                        ? requestDetailsLoading
                          ? t("dashboard.exportRequestLoading")
                          : t("dashboard.exportScopeHintRequest", {
                            requestId: shortenSeed(selectedRequestDetails?.requestId || selectedRequestId || "--"),
                            runs: selectedRequestBundle.runs?.length || 0,
                            snapshots: requestExportSnapshots.length,
                          })
                        : selectedExportScope === "run"
                        ? t("dashboard.exportScopeHintRun")
                        : selectedExportScope === "timeline"
                          ? t("dashboard.exportScopeHintTimeline")
                          : t("dashboard.exportScopeHintVisible")}
                    </MDTypography>

                    <Divider sx={{ my: 2 }} />

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <MDButton
                        variant="gradient"
                        color="info"
                        fullWidth
                        disabled={exportDisabled}
                        startIcon={<Icon>download</Icon>}
                        onClick={handleExportCsv}
                      >
                        {`${t("dashboard.exportCsv")} · ${exportScopeLabel}`}
                      </MDButton>
                      <MDButton
                        variant="outlined"
                        color="info"
                        fullWidth
                        disabled={exportDisabled}
                        startIcon={<Icon>file_download</Icon>}
                        onClick={handleExportJson}
                      >
                        {`${t("dashboard.exportJson")} · ${exportScopeLabel}`}
                      </MDButton>
                    </Stack>
                  </MDBox>
                </Grid>
              </Grid>

              <MDBox
                mt={2.5}
                px={2}
                py={1.5}
                sx={{
                  borderRadius: 3,
                  background: "rgba(67, 97, 238, 0.06)",
                  border: "1px dashed rgba(67, 97, 238, 0.18)",
                }}
              >
                <MDBox
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDTypography variant="button" color="text">
                    {`${initialSolutionEvents.length} initial solutions, ${localSearchProgressEvents.length} progress snapshots, ${localSearchOutcomeEvents.length} local-search finals, and ${bestSolutionRuns.length} best solutions under the current filters`}
                  </MDTypography>
                  {activeFilterCount > 0 ? (
                    <Chip
                      label={t("dashboard.clearAllFilters")}
                      color="primary"
                      size="small"
                      variant="outlined"
                      onClick={resetWorkspaceFilters}
                    />
                  ) : null}
                </MDBox>
              </MDBox>
            </MDBox>
          </Card>
        </MDBox>

        <MDBox mt={3}>
          <Card>
            <MDBox px={2} pt={1.5} pb={1}>
              <Tabs
                value={activeTab}
                onChange={(_, value) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{
                  minHeight: 56,
                  "& .MuiTabs-indicator": {
                    height: 3,
                    borderRadius: 999,
                  },
                }}
              >
                {dashboardTabs.map((tab) => (
                  <Tab
                    key={tab.value}
                    value={tab.value}
                    label={t(tab.labelKey)}
                    icon={<Icon fontSize="small">{tab.icon}</Icon>}
                    iconPosition="start"
                    sx={{
                      minHeight: 52,
                      minWidth: 140,
                      borderRadius: 2,
                      textTransform: "none",
                      fontWeight: 500,
                    }}
                  />
                ))}
              </Tabs>
            </MDBox>
          </Card>
        </MDBox>

        {activeTab === "overview" ? (
        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} xl={8}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Card>
                    <MDBox p={3}>
                      <MDBox
                        display="flex"
                        flexDirection={{ xs: "column", md: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                        gap={2}
                        mb={3}
                      >
                        <MDBox>
                          <MDTypography variant="h5" color="dark">
                            {t("dashboard.fullExecutionTimeline")}
                          </MDTypography>
                          <MDTypography variant="button" color="text">
                            {featuredRun
                          ? `${featuredRun.rclAlgorithm || "GRASP-FS"} / ${featuredRun.classifier || "--"} / ${t("dashboard.persistedCheckpoints", { count: fullHistory.length })}`
                          : t("dashboard.waitingMonitorEvents")}
                          </MDTypography>
                        </MDBox>

                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "stretch", md: "center" }}>
                          <Chip
                            label={connected ? t("dashboard.realtimeConnected") : t("dashboard.offlineSnapshot")}
                            color={connected ? "success" : "warning"}
                            size="small"
                            variant="outlined"
                          />
                          {loading || detailsLoading ? <CircularProgress size={18} /> : null}
                        </Stack>
                      </MDBox>

                      {featuredRun ? (
                        <MDBox
                          p={2}
                          mb={2}
                          sx={{
                            borderRadius: 2.5,
                            border: "1px solid rgba(148, 163, 184, 0.18)",
                            background: darkMode
                              ? "rgba(15, 23, 42, 0.28)"
                              : "rgba(248, 250, 252, 0.9)",
                          }}
                        >
                          <Stack spacing={1.5}>
                            <MDBox>
                              <MDTypography variant="button" fontWeight="medium" color="dark">
                                {t("dashboard.timelineFilterTitle")}
                              </MDTypography>
                              <MDTypography variant="caption" display="block" color="text">
                                {t("dashboard.timelineFilterSubtitle")}
                              </MDTypography>
                            </MDBox>

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {timelineWindowOptions.map((option) => (
                                <Chip
                                  key={option.value}
                                  label={t(option.labelKey)}
                                  clickable
                                  color={selectedTimelineWindow === option.value ? "info" : "default"}
                                  variant={selectedTimelineWindow === option.value ? "filled" : "outlined"}
                                  size="small"
                                  onClick={() => {
                                    setSelectedTimelineWindow(option.value);
                                    if (option.value === "custom") {
                                      setTimelineRangeStart("");
                                      setTimelineRangeEnd("");
                                    }
                                  }}
                                />
                              ))}
                            </Stack>

                            {selectedTimelineWindow === "custom" ? (
                              <Stack spacing={1.5}>
                                <Grid container spacing={1.5}>
                                  <Grid item xs={12} md={6}>
                                    <FriendlyDateTimeField
                                      label={t("dashboard.filterFrom")}
                                      value={timelineRangeStart}
                                      onChange={setTimelineRangeStart}
                                      helperText={customTimelineRangeHelper}
                                    />
                                  </Grid>
                                  <Grid item xs={12} md={6}>
                                    <FriendlyDateTimeField
                                      label={t("dashboard.filterTo")}
                                      value={timelineRangeEnd}
                                      onChange={setTimelineRangeEnd}
                                      helperText={t("dashboard.datePickerQuickHint")}
                                    />
                                  </Grid>
                                </Grid>

                                <MDTypography variant="caption" color="text">
                                  {t("dashboard.timelineCustomSearchHint")}
                                </MDTypography>

                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                  {timelineTimestampSuggestions.map((suggestion) => (
                                    <Chip
                                      key={suggestion.value}
                                      label={suggestion.label}
                                      clickable
                                      size="small"
                                      color="secondary"
                                      variant="outlined"
                                      onClick={() => setTimelineTimestampQuery(suggestion.value)}
                                    />
                                  ))}
                                </Stack>
                              </Stack>
                            ) : null}

                            <Stack
                              direction={{ xs: "column", md: "row" }}
                              spacing={1.5}
                              alignItems={{ xs: "stretch", md: "center" }}
                            >
                              <TextField
                                size="small"
                                fullWidth
                                label={t("dashboard.timelineTimestampSearch")}
                                placeholder={t("dashboard.timelineTimestampPlaceholder")}
                                value={timelineTimestampQuery}
                                onChange={(event) => setTimelineTimestampQuery(event.target.value)}
                              />

                              <MDButton
                                variant="text"
                                color="info"
                                onClick={resetTimelineFilters}
                                sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", md: "center" } }}
                              >
                                {t("dashboard.timelineResetFilters")}
                              </MDButton>
                            </Stack>

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip
                                label={t("dashboard.timelineVisibleCheckpoints", {
                                  count: fullHistory.length,
                                  total: fullHistorySource.length,
                                })}
                                color="info"
                                size="small"
                                variant="outlined"
                              />
                              <Chip
                                label={`${t("dashboard.filterTimeWindow")}: ${timelineActiveRangeLabel}`}
                                color="secondary"
                                size="small"
                                variant="outlined"
                              />
                              {selectedTimelineWindow !== "all" && selectedTimelineWindow !== "custom" ? (
                                <Chip
                                  label={t("dashboard.timelineAnchoredToLatest")}
                                  color="default"
                                  size="small"
                                  variant="outlined"
                                />
                              ) : null}
                            </Stack>
                          </Stack>
                        </MDBox>
                      ) : null}

                      <MDBox height="360px" mt={2}>
                        <Line data={fullTimelineChartData} options={fullTimelineChartOptions} />
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDTypography variant="h6" color="dark">
                        {t("dashboard.resourcePressure")}
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {t("dashboard.resourcePressureSubtitle")}
                      </MDTypography>
                      <MDBox height="300px" mt={2}>
                        <Line data={resourceChartData} options={resourceChartOptions} />
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDTypography variant="h6" color="dark">
                        {t("dashboard.featureFrequency")}
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {t("dashboard.featureFrequencySubtitle")}
                      </MDTypography>
                      <MDBox height="300px" mt={2}>
                        <Bar data={featureFrequencyChartData} options={featureFrequencyChartOptions} />
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12} xl={4}>
              <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDTypography variant="h6" color="dark" mb={0.5}>
                        {t("dashboard.liveRunDetails")}
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {featuredRun
                          ? `${featuredRun.trainingFileName || "--"} -> ${featuredRun.testingFileName || "--"}`
                          : t("common.noExecutionSelected")}
                      </MDTypography>

                      <Divider sx={{ my: 2 }} />

                      {featuredRun ? (
                        <Stack spacing={2}>
                          <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                              <MDBox
                                p={2}
                                sx={{
                                  borderRadius: 2.5,
                                  border: "1px solid rgba(148, 163, 184, 0.18)",
                                  background: darkMode
                                    ? "rgba(15, 23, 42, 0.28)"
                                    : "rgba(248, 250, 252, 0.9)",
                                }}
                              >
                                <MDTypography variant="caption" color="text" fontWeight="medium">
                                  {t("dashboard.seedStage")}
                                </MDTypography>
                                <MDTypography variant="button" display="block" color="dark" fontWeight="medium">
                                  {shortenSeed(featuredRun.seedId)}
                                </MDTypography>
                                <MDTypography variant="caption" color="text">
                                  {getStageLabel(featuredRun.stage)}
                                </MDTypography>
                              </MDBox>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                              <MDBox
                                p={2}
                                sx={{
                                  borderRadius: 2.5,
                                  border: "1px solid rgba(148, 163, 184, 0.18)",
                                  background: darkMode
                                    ? "rgba(15, 23, 42, 0.28)"
                                    : "rgba(248, 250, 252, 0.9)",
                                }}
                              >
                                <MDTypography variant="caption" color="text" fontWeight="medium">
                                  {t("dashboard.currentBestF1")}
                                </MDTypography>
                                <MDTypography variant="button" display="block" color="dark" fontWeight="medium">
                                  {formatCompactPercent(featuredRun.bestF1Score)}
                                </MDTypography>
                                <MDTypography variant="caption" color="text">
                                  {t("dashboard.currentLabel", { value: formatCompactPercent(featuredRun.currentF1Score) })}
                                </MDTypography>
                              </MDBox>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                              <MDBox
                                p={2}
                                sx={{
                                  borderRadius: 2.5,
                                  border: "1px solid rgba(148, 163, 184, 0.18)",
                                  background: darkMode
                                    ? "rgba(15, 23, 42, 0.28)"
                                    : "rgba(248, 250, 252, 0.9)",
                                }}
                              >
                                <MDTypography variant="caption" color="text" fontWeight="medium">
                                  {t("dashboard.historyLoaded")}
                                </MDTypography>
                                <MDTypography variant="button" display="block" color="dark" fontWeight="medium">
                                  {t("dashboard.persistedCheckpoints", { count: fullHistory.length })}
                                </MDTypography>
                                <MDTypography variant="caption" color="text">
                                  {t("dashboard.persistedInMonitor")}
                                </MDTypography>
                              </MDBox>
                            </Grid>

                            <Grid item xs={12} sm={6}>
                              <MDBox
                                p={2}
                                sx={{
                                  borderRadius: 2.5,
                                  border: "1px solid rgba(148, 163, 184, 0.18)",
                                  background: darkMode
                                    ? "rgba(15, 23, 42, 0.28)"
                                    : "rgba(248, 250, 252, 0.9)",
                                }}
                              >
                                <MDTypography variant="caption" color="text" fontWeight="medium">
                                  {t("dashboard.updatedAtLabel")}
                                </MDTypography>
                                <MDTypography variant="button" display="block" color="dark" fontWeight="medium">
                                  {formatDateTime(featuredRun.updatedAt)}
                                </MDTypography>
                                <MDTypography variant="caption" color="text">
                                  {formatRelativeTime(featuredRun.updatedAt)}
                                </MDTypography>
                              </MDBox>
                            </Grid>
                          </Grid>

                          <MDBox
                            p={2}
                            sx={{
                              borderRadius: 2.5,
                              border: "1px solid rgba(148, 163, 184, 0.18)",
                              background: darkMode
                                ? "rgba(15, 23, 42, 0.28)"
                                : "rgba(248, 250, 252, 0.9)",
                            }}
                          >
                            <MDTypography variant="button" fontWeight="medium" color="dark" mb={1}>
                              {t("dashboard.resourceSnapshot")}
                            </MDTypography>

                            <MDBox mb={2}>
                              <MDTypography variant="caption" color="text" fontWeight="medium">
                                CPU usage
                              </MDTypography>
                              <MDProgress
                                value={Math.min(Math.max(Number(featuredRun.cpuUsage || 0), 0), 100)}
                                color="info"
                                variant="gradient"
                              />
                              <MDTypography variant="caption" color="text">
                                {formatMetric(featuredRun.cpuUsage, "%")}
                              </MDTypography>
                            </MDBox>

                            <MDBox>
                              <MDTypography variant="caption" color="text" fontWeight="medium">
                                Memory usage
                              </MDTypography>
                              <MDProgress
                                value={Math.min(Math.max(Number(featuredRun.memoryUsagePercent || 0), 0), 100)}
                                color="success"
                                variant="gradient"
                              />
                              <MDTypography variant="caption" color="text">
                                {formatMetric(featuredRun.memoryUsage, " MB")} / {formatMetric(featuredRun.memoryUsagePercent, "%")}
                              </MDTypography>
                            </MDBox>
                          </MDBox>

                          <MDBox
                            p={2}
                            sx={{
                              borderRadius: 2.5,
                              border: "1px solid rgba(148, 163, 184, 0.18)",
                              background: darkMode
                                ? "rgba(15, 23, 42, 0.28)"
                                : "rgba(248, 250, 252, 0.9)",
                            }}
                          >
                            <MDTypography variant="caption" color="text" fontWeight="medium">
                              Feature subset
                            </MDTypography>
                            <MDTypography variant="button" display="block" color="dark" fontWeight="medium">
                              {formatFeatureSubset(featuredRun.solutionFeatures, 12)}
                            </MDTypography>
                          </MDBox>

                          <MDButton
                            component={Link}
                            to={`/dashboard/runs/${featuredRun.seedId}`}
                            variant="outlined"
                            color="info"
                          >
                            {t("common.openDetails")}
                          </MDButton>
                        </Stack>
                      ) : (
                        <MDBox py={6} textAlign="center">
                          <Icon color="disabled" sx={{ fontSize: 40 }}>
                            play_circle
                          </Icon>
                          <MDTypography variant="button" display="block" color="text">
                            {t("dashboard.startExecutionHint")}
                          </MDTypography>
                        </MDBox>
                      )}
                    </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <MDBox p={3} pb={2}>
                      <MDBox
                        display="flex"
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                        flexDirection={{ xs: "column", md: "row" }}
                        gap={1.5}
                      >
                        <MDBox>
                          <MDTypography variant="h6" color="dark">
                            {t("dashboard.recentImprovementsTitle")}
                          </MDTypography>
                          <MDTypography variant="button" color="text">
                            {t("dashboard.recentImprovementsSubtitle")}
                          </MDTypography>
                        </MDBox>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip
                            label={t("dashboard.improvementCount", { count: improvementSummary.total })}
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                          {improvementSummary.strongest ? (
                            <Chip
                              label={`${t("dashboard.strongestJump")} ${formatScoreDelta(
                                improvementSummary.strongest.bestF1Score ?? improvementSummary.strongest.currentF1Score,
                                improvementSummary.strongest.previousBestScore
                              )}`}
                              color="info"
                              size="small"
                              variant="outlined"
                            />
                          ) : null}
                        </Stack>
                      </MDBox>
                    </MDBox>

                    {improvementSummary.latest ? (
                      <MDBox px={3} pb={2}>
                        <MDBox
                          p={2}
                          sx={{
                            borderRadius: 2.5,
                            border: "1px solid rgba(54, 197, 108, 0.24)",
                            background: darkMode
                              ? "linear-gradient(180deg, rgba(22, 101, 52, 0.28) 0%, rgba(15, 23, 42, 0.2) 100%)"
                              : "linear-gradient(180deg, rgba(240, 253, 244, 0.96) 0%, rgba(236, 253, 245, 0.9) 100%)",
                          }}
                        >
                          <MDTypography variant="caption" color="text" fontWeight="medium">
                            {t("dashboard.latestImprovement")}
                          </MDTypography>
                          <MDBox
                            display="flex"
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", md: "center" }}
                            flexDirection={{ xs: "column", md: "row" }}
                            gap={1}
                            mt={0.5}
                          >
                            <MDTypography variant="button" color="dark" fontWeight="medium">
                              {`${improvementSummary.latest.rclAlgorithm || "Run"} via ${
                                improvementSummary.latest.localSearch
                                || improvementSummary.latest.neighborhood
                                || getStageLabel(improvementSummary.latest.stage)
                              }`}
                            </MDTypography>
                            <Chip
                              label={formatScoreDelta(
                                improvementSummary.latest.bestF1Score ?? improvementSummary.latest.currentF1Score,
                                improvementSummary.latest.previousBestScore
                              )}
                              color="success"
                              size="small"
                            />
                          </MDBox>
                          <MDBox
                            mt={0.75}
                            display="flex"
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", md: "center" }}
                            flexDirection={{ xs: "column", md: "row" }}
                            gap={1}
                          >
                            <MDTypography variant="caption" display="block" color="text">
                              <MDTypography
                                component={Link}
                                to={`/dashboard/runs/${improvementSummary.latest.seedId}`}
                                variant="caption"
                                color="info"
                                fontWeight="medium"
                                sx={{ textDecoration: "none" }}
                              >
                                {shortenSeed(improvementSummary.latest.seedId)}
                              </MDTypography>
                              {` improved from ${formatCompactPercent(
                                improvementSummary.latest.previousBestScore
                              )} to ${formatCompactPercent(
                                improvementSummary.latest.bestF1Score ?? improvementSummary.latest.currentF1Score
                              )} | ${formatRelativeTime(improvementSummary.latest.timestamp)}`}
                            </MDTypography>
                            <MDButton
                              component={Link}
                              to={`/dashboard/runs/${improvementSummary.latest.seedId}`}
                              variant="outlined"
                              color="info"
                              size="small"
                            >
                              {t("dashboard.openRun")}
                            </MDButton>
                          </MDBox>
                        </MDBox>
                      </MDBox>
                    ) : null}

                    <MDBox px={3} pb={3}>
                      {improvementEvents.length === 0 ? (
                        <MDBox
                          p={2.5}
                          sx={{
                            borderRadius: 2.5,
                            border: "1px dashed rgba(148, 163, 184, 0.24)",
                            background: darkMode
                              ? "rgba(15, 23, 42, 0.22)"
                              : "rgba(248, 250, 252, 0.9)",
                          }}
                        >
                          <MDTypography variant="button" color="text">
                            {t("dashboard.noImprovements")}
                          </MDTypography>
                        </MDBox>
                      ) : (
                        <Grid container spacing={1.5}>
                          {improvementEvents.map((event, index) => (
                            <Grid item xs={12} md={6} xl={3} key={`${event.seedId}-${event.timestamp}-${index}`}>
                              <MDBox
                                p={2}
                                height="100%"
                                sx={{
                                  borderRadius: 2.5,
                                  border: "1px solid rgba(148, 163, 184, 0.18)",
                                  background: darkMode
                                    ? "rgba(15, 23, 42, 0.22)"
                                    : "rgba(248, 250, 252, 0.92)",
                                }}
                              >
                                <MDBox
                                  display="flex"
                                  justifyContent="space-between"
                                  alignItems={{ xs: "flex-start", md: "center" }}
                                  flexDirection={{ xs: "column", md: "row" }}
                                  gap={1}
                                >
                                  <MDBox display="flex" alignItems="center" gap={1.25}>
                                    <MDBox
                                      width="2rem"
                                      height="2rem"
                                      display="grid"
                                      sx={{
                                        placeItems: "center",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, rgba(54, 197, 108, 0.92) 0%, rgba(17, 181, 174, 0.92) 100%)",
                                        color: "#fff",
                                        fontSize: "0.95rem",
                                        flexShrink: 0,
                                      }}
                                    >
                                      <Icon fontSize="inherit">trending_up</Icon>
                                    </MDBox>

                                    <MDBox>
                                      <MDTypography variant="button" color="dark" fontWeight="medium">
                                        {event.rclAlgorithm || "Run"}
                                      </MDTypography>
                                      <MDTypography variant="caption" display="block" color="text">
                                        {event.localSearch || event.neighborhood || getStageLabel(event.stage)}
                                      </MDTypography>
                                    </MDBox>
                                  </MDBox>

                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                      label={formatScoreDelta(
                                        event.bestF1Score ?? event.currentF1Score,
                                        event.previousBestScore
                                      )}
                                      color="success"
                                      size="small"
                                    />
                                    <Chip
                                      label={formatRelativeTime(event.timestamp)}
                                      color="secondary"
                                      size="small"
                                      variant="outlined"
                                    />
                                  </Stack>
                                </MDBox>

                                <MDBox mt={1.25}>
                                  <MDTypography variant="caption" display="block" color="text">
                                    <MDTypography
                                      component={Link}
                                      to={`/dashboard/runs/${event.seedId}`}
                                      variant="caption"
                                      color="info"
                                      fontWeight="medium"
                                      sx={{ textDecoration: "none" }}
                                    >
                                      {shortenSeed(event.seedId)}
                                    </MDTypography>
                                    {` improved from ${formatCompactPercent(
                                      event.previousBestScore
                                    )} to ${formatCompactPercent(
                                      event.bestF1Score ?? event.currentF1Score
                                    )}`}
                                  </MDTypography>
                                </MDBox>
                              </MDBox>
                            </Grid>
                          ))}
                        </Grid>
                      )}
                    </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>
        ) : null}

        {activeTab === "performance" ? (
        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceInitialSolutionsByAlgorithm")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceInitialSolutionsSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={initialSolutionsChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceLocalSearchPerformance")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceLocalSearchPerformanceSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={localSearchPerformanceChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceBestResultsByAlgorithm")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceBestResultsSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={finalSolutionsChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceStageDistribution")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceStageDistributionSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Doughnut data={stageDistributionChartData} options={stageDistributionOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceAverageCpuByAlgorithm")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceAverageCpuSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={averageCpuChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceAverageMemoryByAlgorithm")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceAverageMemorySubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={averageMemoryChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceAverageCpuByLocalSearch")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceAverageCpuByLocalSearchSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={averageCpuByLocalSearchChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} xl={3}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.performanceAverageMemoryByLocalSearch")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.performanceAverageMemoryByLocalSearchSubtitle")}
                  </MDTypography>
                  <MDBox height="300px" mt={2}>
                    <Bar data={averageMemoryByLocalSearchChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>
        ) : null}

        {activeTab === "algorithms" ? (
        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} lg={6}>
              <Card>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.algorithmResourceFootprintTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.algorithmResourceFootprintSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.algorithmsCount", { count: resourceAveragesByAlgorithm.length })} color="info" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 860 } }}>
                  <DataTable
                    table={resourceSummaryTableData}
                    entriesPerPage={false}
                    canSearch
                    showTotalEntries={false}
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} lg={6}>
              <Card>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.localSearchResourceFootprintTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.localSearchResourceFootprintSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip
                    label={t("dashboard.algorithmsCount", { count: resourceAveragesByLocalSearch.length })}
                    color="info"
                    size="small"
                    variant="outlined"
                  />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 860 } }}>
                  <DataTable
                    table={localSearchResourceSummaryTableData}
                    entriesPerPage={false}
                    canSearch
                    showTotalEntries={false}
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>
        ) : null}

        {activeTab === "analytics" ? (
        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} xl={3}>
              <ComplexStatisticsCard color="dark" icon="travel_explore" title={t("dashboard.analyticsVisibleSnapshots")} count={analyticsOverview.rawSnapshots} />
            </Grid>
            <Grid item xs={12} md={6} xl={3}>
              <ComplexStatisticsCard color="info" icon="topic" title={t("dashboard.analyticsLiveEvents")} count={analyticsOverview.rawEvents} />
            </Grid>
            <Grid item xs={12} md={6} xl={3}>
              <ComplexStatisticsCard color="success" icon="fingerprint" title={t("dashboard.analyticsUniqueSeeds")} count={analyticsOverview.uniqueSeeds} />
            </Grid>
            <Grid item xs={12} md={6} xl={3}>
              <ComplexStatisticsCard
                color="warning"
                icon="query_stats"
                title={t("dashboard.analyticsAvgInitialF1")}
                count={formatCompactPercent(analyticsOverview.avgInitialF1)}
              />
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ height: "100%" }}>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.hourlyActivityTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.hourlyActivitySubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip
                    label={t("dashboard.hourBucketsCount", { count: hourlyActivityMetrics.length })}
                    color="info"
                    size="small"
                    variant="outlined"
                  />
                </MDBox>
                <MDBox height="340px" mt={2} px={3} pb={3}>
                  <Bar data={hourlyActivityChartData} options={hourlyActivityChartOptions} />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("dashboard.topicVolumeTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.topicVolumeSubtitle")}
                  </MDTypography>
                  <MDBox height="320px" mt={2}>
                    <Bar data={rawTopicVolumeChartData} options={finalSolutionsChartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ height: "100%" }}>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.topicSummaryTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.topicSummarySubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.topicsCount", { count: rawTopicMetrics.length })} color="info" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 720 } }}>
                  <DataTable
                    table={rawTopicTableData}
                    entriesPerPage={false}
                    canSearch
                    showTotalEntries={false}
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.visibleSolutionFeedTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.visibleSolutionFeedSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.rowsCount", { count: monitorSnapshots.length })} color="secondary" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1180 } }}>
                  <DataTable
                    table={rawSolutionFeedTableData}
                    entriesPerPage={{ defaultValue: 10, entries: [10, 20, 30] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>
        ) : null}

        {activeTab === "executions" ? (
        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <ExecutionComparison runs={filteredRuns} />
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ height: "100%" }}>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.executionsInitialSolutionsTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.executionsInitialSolutionsSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.rowsCount", { count: initialSolutionEvents.length })} color="info" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 720 } }}>
                  <DataTable
                    table={initialSolutionsTableData}
                    entriesPerPage={{ defaultValue: 6, entries: [6, 10, 15] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ height: "100%" }}>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.executionsLocalSearchOutcomesTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.executionsLocalSearchOutcomesSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.rowsCount", { count: localSearchOutcomeEvents.length })} color="success" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 720 } }}>
                  <DataTable
                    table={localSearchTableData}
                    entriesPerPage={{ defaultValue: 6, entries: [6, 10, 15] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ height: "100%" }}>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.executionsLocalSearchProgressTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.executionsLocalSearchProgressSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.rowsCount", { count: localSearchProgressEvents.length })} color="secondary" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 920 } }}>
                  <DataTable
                    table={localSearchProgressTableData}
                    entriesPerPage={{ defaultValue: 8, entries: [8, 12, 20] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ height: "100%" }}>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.executionsBestSolutionMomentsTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.executionsBestSolutionMomentsSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.rowsCount", { count: bestSolutionSnapshotEvents.length })} color="warning" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1120 } }}>
                  <DataTable
                    table={bestSolutionMomentsTableData}
                    entriesPerPage={{ defaultValue: 8, entries: [8, 12, 20] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.executionsBestWorkflowTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.executionsBestWorkflowSubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.rowsCount", { count: bestSolutionRuns.length })} color="warning" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1080 } }}>
                  <DataTable
                    table={bestSolutionsDetailedTableData}
                    entriesPerPage={{ defaultValue: 8, entries: [8, 12, 20] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>
        ) : null}

        {activeTab === "algorithms" ? (
        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.algorithmsRclSummaryTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.algorithmsRclSummarySubtitle", { count: finalRunsByRclAlgorithm.length })}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.algorithmsCount", { count: finalRunsByRclAlgorithm.length })} color="warning" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1120 } }}>
                  <DataTable
                    table={rclAlgorithmSummaryTableData}
                    entriesPerPage={false}
                    canSearch
                    showTotalEntries={false}
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <MDBox
                  p={3}
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.algorithmsDlsSummaryTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.algorithmsDlsSummarySubtitle", { count: dlsOutcomeSummary.length })}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.algorithmsCount", { count: dlsOutcomeSummary.length })} color="secondary" size="small" variant="outlined" />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 980 } }}>
                  <DataTable
                    table={dlsAlgorithmSummaryTableData}
                    entriesPerPage={false}
                    canSearch
                    showTotalEntries={false}
                    noEndBorder
                  />
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>
        ) : null}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
