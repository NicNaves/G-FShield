import { Suspense, lazy, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { toast } from "react-toastify";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Icon from "@mui/material/Icon";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Decimation,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import MDProgress from "components/MDProgress";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import ResearchSnapshotPanel from "./components/ResearchSnapshotPanel";
import DashboardWorkspaceFilters from "./components/DashboardWorkspaceFilters";

import useI18n from "hooks/useI18n";
import useExecutionQueue from "hooks/useExecutionQueue";
import useGraspMonitor from "hooks/useGraspMonitor";
import useExecutionLaunchQuery from "hooks/queries/useExecutionLaunchQuery";
import useMonitorDashboardAggregateQuery from "hooks/queries/useMonitorDashboardAggregateQuery";
import useMonitorEventFeedQuery from "hooks/queries/useMonitorEventFeedQuery";
import useMonitorRunQuery from "hooks/queries/useMonitorRunQuery";
import { useMaterialUIController } from "context";
import {
  createMonitorExportJob,
  downloadMonitorExportJob,
  getMonitorExportJob,
} from "api/grasp";
import {
  formatCompactPercent,
  formatDateTime,
  formatDuration,
  formatElapsedDuration,
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
  downloadBlobFile,
  downloadTextFile,
} from "utils/graspDashboardExport";

ChartJS.register(
  CategoryScale,
  LinearScale,
  Decimation,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

const DashboardPerformanceTab = lazy(() => import("./components/DashboardPerformanceTab"));
const DashboardAlgorithmsTab = lazy(() => import("./components/DashboardAlgorithmsTab"));
const DashboardAnalyticsTab = lazy(() => import("./components/DashboardAnalyticsTab"));
const DashboardExecutionsTab = lazy(() => import("./components/DashboardExecutionsTab"));

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
    requestId: snapshot.requestId || historyEntry.requestId || event?.requestId || null,
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

const timelineSeriesOptions = [
  { value: "top8", limit: 8, labelKey: "dashboard.timelineSeriesTop8" },
  { value: "top12", limit: 12, labelKey: "dashboard.timelineSeriesTop12" },
  { value: "all", limit: Number.POSITIVE_INFINITY, labelKey: "dashboard.timelineSeriesAll" },
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

const DASHBOARD_VISIBLE_SNAPSHOT_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_DASHBOARD_VISIBLE_SNAPSHOT_LIMIT || 1800) || 1800, 5000),
  300
);

const DASHBOARD_TIMELINE_RUN_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_DASHBOARD_TIMELINE_RUN_LIMIT || 10) || 10, 24),
  3
);

const DASHBOARD_HISTORY_PREVIEW_PER_RUN_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_DASHBOARD_HISTORY_PREVIEW_PER_RUN_LIMIT || 180) || 180, 800),
  40
);

const DASHBOARD_TABLE_ROW_LIMIT = Math.max(
  Math.min(Number(process.env.REACT_APP_DASHBOARD_TABLE_ROW_LIMIT || 600) || 600, 2000),
  120
);

const summaryTableEntries = { defaultValue: 8, entries: [8, 15, 25, 50] };
const STAGE_LENS_TOPIC_MAP = {
  initial: ["INITIAL_SOLUTION_TOPIC"],
  restart: ["NEIGHBORHOOD_RESTART_TOPIC"],
  local: ["SOLUTIONS_TOPIC"],
  progress: ["LOCAL_SEARCH_PROGRESS_TOPIC"],
  best: ["BEST_SOLUTION_TOPIC"],
};

const createEmptyPaginatedFeed = (pageSize = 25) => ({
  items: [],
  pagination: {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  },
});

const createDefaultFeedTableFilters = () => ({
  algorithm: "all",
  minF1Score: "",
  maxF1Score: "",
});

const ANALYTICS_SECTION_ACTIVITY = "activity";
const ANALYTICS_SECTION_TOPICS = "topics";
const ANALYTICS_SECTION_FEED = "feed";

const EXECUTIONS_SECTION_COMPARISON = "comparison";
const EXECUTIONS_SECTION_INITIAL = "initial";
const EXECUTIONS_SECTION_OUTCOME = "outcome";
const EXECUTIONS_SECTION_PROGRESS = "progress";
const EXECUTIONS_SECTION_BEST = "best";

const limitDashboardRows = (rows = [], limit = DASHBOARD_TABLE_ROW_LIMIT) =>
  rows.length > limit ? rows.slice(0, limit) : rows;

const resolveFeedTopics = (baseTopics = [], stageLens = "all") => {
  const stageTopics = STAGE_LENS_TOPIC_MAP[stageLens] || [];

  if (!baseTopics.length) {
    return stageTopics;
  }

  if (!stageTopics.length) {
    return baseTopics;
  }

  const allowedTopics = new Set(stageTopics);
  return baseTopics.filter((topic) => allowedTopics.has(topic));
};

const takeLatestEntries = (entries = [], limit = DASHBOARD_HISTORY_PREVIEW_PER_RUN_LIMIT) => {
  if (!Array.isArray(entries) || entries.length <= limit) {
    return entries || [];
  }

  return entries.slice(-limit);
};

const getEntryTimestamp = (entry = {}) => entry?.timestamp || entry?.updatedAt || entry?.createdAt || null;

const parseDateTimeValue = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const formatTimelineAxisTick = (value, spanMs = 0) => {
  const parsed = parseDateTimeValue(value);
  if (parsed === null) {
    return "--";
  }

  return spanMs > 24 * 60 * 60 * 1000 ? formatDateTime(parsed) : formatShortTime(parsed);
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
  position: "relative",
  overflow: "hidden",
  height: "100%",
  p: 2.5,
  borderRadius: 3,
  color: darkMode ? "#edf4ff" : "#1f2937",
  border: `1px solid ${darkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.08)"}`,
  background: darkMode
    ? "linear-gradient(180deg, rgba(14, 22, 37, 0.88) 0%, rgba(18, 28, 47, 0.94) 100%)"
    : "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 247, 251, 0.94) 100%)",
  boxShadow: darkMode
    ? "0 22px 42px rgba(2, 6, 23, 0.28)"
    : "0 14px 30px rgba(15, 23, 42, 0.05)",
  backdropFilter: "blur(14px)",
  "&::before": {
    content: "\"\"",
    position: "absolute",
    inset: "0 0 auto 0",
    height: 1,
    background: darkMode
      ? "linear-gradient(90deg, rgba(96, 165, 250, 0) 0%, rgba(96, 165, 250, 0.48) 48%, rgba(96, 165, 250, 0) 100%)"
      : "linear-gradient(90deg, rgba(59, 130, 246, 0) 0%, rgba(59, 130, 246, 0.34) 48%, rgba(59, 130, 246, 0) 100%)",
  },
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
  letterSpacing: "0.01em",
});

const filterPanelCaptionSx = (darkMode) => ({
  color: darkMode ? "rgba(212, 222, 238, 0.68)" : "rgba(71, 85, 105, 0.9)",
});

const dashboardContentSx = (darkMode) => ({
  "& .MuiCard-root": {
    borderRadius: 3,
    border: darkMode
      ? "1px solid rgba(255, 255, 255, 0.08)"
      : "1px solid rgba(148, 163, 184, 0.16)",
    background: darkMode
      ? "linear-gradient(180deg, rgba(16, 24, 38, 0.94) 0%, rgba(18, 28, 47, 0.96) 100%)"
      : "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%)",
    boxShadow: darkMode
      ? "0 20px 40px rgba(2, 6, 23, 0.32)"
      : "0 18px 36px rgba(15, 23, 42, 0.06)",
    backdropFilter: "blur(14px)",
  },
  "& .MuiCard-root .MuiTypography-root": {
    color: darkMode ? "#edf4ff !important" : undefined,
  },
  "& .MuiCard-root .MuiTypography-caption, & .MuiCard-root .MuiTypography-button, & .MuiCard-root .MuiTypography-body2": {
    color: darkMode ? "rgba(212, 222, 238, 0.76) !important" : undefined,
  },
  "& .MuiCard-root .MuiChip-root": {
    borderRadius: 999,
    borderColor: darkMode ? "rgba(148, 163, 184, 0.26)" : "rgba(148, 163, 184, 0.24)",
    backgroundColor: darkMode ? "rgba(15, 23, 42, 0.42)" : "rgba(248, 250, 252, 0.92)",
  },
  "& .MuiCard-root .MuiDivider-root": {
    borderColor: darkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(148, 163, 184, 0.18)",
  },
});

const dashboardTabRailSx = (darkMode) => ({
  overflow: "hidden",
  borderRadius: 3,
  border: darkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(148, 163, 184, 0.18)",
  background: darkMode
    ? "linear-gradient(180deg, rgba(12, 19, 32, 0.96) 0%, rgba(17, 26, 43, 0.92) 100%)"
    : "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(243, 247, 252, 0.96) 100%)",
  boxShadow: darkMode ? "0 18px 40px rgba(2, 6, 23, 0.28)" : "0 16px 30px rgba(15, 23, 42, 0.05)",
});

const dashboardTabsSx = (darkMode) => ({
  minHeight: 60,
  px: 1,
  py: 0.5,
  "& .MuiTabs-indicator": {
    display: "none",
  },
  "& .MuiTabs-flexContainer": {
    gap: 1,
  },
  "& .MuiTab-root": {
    minHeight: 48,
    minWidth: 146,
    borderRadius: 2.5,
    textTransform: "none",
    fontWeight: 600,
    color: darkMode ? "rgba(212, 222, 238, 0.74)" : "rgba(71, 85, 105, 0.92)",
    transition: "all 180ms ease",
  },
  "& .MuiTab-root:hover": {
    color: darkMode ? "#f8fafc" : "#0f172a",
    backgroundColor: darkMode ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.06)",
  },
  "& .MuiTab-root.Mui-selected": {
    color: darkMode ? "#f8fafc" : "#0f172a",
    background: darkMode
      ? "linear-gradient(180deg, rgba(37, 99, 235, 0.22) 0%, rgba(30, 64, 175, 0.18) 100%)"
      : "linear-gradient(180deg, rgba(239, 246, 255, 1) 0%, rgba(219, 234, 254, 0.98) 100%)",
    boxShadow: darkMode ? "0 10px 22px rgba(15, 23, 42, 0.28)" : "0 10px 18px rgba(59, 130, 246, 0.12)",
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

const timelineSeriesPalette = [
  "#4361ee",
  "#ff8c42",
  "#11b5ae",
  "#8b5cf6",
  "#ef476f",
  "#36c56c",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

const getTimelineSeriesColor = (index = 0) => timelineSeriesPalette[index % timelineSeriesPalette.length];

const buildTimelineDownsampledPoints = (points = [], maxPoints = 900) => {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points;
  }

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const middle = points.slice(1, -1);

  if (!middle.length || maxPoints <= 2) {
    return [firstPoint, lastPoint].filter(Boolean);
  }

  const bucketTarget = maxPoints - 2;
  const bucketSize = Math.ceil(middle.length / bucketTarget);
  const reduced = [firstPoint];

  for (let start = 0; start < middle.length; start += bucketSize) {
    const bucket = middle.slice(start, start + bucketSize);
    if (!bucket.length) {
      continue;
    }

    let minPoint = bucket[0];
    let maxPoint = bucket[0];

    bucket.forEach((point) => {
      if ((point?.y ?? 0) < (minPoint?.y ?? 0)) {
        minPoint = point;
      }

      if ((point?.y ?? 0) > (maxPoint?.y ?? 0)) {
        maxPoint = point;
      }
    });

    const orderedExtremes = [minPoint, maxPoint].sort((left, right) => (left?.x ?? 0) - (right?.x ?? 0));
    orderedExtremes.forEach((point) => {
      const previous = reduced[reduced.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) {
        reduced.push(point);
      }
    });
  }

  const previous = reduced[reduced.length - 1];
  if (!previous || previous.x !== lastPoint.x || previous.y !== lastPoint.y) {
    reduced.push(lastPoint);
  }

  if (reduced.length <= maxPoints) {
    return reduced;
  }

  const stride = Math.ceil((reduced.length - 2) / (maxPoints - 2));
  const compactMiddle = reduced.slice(1, -1).filter((_, index) => index % stride === 0);
  return [firstPoint, ...compactMiddle, lastPoint];
};

const buildTimelineComparisonRuns = (filteredRuns = [], requestRuns = [], featuredRun = null) => {
  const visibleRunsBySeed = new Map(
    filteredRuns
      .filter((run) => run?.seedId)
      .map((run) => [run.seedId, run])
  );

  (requestRuns || []).forEach((run) => {
    if (!run?.seedId || !visibleRunsBySeed.has(run.seedId)) {
      return;
    }

    visibleRunsBySeed.set(run.seedId, mergeRunDetail(visibleRunsBySeed.get(run.seedId) || {}, run));
  });

  if (featuredRun?.seedId && visibleRunsBySeed.has(featuredRun.seedId)) {
    visibleRunsBySeed.set(
      featuredRun.seedId,
      mergeRunDetail(visibleRunsBySeed.get(featuredRun.seedId) || {}, featuredRun)
    );
  }

  return [...visibleRunsBySeed.values()].sort(
    (left, right) => getSortableDateValue(right?.updatedAt) - getSortableDateValue(left?.updatedAt)
  );
};

const compareTimelineRuns = (left = {}, right = {}, featuredSeedId = null) => {
  const featuredDelta = Number(Boolean(right?.seedId && right.seedId === featuredSeedId))
    - Number(Boolean(left?.seedId && left.seedId === featuredSeedId));
  if (featuredDelta !== 0) {
    return featuredDelta;
  }

  const bestSolutionDelta = Number(isBestSolutionRun(right)) - Number(isBestSolutionRun(left));
  if (bestSolutionDelta !== 0) {
    return bestSolutionDelta;
  }

  const completedDelta = Number(String(right?.status || "").toLowerCase() === "completed")
    - Number(String(left?.status || "").toLowerCase() === "completed");
  if (completedDelta !== 0) {
    return completedDelta;
  }

  const bestScoreDelta = getNumericScore(right?.bestF1Score ?? right?.currentF1Score, Number.NEGATIVE_INFINITY)
    - getNumericScore(left?.bestF1Score ?? left?.currentF1Score, Number.NEGATIVE_INFINITY);
  if (bestScoreDelta !== 0) {
    return bestScoreDelta;
  }

  const historyDepthDelta = (right?.history?.length || 0) - (left?.history?.length || 0);
  if (historyDepthDelta !== 0) {
    return historyDepthDelta;
  }

  return getSortableDateValue(right?.updatedAt) - getSortableDateValue(left?.updatedAt);
};

const selectTimelineRunsForChart = (
  runs = [],
  { featuredSeedId = null, limit = Number.POSITIVE_INFINITY } = {}
) => {
  const rankedRuns = [...runs].sort((left, right) => compareTimelineRuns(left, right, featuredSeedId));

  if (!Number.isFinite(limit) || rankedRuns.length <= limit) {
    return rankedRuns;
  }

  const selectedRuns = rankedRuns.slice(0, limit);

  if (
    featuredSeedId
    && !selectedRuns.some((run) => run?.seedId === featuredSeedId)
  ) {
    const featuredRun = rankedRuns.find((run) => run?.seedId === featuredSeedId);
    if (featuredRun) {
      selectedRuns[selectedRuns.length - 1] = featuredRun;
      return selectedRuns.sort((left, right) => compareTimelineRuns(left, right, featuredSeedId));
    }
  }

  return selectedRuns;
};

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

const MONITOR_IMPROVEMENT_TOPICS = new Set([
  "INITIAL_SOLUTION_TOPIC",
  "NEIGHBORHOOD_RESTART_TOPIC",
  "LOCAL_SEARCH_PROGRESS_TOPIC",
  "SOLUTIONS_TOPIC",
  "BEST_SOLUTION_TOPIC",
]);

const appendResourceSample = (grouped, label, event) => {
  const cpuUsage = getFiniteMetric(event?.cpuUsage);
  const memoryUsage = getFiniteMetric(event?.memoryUsage);
  const memoryUsagePercent = getFiniteMetric(event?.memoryUsagePercent);

  if (!label || (cpuUsage === null && memoryUsage === null && memoryUsagePercent === null)) {
    return;
  }

  const current = grouped.get(label) || {
    algorithm: label,
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

  grouped.set(label, current);
};

const finalizeResourceAverages = (grouped = new Map()) =>
  [...grouped.values()]
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

const finalizeTopicMetrics = (grouped = new Map()) =>
  [...grouped.values()]
    .map((entry) => ({
      topic: entry.topic,
      count: entry.count,
      uniqueSeedCount: entry.uniqueSeeds.size,
      averageScore: averageMetric(entry.scores),
      bestScore: Number.isFinite(entry.bestScore) ? entry.bestScore : null,
    }))
    .sort((left, right) => right.count - left.count);

const getLocalSearchMetricLabel = (entry = {}) =>
  entry.localSearch
  || entry.search
  || entry.algorithm
  || "Unknown";

const buildMonitorSnapshotAnalytics = (monitorSnapshots = []) => {
  const initialBySeed = new Map();
  const outcomesBySeedAndSearch = new Map();
  const localSearchProgressEvents = [];
  const bestSolutionSnapshotEvents = [];
  const rawTopicGroups = new Map();
  const resourceByAlgorithm = new Map();
  const resourceByLocalSearch = new Map();
  const hourlyBuckets = new Map();
  const uniqueSeeds = new Set();
  const initialScores = [];

  monitorSnapshots.forEach((event) => {
    if (event?.seedId) {
      uniqueSeeds.add(event.seedId);
    }

    const topic = event?.topic || "UNKNOWN_TOPIC";
    const topicGroup = rawTopicGroups.get(topic) || {
      topic,
      count: 0,
      uniqueSeeds: new Set(),
      scores: [],
      bestScore: Number.NEGATIVE_INFINITY,
    };

    topicGroup.count += 1;

    if (event?.seedId) {
      topicGroup.uniqueSeeds.add(event.seedId);
    }

    const topicScore = getFiniteMetric(event?.bestF1Score ?? event?.currentF1Score);
    if (topicScore !== null) {
      topicGroup.scores.push(topicScore);
      topicGroup.bestScore = Math.max(topicGroup.bestScore, topicScore);
    }

    rawTopicGroups.set(topic, topicGroup);

    if (event?.topic === "INITIAL_SOLUTION_TOPIC" && event?.seedId) {
      const current = initialBySeed.get(event.seedId);
      initialBySeed.set(event.seedId, pickPreferredSnapshot(current, event));

      const initialScore = getFiniteMetric(event.bestF1Score ?? event.currentF1Score);
      if (initialScore !== null) {
        initialScores.push(initialScore);
      }

      appendResourceSample(resourceByAlgorithm, event.rclAlgorithm || "Unknown", event);
    }

    if (event?.topic === "SOLUTIONS_TOPIC" && event?.seedId && (event.localSearch || event.neighborhood)) {
      const searchLabel = event.localSearch || event.neighborhood || getStageLabel(event.stage);
      const key = `${event.seedId}:${searchLabel}`;
      const current = outcomesBySeedAndSearch.get(key);
      outcomesBySeedAndSearch.set(key, pickPreferredSnapshot(current, {
        ...event,
        searchLabel,
      }));
    }

    if (event?.topic === "LOCAL_SEARCH_PROGRESS_TOPIC" && event?.seedId) {
      localSearchProgressEvents.push(event);
    }

    if (event?.topic === "BEST_SOLUTION_TOPIC" && event?.seedId) {
      bestSolutionSnapshotEvents.push(event);
    }

    if (["LOCAL_SEARCH_PROGRESS_TOPIC", "SOLUTIONS_TOPIC"].includes(event?.topic)) {
      appendResourceSample(resourceByLocalSearch, event.localSearch || event.searchLabel, event);
    }

    const bucketKey = startOfHourIso(getEntryTimestamp(event));
    if (bucketKey) {
      const currentBucket = hourlyBuckets.get(bucketKey) || {
        timestamp: bucketKey,
        count: 0,
        uniqueSeeds: new Set(),
        bestScore: null,
      };

      currentBucket.count += 1;
      if (event?.seedId) {
        currentBucket.uniqueSeeds.add(event.seedId);
      }

      const bucketScore = getFiniteMetric(event?.bestF1Score ?? event?.currentF1Score);
      if (bucketScore !== null) {
        currentBucket.bestScore = currentBucket.bestScore === null
          ? bucketScore
          : Math.max(currentBucket.bestScore, bucketScore);
      }

      hourlyBuckets.set(bucketKey, currentBucket);
    }
  });

  const initialSolutionEvents = [...initialBySeed.values()].sort(
    (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
  );

  const localSearchOutcomeEvents = [...outcomesBySeedAndSearch.values()].sort(
    (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
  );

  const dlsActivityBySeedAndSearch = new Map();

  [...localSearchProgressEvents, ...localSearchOutcomeEvents].forEach((event) => {
    if (!event?.seedId) {
      return;
    }

    const algorithm = resolveDlsAlgorithmLabel(event);
    if (!algorithm || algorithm === "Unknown") {
      return;
    }

    const key = `${event.seedId}:${algorithm}`;
    const current = dlsActivityBySeedAndSearch.get(key);
    dlsActivityBySeedAndSearch.set(key, current ? pickPreferredSnapshot(current, event) : event);
  });

  const bestBySeed = new Map();
  const improvementEvents = [];

  for (let index = monitorSnapshots.length - 1; index >= 0; index -= 1) {
    const event = monitorSnapshots[index];
    if (!MONITOR_IMPROVEMENT_TOPICS.has(event?.topic)) {
      continue;
    }

    const score = getNumericScore(event.bestF1Score ?? event.currentF1Score);
    const previous = bestBySeed.get(event.seedId);
    bestBySeed.set(event.seedId, Math.max(previous ?? Number.NEGATIVE_INFINITY, score));

    if (previous !== undefined && score > previous) {
      improvementEvents.push({
        ...event,
        previousBestScore: previous,
      });
    }
  }

  return {
    initialSolutionEvents,
    localSearchOutcomeEvents,
    localSearchProgressEvents,
    dlsActivityEvents: [...dlsActivityBySeedAndSearch.values()].sort(
      (left, right) => getSortableDateValue(right.timestamp) - getSortableDateValue(left.timestamp)
    ),
    bestSolutionSnapshotEvents,
    rawTopicMetrics: finalizeTopicMetrics(rawTopicGroups),
    improvementEvents: improvementEvents.reverse().slice(0, 8),
    resourceAveragesByAlgorithm: finalizeResourceAverages(resourceByAlgorithm),
    resourceAveragesByLocalSearch: finalizeResourceAverages(resourceByLocalSearch),
    hourlyActivityMetrics: [...hourlyBuckets.values()]
      .sort((left, right) => getSortableDateValue(left.timestamp) - getSortableDateValue(right.timestamp))
      .map((bucket) => ({
        ...bucket,
        uniqueSeedCount: bucket.uniqueSeeds.size,
      })),
    uniqueSeedCount: uniqueSeeds.size,
    avgInitialF1: averageMetric(initialScores),
    bestSolutionSnapshotCount: bestSolutionSnapshotEvents.length,
  };
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

const resolveRunStartTimestamp = (run = {}, fallbackEvent = null) =>
  run?.createdAt
  || fallbackEvent?.timestamp
  || run?.history?.[0]?.timestamp
  || run?.updatedAt
  || null;

const resolveRunEndTimestamp = (run = {}) => {
  const status = String(run?.status || "").toLowerCase();
  const lastHistoryTimestamp = Array.isArray(run?.history) && run.history.length
    ? run.history[run.history.length - 1]?.timestamp
    : null;

  if (status === "completed") {
    return run?.completedAt || run?.updatedAt || lastHistoryTimestamp || null;
  }

  return run?.updatedAt || Date.now();
};

const buildFallbackRunHistoryEntry = (run = {}, fallbackEvent = null) => ({
  timestamp: resolveRunEndTimestamp(run) || resolveRunStartTimestamp(run, fallbackEvent),
  f1Score: run?.currentF1Score ?? run?.bestF1Score ?? fallbackEvent?.bestF1Score ?? fallbackEvent?.currentF1Score ?? null,
  stage: run?.stage || fallbackEvent?.stage || null,
  cpuUsage: run?.cpuUsage ?? fallbackEvent?.cpuUsage ?? null,
  memoryUsage: run?.memoryUsage ?? fallbackEvent?.memoryUsage ?? null,
  memoryUsagePercent: run?.memoryUsagePercent ?? fallbackEvent?.memoryUsagePercent ?? null,
  order: 1,
});

const buildRunHistoryEntries = (run = {}, fallbackEvent = null) => {
  const historyEntries = Array.isArray(run?.history) && run.history.length
    ? [...run.history]
        .sort((left, right) => getSortableDateValue(left?.timestamp) - getSortableDateValue(right?.timestamp))
        .map((entry, index) => ({
          ...entry,
          order: index + 1,
        }))
    : [];

  if (historyEntries.length) {
    return historyEntries;
  }

  const fallbackEntry = buildFallbackRunHistoryEntry(run, fallbackEvent);
  return fallbackEntry.timestamp ? [fallbackEntry] : [];
};

const resolveLatestRunsTimestamp = (runs = [], initialEventBySeed = new Map()) => {
  let latestTimestamp = null;
  let latestTimestampMs = null;

  runs.forEach((run) => {
    const fallbackEvent = initialEventBySeed.get(run?.seedId);
    const historyEntries = buildRunHistoryEntries(run, fallbackEvent);
    const latestHistoryTimestamp = historyEntries[historyEntries.length - 1]?.timestamp || null;
    const candidates = [
      latestHistoryTimestamp,
      run?.updatedAt,
      run?.completedAt,
      run?.createdAt,
      resolveRunStartTimestamp(run, fallbackEvent),
    ];

    candidates.forEach((candidate) => {
      const candidateMs = parseDateTimeValue(candidate);
      if (candidateMs === null) {
        return;
      }

      if (latestTimestampMs === null || candidateMs > latestTimestampMs) {
        latestTimestamp = candidate;
        latestTimestampMs = candidateMs;
      }
    });
  });

  return latestTimestamp;
};

const resolveResourceBucketSizeMs = (minTimestampMs, maxTimestampMs, pointCount = 0) => {
  const spanMs = Math.max((maxTimestampMs || 0) - (minTimestampMs || 0), 0);

  if (spanMs > 24 * 60 * 60 * 1000 || pointCount > 2000) {
    return 10 * 60 * 1000;
  }

  if (spanMs > 6 * 60 * 60 * 1000 || pointCount > 1200) {
    return 5 * 60 * 1000;
  }

  if (spanMs > 2 * 60 * 60 * 1000 || pointCount > 600) {
    return 2 * 60 * 1000;
  }

  if (spanMs > 30 * 60 * 1000 || pointCount > 200) {
    return 60 * 1000;
  }

  if (spanMs > 10 * 60 * 1000 || pointCount > 120) {
    return 30 * 1000;
  }

  return 10 * 1000;
};

const buildAggregatedResourceSeries = (runs = [], options = {}) => {
  const {
    initialEventBySeed = new Map(),
    range = {},
    query = "",
  } = options;

  const rawPoints = runs
    .flatMap((run) => {
      const fallbackEvent = initialEventBySeed.get(run?.seedId);

      return buildRunHistoryEntries(run, fallbackEvent)
        .filter(
          (entry) =>
            isTimestampWithinRange(entry?.timestamp, range)
            && matchesTimelineTimestampQuery(entry, query)
        )
        .map((entry) => {
          const timestampMs = parseDateTimeValue(entry?.timestamp);
          const cpuUsage = getFiniteMetric(entry?.cpuUsage);
          const memoryUsagePercent = getFiniteMetric(entry?.memoryUsagePercent);

          if (timestampMs === null || (cpuUsage === null && memoryUsagePercent === null)) {
            return null;
          }

          return {
            seedId: run?.seedId || null,
            timestampMs,
            cpuUsage,
            memoryUsagePercent,
          };
        })
        .filter(Boolean);
    })
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (!rawPoints.length) {
    return {
      cpuPoints: [],
      memoryPoints: [],
      snapshotCount: 0,
      bucketCount: 0,
      runCount: 0,
      minTimestampMs: null,
      maxTimestampMs: null,
    };
  }

  const bucketSizeMs = resolveResourceBucketSizeMs(
    rawPoints[0]?.timestampMs,
    rawPoints[rawPoints.length - 1]?.timestampMs,
    rawPoints.length
  );
  const buckets = new Map();
  const runIds = new Set();

  rawPoints.forEach((point) => {
    const bucketTimestampMs = Math.floor(point.timestampMs / bucketSizeMs) * bucketSizeMs;
    const bucket = buckets.get(bucketTimestampMs) || {
      timestampMs: bucketTimestampMs,
      cpuValues: [],
      memoryValues: [],
      sampleCount: 0,
      runIds: new Set(),
    };

    if (point.cpuUsage !== null) {
      bucket.cpuValues.push(point.cpuUsage);
    }

    if (point.memoryUsagePercent !== null) {
      bucket.memoryValues.push(point.memoryUsagePercent);
    }

    bucket.sampleCount += 1;
    if (point.seedId) {
      bucket.runIds.add(point.seedId);
      runIds.add(point.seedId);
    }

    buckets.set(bucketTimestampMs, bucket);
  });

  const orderedBuckets = [...buckets.values()].sort((left, right) => left.timestampMs - right.timestampMs);

  return {
    cpuPoints: orderedBuckets
      .map((bucket) => {
        const value = averageMetric(bucket.cpuValues);
        return value === null
          ? null
          : {
              x: bucket.timestampMs,
              y: value,
              sampleCount: bucket.sampleCount,
              runCount: bucket.runIds.size,
            };
      })
      .filter(Boolean),
    memoryPoints: orderedBuckets
      .map((bucket) => {
        const value = averageMetric(bucket.memoryValues);
        return value === null
          ? null
          : {
              x: bucket.timestampMs,
              y: value,
              sampleCount: bucket.sampleCount,
              runCount: bucket.runIds.size,
            };
      })
      .filter(Boolean),
    snapshotCount: rawPoints.length,
    bucketCount: orderedBuckets.length,
    runCount: runIds.size,
    minTimestampMs: orderedBuckets[0]?.timestampMs ?? null,
    maxTimestampMs: orderedBuckets[orderedBuckets.length - 1]?.timestampMs ?? null,
  };
};

const buildRunTimelinePoints = (run = {}, options = {}) => {
  const {
    fallbackEvent = null,
    range = {},
    query = "",
    maxPoints = 900,
  } = options;
  const startTimestamp = resolveRunStartTimestamp(run, fallbackEvent);
  const startMs = parseDateTimeValue(startTimestamp);

  if (startMs === null) {
    return [];
  }

  const historyEntries = buildRunHistoryEntries(run, fallbackEvent);

  const timelinePoints = historyEntries
    .filter(
      (entry) =>
        isTimestampWithinRange(entry?.timestamp, range)
        && matchesTimelineTimestampQuery(entry, query)
    )
    .map((entry) => {
      const timestampMs = parseDateTimeValue(entry?.timestamp);
      const score = getFiniteMetric(entry?.f1Score ?? entry?.bestF1Score ?? entry?.currentF1Score);

      if (timestampMs === null || score === null) {
        return null;
      }

      return {
        x: timestampMs,
        y: score,
        timestamp: entry.timestamp,
        elapsedMs: Math.max(timestampMs - startMs, 0),
        order: entry.order,
        stage: entry.stage || run?.stage || fallbackEvent?.stage || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.x - right.x);

  return buildTimelineDownsampledPoints(timelinePoints, maxPoints);
};

const buildRunTimelinePointsFromAggregate = (series = {}, options = {}) => {
  const {
    fallbackEvent = null,
    run = {},
    range = {},
    query = "",
    maxPoints = 900,
  } = options;
  const startTimestamp = resolveRunStartTimestamp(run, fallbackEvent) || series?.points?.[0]?.timestamp || null;
  const startMs = parseDateTimeValue(startTimestamp);

  if (startMs === null) {
    return [];
  }

  const timelinePoints = (series?.points || [])
    .filter(
      (point) =>
        isTimestampWithinRange(point?.timestamp, range)
        && matchesTimelineTimestampQuery(point, query)
    )
    .map((point, index) => {
      const timestampMs = parseDateTimeValue(point?.timestamp);
      const score = getFiniteMetric(point?.latestScore ?? point?.averageScore ?? point?.bestScore);

      if (timestampMs === null || score === null) {
        return null;
      }

      return {
        x: timestampMs,
        y: score,
        timestamp: point.timestamp,
        elapsedMs: Math.max(timestampMs - startMs, 0),
        order: index + 1,
        stage: point.stage || run?.stage || fallbackEvent?.stage || null,
        sampleCount: point.sampleCount ?? 0,
        runCount: point.runCount ?? 1,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.x - right.x);

  return buildTimelineDownsampledPoints(timelinePoints, maxPoints);
};

const buildAggregatedResourceSeriesFromSeedSeries = (timelineSeries = [], options = {}) => {
  const {
    range = {},
    query = "",
  } = options;

  const rawPoints = timelineSeries
    .flatMap((series) =>
      (series?.points || [])
        .filter(
          (point) =>
            isTimestampWithinRange(point?.timestamp, range)
            && matchesTimelineTimestampQuery(point, query)
        )
        .map((point) => {
          const timestampMs = parseDateTimeValue(point?.timestamp);
          const cpuUsage = getFiniteMetric(point?.avgCpuUsage);
          const memoryUsagePercent = getFiniteMetric(point?.avgMemoryUsagePercent);

          if (timestampMs === null || (cpuUsage === null && memoryUsagePercent === null)) {
            return null;
          }

          return {
            seedId: series?.seedId || null,
            timestampMs,
            cpuUsage,
            memoryUsagePercent,
            sampleCount: Number(point?.sampleCount || 0),
          };
        })
        .filter(Boolean)
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (!rawPoints.length) {
    return {
      cpuPoints: [],
      memoryPoints: [],
      snapshotCount: 0,
      bucketCount: 0,
      runCount: 0,
      minTimestampMs: null,
      maxTimestampMs: null,
    };
  }

  const bucketSizeMs = resolveResourceBucketSizeMs(
    rawPoints[0]?.timestampMs,
    rawPoints[rawPoints.length - 1]?.timestampMs,
    rawPoints.length
  );
  const buckets = new Map();
  const runIds = new Set();

  rawPoints.forEach((point) => {
    const bucketTimestampMs = Math.floor(point.timestampMs / bucketSizeMs) * bucketSizeMs;
    const bucket = buckets.get(bucketTimestampMs) || {
      timestampMs: bucketTimestampMs,
      cpuValues: [],
      memoryValues: [],
      sampleCount: 0,
      runIds: new Set(),
    };

    if (point.cpuUsage !== null) {
      bucket.cpuValues.push(point.cpuUsage);
    }

    if (point.memoryUsagePercent !== null) {
      bucket.memoryValues.push(point.memoryUsagePercent);
    }

    bucket.sampleCount += Number(point.sampleCount || 0);
    if (point.seedId) {
      bucket.runIds.add(point.seedId);
      runIds.add(point.seedId);
    }

    buckets.set(bucketTimestampMs, bucket);
  });

  const orderedBuckets = [...buckets.values()].sort((left, right) => left.timestampMs - right.timestampMs);

  return {
    cpuPoints: orderedBuckets
      .map((bucket) => {
        const value = averageMetric(bucket.cpuValues);
        return value === null
          ? null
          : {
              x: bucket.timestampMs,
              y: value,
              sampleCount: bucket.sampleCount,
              runCount: bucket.runIds.size,
            };
      })
      .filter(Boolean),
    memoryPoints: orderedBuckets
      .map((bucket) => {
        const value = averageMetric(bucket.memoryValues);
        return value === null
          ? null
          : {
              x: bucket.timestampMs,
              y: value,
              sampleCount: bucket.sampleCount,
              runCount: bucket.runIds.size,
            };
      })
      .filter(Boolean),
    snapshotCount: rawPoints.reduce((sum, point) => sum + Number(point.sampleCount || 0), 0),
    bucketCount: orderedBuckets.length,
    runCount: runIds.size,
    minTimestampMs: orderedBuckets[0]?.timestampMs ?? null,
    maxTimestampMs: orderedBuckets[orderedBuckets.length - 1]?.timestampMs ?? null,
  };
};

function Dashboard() {
  const { t } = useI18n();
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;
  const {
    runs: liveRuns,
    events: liveEvents,
    summary,
    projection,
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
  const [selectedRequestFilterId, setSelectedRequestFilterId] = useState("all");
  const [selectedTimeWindow, setSelectedTimeWindow] = useState("all");
  const [customRangeStart, setCustomRangeStart] = useState("");
  const [customRangeEnd, setCustomRangeEnd] = useState("");
  const [selectedTimelineWindow, setSelectedTimelineWindow] = useState("all");
  const [selectedTimelineSeriesMode, setSelectedTimelineSeriesMode] = useState("top8");
  const [timelineRangeStart, setTimelineRangeStart] = useState("");
  const [timelineRangeEnd, setTimelineRangeEnd] = useState("");
  const [timelineTimestampQuery, setTimelineTimestampQuery] = useState("");
  const [selectedExportScope, setSelectedExportScope] = useState("visible");
  const [exportJobState, setExportJobState] = useState({
    loading: false,
    format: "",
    jobId: "",
  });
  const [tableFeedFilters, setTableFeedFilters] = useState({
    analytics: createDefaultFeedTableFilters(),
    executionInitial: createDefaultFeedTableFilters(),
    executionOutcome: createDefaultFeedTableFilters(),
    executionProgress: createDefaultFeedTableFilters(),
    executionBestMoments: createDefaultFeedTableFilters(),
  });
  const [analyticsSection, setAnalyticsSection] = useState(ANALYTICS_SECTION_ACTIVITY);
  const [executionsSection, setExecutionsSection] = useState(EXECUTIONS_SECTION_COMPARISON);
  const [feedControls, setFeedControls] = useState({
    analytics: { pageIndex: 0, pageSize: 25, search: "" },
    executionInitial: { pageIndex: 0, pageSize: 6, search: "" },
    executionOutcome: { pageIndex: 0, pageSize: 6, search: "" },
    executionProgress: { pageIndex: 0, pageSize: 25, search: "" },
    executionBestMoments: { pageIndex: 0, pageSize: 25, search: "" },
  });
  const isPerformanceTabActive = activeTab === "performance";
  const isAlgorithmsTabActive = activeTab === "algorithms";
  const isAnalyticsTabActive = activeTab === "analytics";
  const isExecutionsTabActive = activeTab === "executions";
  const isAnalyticsActivitySectionActive =
    isAnalyticsTabActive && analyticsSection === ANALYTICS_SECTION_ACTIVITY;
  const isAnalyticsTopicsSectionActive =
    isAnalyticsTabActive && analyticsSection === ANALYTICS_SECTION_TOPICS;
  const isAnalyticsFeedSectionActive =
    isAnalyticsTabActive && analyticsSection === ANALYTICS_SECTION_FEED;
  const isExecutionsComparisonSectionActive =
    isExecutionsTabActive && executionsSection === EXECUTIONS_SECTION_COMPARISON;
  const isExecutionsInitialSectionActive =
    isExecutionsTabActive && executionsSection === EXECUTIONS_SECTION_INITIAL;
  const isExecutionsOutcomeSectionActive =
    isExecutionsTabActive && executionsSection === EXECUTIONS_SECTION_OUTCOME;
  const isExecutionsProgressSectionActive =
    isExecutionsTabActive && executionsSection === EXECUTIONS_SECTION_PROGRESS;
  const isExecutionsBestSectionActive =
    isExecutionsTabActive && executionsSection === EXECUTIONS_SECTION_BEST;
  const handleAnalyticsSectionChange = useCallback((nextSection) => {
    startTransition(() => {
      setAnalyticsSection(nextSection);
    });
  }, []);
  const handleExecutionsSectionChange = useCallback((nextSection) => {
    startTransition(() => {
      setExecutionsSection(nextSection);
    });
  }, []);
  const updateFeedControl = useCallback((key, patch) => {
    setFeedControls((current) => {
      const nextSlice = {
        ...(current[key] || {}),
        ...patch,
      };

      if (
        current[key]?.pageIndex === nextSlice.pageIndex
        && current[key]?.pageSize === nextSlice.pageSize
        && current[key]?.search === nextSlice.search
      ) {
        return current;
      }

      return {
        ...current,
        [key]: nextSlice,
      };
    });
  }, []);
  const updateTableFeedFilters = useCallback((key, patch) => {
    setTableFeedFilters((current) => ({
      ...current,
      [key]: {
        ...(current[key] || createDefaultFeedTableFilters()),
        ...patch,
      },
    }));
    setFeedControls((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        pageIndex: 0,
      },
    }));
  }, []);
  const shouldFetchDashboardAggregate =
    (activeTab === "overview" || isPerformanceTabActive || isAlgorithmsTabActive || isAnalyticsTabActive)
    && selectedAlgorithm === "all"
    && selectedDataset === "all"
    && selectedStageLens === "all"
    && selectedRunStatus === "all"
    && selectedSearch === "all"
    && selectedRequestFilterId === "all"
    && !hasActiveTimeFilter(selectedTimeWindow, customRangeStart, customRangeEnd);
  const dashboardAggregateQuery = useMonitorDashboardAggregateQuery({
    bucketLimit: 72,
    timelineBucketLimit: 1440,
    enabled: shouldFetchDashboardAggregate,
    staleTime: 15_000,
  });
  const {
    launches: executionRequests,
    refresh: refreshExecutionRequests,
  } = useExecutionQueue(50, 6000);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const selectedRunQuery = useMonitorRunQuery(selectedSeedId, {
    historyLimit: 2000,
    enabled: Boolean(selectedSeedId),
    staleTime: 5_000,
  });
  const selectedRequestQuery = useExecutionLaunchQuery(selectedRequestId, {
    includeMonitor: true,
    historyLimit: 2000,
    eventLimit: 5000,
    enabled: Boolean(selectedRequestId),
    staleTime: 5_000,
  });
  const detailsLoading = selectedRunQuery.isLoading || selectedRunQuery.isFetching;
  const requestDetailsLoading = selectedRequestQuery.isLoading || selectedRequestQuery.isFetching;
  const cachedSelectedRunDetails = selectedRunQuery.data || null;
  const selectedRequestDetails = selectedRequestQuery.data || null;

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

  const requestFilterOptions = useMemo(() => {
    const optionsById = new Map();

    executionRequests.forEach((launch) => {
      const requestId = launch?.requestId ? String(launch.requestId) : "";
      if (!requestId || optionsById.has(requestId)) {
        return;
      }

      optionsById.set(requestId, {
        value: requestId,
        label: `${shortenSeed(requestId)} / ${(launch.algorithms || []).join(", ") || "--"} / ${formatDateTime(launch.requestedAt)}`,
      });
    });

    const fallbackIds = new Set();
    runs.forEach((run) => {
      if (run?.requestId) {
        fallbackIds.add(String(run.requestId));
      }
    });

    snapshotEvents.forEach((event) => {
      if (event?.requestId) {
        fallbackIds.add(String(event.requestId));
      }
    });

    const nowValue = selectedRequestDetails?.requestId || selectedRequestId;
    if (nowValue) {
      fallbackIds.add(String(nowValue));
    }

    fallbackIds.forEach((requestId) => {
      if (!optionsById.has(requestId)) {
        optionsById.set(requestId, {
          value: requestId,
          label: shortenSeed(requestId),
        });
      }
    });

    return [...optionsById.values()];
  }, [executionRequests, runs, snapshotEvents, selectedRequestDetails?.requestId, selectedRequestId]);

  const requestFilterIsActive = selectedRequestFilterId !== "all";

  useEffect(() => {
    if (selectedRequestFilterId === "all") {
      return;
    }

    const requestStillAvailable = requestFilterOptions.some(
      (option) => option.value === selectedRequestFilterId
    );

    if (!requestStillAvailable) {
      setSelectedRequestFilterId("all");
    }
  }, [requestFilterOptions, selectedRequestFilterId]);

  const timeRangeBounds = useMemo(
    () => resolveTimeRangeBounds(selectedTimeWindow, customRangeStart, customRangeEnd),
    [selectedTimeWindow, customRangeStart, customRangeEnd]
  );

  const matchesSelection = useCallback((entry) => {
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
    const entryRequestId = entry.requestId ? String(entry.requestId) : "";
    const matchesRequest = selectedRequestFilterId === "all" || entryRequestId === selectedRequestFilterId;
    const matchesTime = isTimestampWithinRange(getEntryTimestamp(entry), timeRangeBounds);

    return matchesAlgorithm
      && matchesDataset
      && matchesStageLens
      && matchesRunStatus
      && matchesSearch
      && matchesRequest
      && matchesTime;
  }, [
    selectedAlgorithm,
    selectedDataset,
    selectedRequestFilterId,
    selectedRunStatus,
    selectedSearch,
    selectedStageLens,
    timeRangeBounds,
  ]);

  const filteredRuns = useMemo(
    () => runs.filter(matchesSelection),
    [runs, matchesSelection]
  );

  const filteredSnapshotEvents = useMemo(
    () => snapshotEvents.filter(matchesSelection),
    [snapshotEvents, matchesSelection]
  );

  const activeFilterCount = useMemo(
    () =>
      [
        selectedAlgorithm !== "all",
        selectedDataset !== "all",
        selectedStageLens !== "all",
        selectedRunStatus !== "all",
        selectedSearch !== "all",
        selectedRequestFilterId !== "all",
        hasActiveTimeFilter(selectedTimeWindow, customRangeStart, customRangeEnd),
      ].filter(Boolean).length,
    [
      selectedAlgorithm,
      selectedDataset,
      selectedStageLens,
      selectedRunStatus,
      selectedSearch,
      selectedRequestFilterId,
      selectedTimeWindow,
      customRangeStart,
      customRangeEnd,
    ]
  );
  const canUsePersistentDashboardAggregate = activeFilterCount === 0;
  const dashboardAggregate = dashboardAggregateQuery.data || null;
  const canUsePersistentTimelineAggregate =
    canUsePersistentDashboardAggregate
    && Array.isArray(dashboardAggregate?.timelineSeedSeries)
    && dashboardAggregate.timelineSeedSeries.length > 0;
  const shouldBuildSnapshotAnalytics =
    activeTab === "overview"
    || isPerformanceTabActive
    || isAlgorithmsTabActive
    || (isAnalyticsTabActive && !canUsePersistentDashboardAggregate);
  const persistentTimelineSeedSeriesBySeed = useMemo(
    () =>
      new Map(
        (dashboardAggregate?.timelineSeedSeries || [])
          .filter((series) => series?.seedId)
          .map((series) => [series.seedId, series])
      ),
    [dashboardAggregate?.timelineSeedSeries]
  );
  const workspaceFeedFilters = useMemo(
    () => ({
      algorithm: selectedAlgorithm !== "all" ? selectedAlgorithm : undefined,
      datasetKey: selectedDataset !== "all" ? selectedDataset : undefined,
      status: selectedRunStatus !== "all" ? selectedRunStatus : undefined,
      searchLabel: selectedSearch !== "all" ? selectedSearch : undefined,
      requestId: selectedRequestFilterId !== "all" ? selectedRequestFilterId : undefined,
      start: timeRangeBounds.from !== null ? new Date(timeRangeBounds.from).toISOString() : undefined,
      end: timeRangeBounds.to !== null ? new Date(timeRangeBounds.to).toISOString() : undefined,
    }),
    [
      selectedAlgorithm,
      selectedDataset,
      selectedRequestFilterId,
      selectedRunStatus,
      selectedSearch,
      timeRangeBounds.from,
      timeRangeBounds.to,
    ]
  );
  const feedFilterFingerprint = useMemo(
    () => JSON.stringify({
      ...workspaceFeedFilters,
      stageLens: selectedStageLens,
    }),
    [selectedStageLens, workspaceFeedFilters]
  );
  const resolveFeedQueryOptions = useCallback(
    (feedKey, topics, controlSlice = {}) => {
      const tableFilters = tableFeedFilters[feedKey] || createDefaultFeedTableFilters();

      return {
        ...workspaceFeedFilters,
        page: Number(controlSlice.pageIndex || 0) + 1,
        pageSize: controlSlice.pageSize || 25,
        query: controlSlice.search || "",
        topics,
        algorithm:
          tableFilters.algorithm && tableFilters.algorithm !== "all"
            ? tableFilters.algorithm
            : workspaceFeedFilters.algorithm,
        minF1Score: tableFilters.minF1Score || undefined,
        maxF1Score: tableFilters.maxF1Score || undefined,
      };
    },
    [tableFeedFilters, workspaceFeedFilters]
  );

  useEffect(() => {
    setFeedControls((current) => ({
      analytics: { ...current.analytics, pageIndex: 0 },
      executionInitial: { ...current.executionInitial, pageIndex: 0 },
      executionOutcome: { ...current.executionOutcome, pageIndex: 0 },
      executionProgress: { ...current.executionProgress, pageIndex: 0 },
      executionBestMoments: { ...current.executionBestMoments, pageIndex: 0 },
    }));
  }, [feedFilterFingerprint]);

  const analyticsFeedTopics = useMemo(
    () => resolveFeedTopics([], selectedStageLens),
    [selectedStageLens]
  );
  const executionInitialFeedTopics = useMemo(
    () => resolveFeedTopics(["INITIAL_SOLUTION_TOPIC"], selectedStageLens),
    [selectedStageLens]
  );
  const executionOutcomeFeedTopics = useMemo(
    () => resolveFeedTopics(["SOLUTIONS_TOPIC"], selectedStageLens),
    [selectedStageLens]
  );
  const executionProgressFeedTopics = useMemo(
    () => resolveFeedTopics(["LOCAL_SEARCH_PROGRESS_TOPIC"], selectedStageLens),
    [selectedStageLens]
  );
  const executionBestMomentsFeedTopics = useMemo(
    () => resolveFeedTopics(["BEST_SOLUTION_TOPIC"], selectedStageLens),
    [selectedStageLens]
  );

  const analyticsFeedQuery = useMonitorEventFeedQuery({
    ...resolveFeedQueryOptions("analytics", analyticsFeedTopics, feedControls.analytics),
    enabled: isAnalyticsFeedSectionActive,
    staleTime: 10_000,
  });
  const executionInitialFeedQuery = useMonitorEventFeedQuery({
    ...resolveFeedQueryOptions("executionInitial", executionInitialFeedTopics, feedControls.executionInitial),
    enabled:
      isExecutionsInitialSectionActive
      && (selectedStageLens === "all" || executionInitialFeedTopics.length > 0),
    staleTime: 10_000,
  });
  const executionOutcomeFeedQuery = useMonitorEventFeedQuery({
    ...resolveFeedQueryOptions("executionOutcome", executionOutcomeFeedTopics, feedControls.executionOutcome),
    enabled:
      isExecutionsOutcomeSectionActive
      && (selectedStageLens === "all" || executionOutcomeFeedTopics.length > 0),
    staleTime: 10_000,
  });
  const executionProgressFeedQuery = useMonitorEventFeedQuery({
    ...resolveFeedQueryOptions("executionProgress", executionProgressFeedTopics, feedControls.executionProgress),
    enabled:
      isExecutionsProgressSectionActive
      && (selectedStageLens === "all" || executionProgressFeedTopics.length > 0),
    staleTime: 10_000,
  });
  const executionBestMomentsFeedQuery = useMonitorEventFeedQuery({
    ...resolveFeedQueryOptions("executionBestMoments", executionBestMomentsFeedTopics, feedControls.executionBestMoments),
    enabled:
      isExecutionsBestSectionActive
      && (selectedStageLens === "all" || executionBestMomentsFeedTopics.length > 0),
    staleTime: 10_000,
  });

  const historySnapshots = useMemo(
    () => {
      if (!shouldBuildSnapshotAnalytics) {
        return [];
      }

      return filteredRuns.flatMap((run) =>
        (run.history || [])
          .filter((entry) => entry?.topic)
          .map((entry) => extractHistorySnapshot(run, entry))
          .filter(matchesSelection)
      );
    },
    [filteredRuns, matchesSelection, shouldBuildSnapshotAnalytics]
  );

  const analyticsMonitorSnapshots = useMemo(() => {
    if (!shouldBuildSnapshotAnalytics) {
      return [];
    }

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
  }, [filteredSnapshotEvents, historySnapshots, shouldBuildSnapshotAnalytics]);

  const monitorSnapshots = useMemo(
    () => analyticsMonitorSnapshots.slice(0, DASHBOARD_VISIBLE_SNAPSHOT_LIMIT),
    [analyticsMonitorSnapshots]
  );

  const monitorSnapshotAnalytics = useMemo(
    () => buildMonitorSnapshotAnalytics(analyticsMonitorSnapshots),
    [analyticsMonitorSnapshots]
  );

  const {
    initialSolutionEvents,
    localSearchOutcomeEvents,
    localSearchProgressEvents,
    dlsActivityEvents,
    bestSolutionSnapshotEvents,
    rawTopicMetrics: derivedRawTopicMetrics,
    improvementEvents,
    resourceAveragesByAlgorithm: derivedResourceAveragesByAlgorithm,
    resourceAveragesByLocalSearch: derivedResourceAveragesByLocalSearch,
    hourlyActivityMetrics: derivedHourlyActivityMetrics,
    uniqueSeedCount,
    avgInitialF1,
    bestSolutionSnapshotCount,
  } = monitorSnapshotAnalytics;

  const rawTopicMetrics = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.topicMetrics?.length) {
        return dashboardAggregate.topicMetrics;
      }

      return projection?.topicMetrics?.length ? projection.topicMetrics : derivedRawTopicMetrics;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.topicMetrics,
      derivedRawTopicMetrics,
      projection?.topicMetrics,
    ]
  );

  const hourlyActivityMetrics = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.activityBuckets?.length) {
        return dashboardAggregate.activityBuckets;
      }

      return projection?.activityBuckets?.length ? projection.activityBuckets : derivedHourlyActivityMetrics;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.activityBuckets,
      derivedHourlyActivityMetrics,
      projection?.activityBuckets,
    ]
  );

  const resourceAveragesByAlgorithm = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.resourceAveragesByAlgorithm?.length) {
        return dashboardAggregate.resourceAveragesByAlgorithm;
      }

      return derivedResourceAveragesByAlgorithm;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.resourceAveragesByAlgorithm,
      derivedResourceAveragesByAlgorithm,
    ]
  );

  const resourceAveragesByLocalSearch = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.resourceAveragesByLocalSearch?.length) {
        return dashboardAggregate.resourceAveragesByLocalSearch;
      }

      return derivedResourceAveragesByLocalSearch;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.resourceAveragesByLocalSearch,
      derivedResourceAveragesByLocalSearch,
    ]
  );

  const bestSolutionRuns = useMemo(
    () => {
      const bestBySeed = new Map();

      filteredRuns
        .filter((run) => isBestSolutionRun(run))
        .forEach((run) => {
          bestBySeed.set(run.seedId, pickPreferredRun(bestBySeed.get(run.seedId), run));
        });

      analyticsMonitorSnapshots
        .filter((event) => event.topic === "BEST_SOLUTION_TOPIC" && event.seedId)
        .forEach((event) => {
          const promotedRun = promoteBestSolutionEvent(event);
          bestBySeed.set(event.seedId, pickPreferredRun(bestBySeed.get(event.seedId), promotedRun));
        });

      return [...bestBySeed.values()].sort(
        (left, right) => getSortableDateValue(right.updatedAt) - getSortableDateValue(left.updatedAt)
      );
    },
    [analyticsMonitorSnapshots, filteredRuns]
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
    () => {
      if (initialSolutionEvents.length) {
        return new Map(initialSolutionEvents.map((event) => [event.seedId, event]));
      }

      const next = new Map();

      filteredRuns.forEach((run) => {
        if (!run?.seedId || !Array.isArray(run.history)) {
          return;
        }

        const initialEntry = run.history.find((entry) => entry?.topic === "INITIAL_SOLUTION_TOPIC");
        if (!initialEntry) {
          return;
        }

        next.set(run.seedId, extractHistorySnapshot(run, initialEntry));
      });

      return next;
    },
    [filteredRuns, initialSolutionEvents]
  );

  const derivedFinalRunsByAlgorithm = useMemo(() => {
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

  const derivedFinalRunsByRclAlgorithm = useMemo(() => {
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

  const derivedDlsOutcomeSummary = useMemo(() => {
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

  const finalRunsByAlgorithm = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.finalRunsByAlgorithm?.length) {
        return dashboardAggregate.finalRunsByAlgorithm;
      }

      return derivedFinalRunsByAlgorithm;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.finalRunsByAlgorithm,
      derivedFinalRunsByAlgorithm,
    ]
  );

  const finalRunsByRclAlgorithm = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.finalRunsByRclAlgorithm?.length) {
        return dashboardAggregate.finalRunsByRclAlgorithm;
      }

      return derivedFinalRunsByRclAlgorithm;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.finalRunsByRclAlgorithm,
      derivedFinalRunsByRclAlgorithm,
    ]
  );

  const dlsOutcomeSummary = useMemo(
    () => {
      if (canUsePersistentDashboardAggregate && dashboardAggregate?.dlsOutcomeSummary?.length) {
        return dashboardAggregate.dlsOutcomeSummary;
      }

      return derivedDlsOutcomeSummary;
    },
    [
      canUsePersistentDashboardAggregate,
      dashboardAggregate?.dlsOutcomeSummary,
      derivedDlsOutcomeSummary,
    ]
  );

  const finalizedRuns = useMemo(
    () => bestSolutionRuns,
    [bestSolutionRuns]
  );

  useEffect(() => {
    if (filteredRuns.length === 0) {
      setSelectedSeedId("");
      return;
    }

    const stillExists = filteredRuns.some((run) => run.seedId === selectedSeedId);
    if (!selectedSeedId || !stillExists) {
      setSelectedSeedId(filteredRuns[0].seedId);
    }
  }, [filteredRuns, selectedSeedId]);

  const liveSelectedRun = useMemo(
    () => filteredRuns.find((run) => run.seedId === selectedSeedId) || null,
    [filteredRuns, selectedSeedId]
  );

  const selectedRunDetails = useMemo(() => {
    if (!selectedSeedId) {
      return liveSelectedRun;
    }

    if (liveSelectedRun || cachedSelectedRunDetails) {
      return mergeRunDetail(cachedSelectedRunDetails || {}, liveSelectedRun || {});
    }

    return null;
  }, [cachedSelectedRunDetails, liveSelectedRun, selectedSeedId]);


  useEffect(() => {
    if (!executionRequests.length) {
      setSelectedRequestId("");
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
    if (!selectedRequestDetails?.requestId) {
      return;
    }

    refreshExecutionRequests().catch(() => undefined);
  }, [refreshExecutionRequests, selectedRequestDetails?.requestId]);

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
      bestSolutionSnapshots: bestSolutionSnapshotCount,
      bestRun,
      datasetPairs: datasetPairs.size,
      algorithms: new Set(filteredRuns.map((run) => run.rclAlgorithm).filter(Boolean)).size,
    };
  }, [
    filteredRuns,
    initialSolutionEvents.length,
    localSearchOutcomeEvents.length,
    localSearchProgressEvents.length,
    bestSolutionSnapshotCount,
    bestSolutionRuns.length,
  ]);

  const analyticsOverview = useMemo(() => {
    if (canUsePersistentDashboardAggregate && dashboardAggregate?.overview) {
      return {
        rawSnapshots: dashboardAggregate.overview.rawSnapshots || 0,
        rawEvents: dashboardAggregate.overview.rawEvents || 0,
        uniqueSeeds: dashboardAggregate.overview.uniqueSeeds || 0,
        topics: dashboardAggregate.overview.topics || rawTopicMetrics.length,
        avgInitialF1: dashboardAggregate.overview.avgInitialF1 ?? 0,
      };
    }

    return {
      rawSnapshots: monitorSnapshots.length,
      rawEvents: filteredSnapshotEvents.length,
      uniqueSeeds: uniqueSeedCount,
      topics: rawTopicMetrics.length,
      avgInitialF1,
    };
  }, [
    avgInitialF1,
    canUsePersistentDashboardAggregate,
    dashboardAggregate?.overview,
    filteredSnapshotEvents.length,
    monitorSnapshots.length,
    rawTopicMetrics.length,
    uniqueSeedCount,
  ]);

  const persistedSummary = useMemo(
    () => (summary?.totals ? summary : null),
    [summary]
  );

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
      requestId: selectedRequestFilterId === "all" ? null : selectedRequestFilterId,
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
      selectedRequestFilterId,
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
    setSelectedRequestFilterId("all");
    setSelectedTimeWindow("all");
    setCustomRangeStart("");
    setCustomRangeEnd("");
    setSelectedTimelineWindow("all");
    setSelectedTimelineSeriesMode("top8");
    setTimelineRangeStart("");
    setTimelineRangeEnd("");
    setTimelineTimestampQuery("");
    setSelectedExportScope("visible");
    setSelectedSeedId("");
    setSelectedRequestId("");
    setTableFeedFilters({
      analytics: createDefaultFeedTableFilters(),
      executionInitial: createDefaultFeedTableFilters(),
      executionOutcome: createDefaultFeedTableFilters(),
      executionProgress: createDefaultFeedTableFilters(),
      executionBestMoments: createDefaultFeedTableFilters(),
    });
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

  const timelineComparisonRuns = useMemo(
    () => buildTimelineComparisonRuns(filteredRuns, selectedRequestBundle.runs, featuredRun),
    [featuredRun, filteredRuns, selectedRequestBundle.runs]
  );

  const timelineSeriesLimit = useMemo(
    () => timelineSeriesOptions.find((option) => option.value === selectedTimelineSeriesMode)?.limit ?? 8,
    [selectedTimelineSeriesMode]
  );

  const timelineDisplayRuns = useMemo(
    () =>
      selectTimelineRunsForChart(timelineComparisonRuns, {
        featuredSeedId: featuredRun?.seedId || null,
        limit: timelineSeriesLimit,
      }),
    [featuredRun?.seedId, timelineComparisonRuns, timelineSeriesLimit]
  );

  const timelineHiddenRunCount = useMemo(
    () => Math.max(timelineComparisonRuns.length - timelineDisplayRuns.length, 0),
    [timelineComparisonRuns.length, timelineDisplayRuns.length]
  );

  const exportDisabled = useMemo(() => {
    if (exportJobState.loading) {
      return true;
    }

    if (selectedExportScope === "request") {
      return !selectedRequestId || requestDetailsLoading;
    }

    if (selectedExportScope === "run" || selectedExportScope === "timeline") {
      return !featuredRun;
    }

    return false;
  }, [exportJobState.loading, featuredRun, requestDetailsLoading, selectedExportScope, selectedRequestId]);

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
    () =>
      resolveLatestRunsTimestamp(timelineComparisonRuns, initialEventBySeed)
      || fullHistorySource[fullHistorySource.length - 1]?.timestamp
      || featuredRun?.updatedAt
      || null,
    [featuredRun?.updatedAt, fullHistorySource, initialEventBySeed, timelineComparisonRuns]
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
    setSelectedTimelineWindow("all");
    setSelectedTimelineSeriesMode("top8");
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

  const runFeedTableExportJob = useCallback(
    async (format, config = {}) => {
      const requestedFormat = String(format || "json").toLowerCase() === "csv" ? "csv" : "json";
      const toastId = `table-export-${config.feedKey || config.prefix || "feed"}-${requestedFormat}`;
      const queryOptions = resolveFeedQueryOptions(
        config.feedKey,
        config.topics || [],
        feedControls[config.feedKey] || {}
      );

      try {
        setExportJobState({
          loading: true,
          format: requestedFormat,
          jobId: "",
        });
        toast.info("Preparando exportacao completa da tabela...", { toastId });

        const job = await createMonitorExportJob({
          format: requestedFormat,
          scope: "feed",
          prefix: config.prefix || "table-feed",
          topics: config.topics || [],
          algorithm: queryOptions.algorithm || null,
          datasetKey: queryOptions.datasetKey || null,
          status: queryOptions.status || null,
          searchLabel: queryOptions.searchLabel || null,
          requestId: queryOptions.requestId || null,
          seedId: queryOptions.seedId || null,
          start: queryOptions.start || null,
          end: queryOptions.end || null,
          query: queryOptions.query || null,
          minF1Score: queryOptions.minF1Score || null,
          maxF1Score: queryOptions.maxF1Score || null,
          filters: {
            exportScope: "feed",
            algorithm: queryOptions.algorithm || "all",
            dataset: queryOptions.datasetKey || "all",
            requestId: queryOptions.requestId || null,
            seedId: queryOptions.seedId || null,
            timeWindow: selectedTimeWindow,
            search: queryOptions.query || "",
            minF1Score: queryOptions.minF1Score || null,
            maxF1Score: queryOptions.maxF1Score || null,
          },
        });

        let attempts = 0;
        let currentJob = job;

        while (attempts < 60) {
          if (currentJob?.status === "completed") {
            break;
          }

          if (currentJob?.status === "failed") {
            throw new Error(currentJob.error || "Nao foi possivel exportar a tabela.");
          }

          await new Promise((resolve) => {
            window.setTimeout(resolve, 1500);
          });

          currentJob = await getMonitorExportJob(job.jobId);
          attempts += 1;
        }

        if (currentJob?.status !== "completed") {
          throw new Error("A exportacao completa da tabela demorou mais do que o esperado.");
        }

        const download = await downloadMonitorExportJob(currentJob.jobId);
        downloadBlobFile(download.filename, download.blob);
        toast.success("Exportacao da tabela concluida.", { toastId });
      } catch (requestError) {
        toast.error(requestError.message || "Nao foi possivel exportar a tabela.", { toastId });
      } finally {
        setExportJobState({
          loading: false,
          format: "",
          jobId: "",
        });
      }
    },
    [feedControls, resolveFeedQueryOptions, selectedTimeWindow]
  );

  const runAsyncExportJob = useCallback(
    async (format) => {
      const requestedFormat = String(format || "json").toLowerCase() === "csv" ? "csv" : "json";
      const toastId = `export-job-${requestedFormat}-${selectedExportScope}`;

      try {
        setExportJobState({
          loading: true,
          format: requestedFormat,
          jobId: "",
        });
        toast.info("Preparando exportacao no servidor...", { toastId });

        const job = await createMonitorExportJob({
          format: requestedFormat,
          scope: selectedExportScope,
          seedId: featuredRun?.seedId || null,
          requestId: selectedRequestDetails?.requestId || selectedRequestId || null,
          timelineStart: selectedExportScope === "timeline" ? timelineRangeStart || null : null,
          timelineEnd: selectedExportScope === "timeline" ? timelineRangeEnd || null : null,
          timelineTimestampQuery: selectedExportScope === "timeline" ? timelineTimestampQuery || null : null,
          filters: exportSelection.filters,
        });

        setExportJobState({
          loading: true,
          format: requestedFormat,
          jobId: job?.jobId || "",
        });

        let attempts = 0;
        let currentJob = job;

        while (attempts < 60) {
          if (currentJob?.status === "completed") {
            break;
          }

          if (currentJob?.status === "failed") {
            throw new Error(currentJob.error || "Nao foi possivel gerar a exportacao.");
          }

          await new Promise((resolve) => {
            window.setTimeout(resolve, 1500);
          });

          currentJob = await getMonitorExportJob(job.jobId);
          attempts += 1;
        }

        if (currentJob?.status !== "completed") {
          throw new Error("A exportacao demorou mais do que o esperado.");
        }

        const download = await downloadMonitorExportJob(currentJob.jobId);
        downloadBlobFile(download.filename, download.blob);
        toast.success("Exportacao concluida.", { toastId });
      } catch (requestError) {
        toast.error(requestError.message || "Nao foi possivel exportar agora.", { toastId });
      } finally {
        setExportJobState({
          loading: false,
          format: "",
          jobId: "",
        });
      }
    },
    [
      exportSelection.filters,
      featuredRun?.seedId,
      selectedExportScope,
      selectedRequestDetails?.requestId,
      selectedRequestId,
      timelineRangeEnd,
      timelineRangeStart,
      timelineTimestampQuery,
    ]
  );

  const handleAnalyticsTableFiltersChange = useCallback(
    (patch) => updateTableFeedFilters("analytics", patch),
    [updateTableFeedFilters]
  );

  const handleExecutionTableFiltersChange = useCallback(
    (feedKey, patch) => {
      const normalizedFeedKey = {
        initial: "executionInitial",
        outcome: "executionOutcome",
        progress: "executionProgress",
        best: "executionBestMoments",
      }[feedKey] || feedKey;
      updateTableFeedFilters(normalizedFeedKey, patch);
    },
    [updateTableFeedFilters]
  );

  const handleExportCsv = useCallback(() => {
    if (selectedExportScope === "visible") {
      const fileName = `${buildDashboardExportFileName(exportSelection.prefix, exportSelection.filters)}.csv`;
      downloadTextFile(
        fileName,
        buildMonitorSnapshotsCsv(exportSelection.snapshots),
        "text/csv;charset=utf-8"
      );
      return;
    }

    runAsyncExportJob("csv");
  }, [exportSelection.filters, exportSelection.prefix, exportSelection.snapshots, runAsyncExportJob, selectedExportScope]);

  const handleExportJson = useCallback(() => {
    if (selectedExportScope === "visible") {
      const fileName = `${buildDashboardExportFileName(exportSelection.prefix, exportSelection.filters)}.json`;
      const payload = buildDashboardExportPayload({
        filters: exportSelection.filters,
        request: exportSelection.request,
        runs: exportSelection.runs,
        snapshots: exportSelection.snapshots,
        events: exportSelection.events,
      });

      downloadTextFile(fileName, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
      return;
    }

    runAsyncExportJob("json");
  }, [
    exportSelection.events,
    exportSelection.filters,
    exportSelection.prefix,
    exportSelection.request,
    exportSelection.runs,
    exportSelection.snapshots,
    runAsyncExportJob,
    selectedExportScope,
  ]);

  const handleExportAnalyticsCsv = useCallback(
    () => runFeedTableExportJob("csv", {
      feedKey: "analytics",
      topics: analyticsFeedTopics,
      prefix: "analytics-feed",
    }),
    [analyticsFeedTopics, runFeedTableExportJob]
  );

  const handleExportAnalyticsJson = useCallback(
    () => runFeedTableExportJob("json", {
      feedKey: "analytics",
      topics: analyticsFeedTopics,
      prefix: "analytics-feed",
    }),
    [analyticsFeedTopics, runFeedTableExportJob]
  );

  const handleExportInitialSolutionsCsv = useCallback(
    () => runFeedTableExportJob("csv", {
      feedKey: "executionInitial",
      topics: executionInitialFeedTopics,
      prefix: "initial-solutions",
    }),
    [executionInitialFeedTopics, runFeedTableExportJob]
  );

  const handleExportInitialSolutionsJson = useCallback(
    () => runFeedTableExportJob("json", {
      feedKey: "executionInitial",
      topics: executionInitialFeedTopics,
      prefix: "initial-solutions",
    }),
    [executionInitialFeedTopics, runFeedTableExportJob]
  );

  const handleExportLocalSearchOutcomesCsv = useCallback(
    () => runFeedTableExportJob("csv", {
      feedKey: "executionOutcome",
      topics: executionOutcomeFeedTopics,
      prefix: "local-search-outcomes",
    }),
    [executionOutcomeFeedTopics, runFeedTableExportJob]
  );

  const handleExportLocalSearchOutcomesJson = useCallback(
    () => runFeedTableExportJob("json", {
      feedKey: "executionOutcome",
      topics: executionOutcomeFeedTopics,
      prefix: "local-search-outcomes",
    }),
    [executionOutcomeFeedTopics, runFeedTableExportJob]
  );

  const handleExportLocalSearchProgressCsv = useCallback(
    () => runFeedTableExportJob("csv", {
      feedKey: "executionProgress",
      topics: executionProgressFeedTopics,
      prefix: "local-search-progress",
    }),
    [executionProgressFeedTopics, runFeedTableExportJob]
  );

  const handleExportLocalSearchProgressJson = useCallback(
    () => runFeedTableExportJob("json", {
      feedKey: "executionProgress",
      topics: executionProgressFeedTopics,
      prefix: "local-search-progress",
    }),
    [executionProgressFeedTopics, runFeedTableExportJob]
  );

  const handleExportBestSolutionMomentsCsv = useCallback(
    () => runFeedTableExportJob("csv", {
      feedKey: "executionBestMoments",
      topics: executionBestMomentsFeedTopics,
      prefix: "best-solution-moments",
    }),
    [executionBestMomentsFeedTopics, runFeedTableExportJob]
  );

  const handleExportBestSolutionMomentsJson = useCallback(
    () => runFeedTableExportJob("json", {
      feedKey: "executionBestMoments",
      topics: executionBestMomentsFeedTopics,
      prefix: "best-solution-moments",
    }),
    [executionBestMomentsFeedTopics, runFeedTableExportJob]
  );

  const fullTimelineComparison = useMemo(() => {
    let snapshotCount = 0;
    let minTimestampMs = null;
    let maxTimestampMs = null;

    const datasets = timelineDisplayRuns
      .map((run, index) => {
        const fallbackEvent = initialEventBySeed.get(run.seedId);
        const persistentSeries = canUsePersistentTimelineAggregate
          ? persistentTimelineSeedSeriesBySeed.get(run.seedId)
          : null;
        const points = persistentSeries
          ? buildRunTimelinePointsFromAggregate(persistentSeries, {
            fallbackEvent,
            run,
            range: timelineRangeBounds,
            query: timelineTimestampQuery,
            maxPoints: 720,
          })
          : buildRunTimelinePoints(run, {
            fallbackEvent,
            range: timelineRangeBounds,
            query: timelineTimestampQuery,
            maxPoints: 720,
          });

        if (!points.length) {
          return null;
        }

        snapshotCount += points.length;
        minTimestampMs = minTimestampMs === null
          ? points[0]?.x ?? null
          : Math.min(minTimestampMs, points[0]?.x ?? minTimestampMs);
        maxTimestampMs = maxTimestampMs === null
          ? points[points.length - 1]?.x ?? null
          : Math.max(maxTimestampMs, points[points.length - 1]?.x ?? maxTimestampMs);

        const color = getTimelineSeriesColor(index);
        const isFocused = run.seedId === featuredRun?.seedId;
        const borderColor = isFocused ? color : hexToRgba(color, 0.72);

        return {
          label: `${shortenSeed(run.seedId)} · ${run.rclAlgorithm || "GRASP-FS"}`,
          data: points,
          borderColor,
          backgroundColor: hexToRgba(color, isFocused ? 0.16 : 0.1),
          borderWidth: isFocused ? 2.8 : 1.8,
          pointRadius: 0,
          pointHoverRadius: isFocused ? 4 : 3,
          pointHitRadius: 12,
          borderCapStyle: "round",
          borderJoinStyle: "round",
          cubicInterpolationMode: "monotone",
          tension: 0.22,
          fill: false,
        };
      })
      .filter(Boolean);

    return {
      datasets,
      snapshotCount,
      minTimestampMs,
      maxTimestampMs,
      timeSpanMs:
        minTimestampMs !== null && maxTimestampMs !== null
          ? Math.max(maxTimestampMs - minTimestampMs, 0)
          : 0,
    };
  }, [
    canUsePersistentTimelineAggregate,
    featuredRun?.seedId,
    initialEventBySeed,
    persistentTimelineSeedSeriesBySeed,
    timelineDisplayRuns,
    timelineRangeBounds,
    timelineTimestampQuery,
  ]);

  const fullTimelineChartData = useMemo(() => {
    if (!fullTimelineComparison.datasets.length) {
      return {
        datasets: [
          {
            label: "F1-Score",
            data: [],
            borderColor: "#4361ee",
            backgroundColor: "rgba(67, 97, 238, 0.10)",
            pointRadius: 0,
            tension: 0.25,
            fill: false,
          },
        ],
      };
    }

    return {
      datasets: fullTimelineComparison.datasets,
    };
  }, [fullTimelineComparison.datasets]);

  const fullTimelineChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      animation: false,
      interaction: {
        mode: fullTimelineComparison.datasets.length > 8 ? "nearest" : "index",
        axis: "x",
        intersect: false,
      },
      plugins: {
        decimation: {
          enabled: fullTimelineComparison.datasets.some((dataset) => (dataset.data?.length || 0) > 400),
          algorithm: "lttb",
          samples: 300,
          threshold: 400,
        },
        legend: {
          display: fullTimelineComparison.datasets.length <= 12,
          position: "bottom",
          align: "start",
          labels: {
            usePointStyle: true,
            pointStyle: "line",
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            color: darkMode ? "rgba(226, 232, 240, 0.92)" : "rgba(51, 65, 85, 0.92)",
          },
        },
        tooltip: {
          displayColors: true,
          mode: fullTimelineComparison.datasets.length > 8 ? "nearest" : "index",
          intersect: false,
          padding: 10,
          backgroundColor: darkMode ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)",
          titleColor: darkMode ? "#f8fafc" : "#0f172a",
          bodyColor: darkMode ? "#e2e8f0" : "#1e293b",
          borderColor: darkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(148, 163, 184, 0.25)",
          borderWidth: 1,
          callbacks: {
            title: (items) => formatDateTime(items?.[0]?.raw?.timestamp ?? items?.[0]?.parsed?.x),
            label: (context) => {
              const rawPoint = context.raw || {};
              const summary = `${context.dataset.label}: ${formatCompactPercent(context.parsed?.y)}`;
              const elapsedLabel = rawPoint.elapsedMs !== undefined ? formatDuration(rawPoint.elapsedMs) : "--";
              return `${summary} | ${t("dashboard.timelineElapsedAxis")}: ${elapsedLabel}`;
            },
            afterLabel: (context) => {
              const rawPoint = context.raw || {};
              const parts = [];
              if (rawPoint.order) {
                parts.push(`#${rawPoint.order}`);
              }
              if (rawPoint.stage) {
                parts.push(getStageLabel(rawPoint.stage));
              }
              return parts.join(" · ");
            },
          },
        },
      },
      elements: {
        line: {
          borderCapStyle: "round",
          borderJoinStyle: "round",
        },
        point: {
          radius: 0,
          hoverRadius: fullTimelineComparison.snapshotCount > 600 ? 2 : 4,
          hitRadius: 12,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            stepSize: 10,
            color: darkMode ? "rgba(203, 213, 225, 0.85)" : "rgba(71, 85, 105, 0.9)",
            callback: (value) => `${value}%`,
          },
          grid: {
            color: darkMode ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.2)",
            drawBorder: false,
          },
        },
        x: {
          type: "linear",
          min: fullTimelineComparison.minTimestampMs || undefined,
          suggestedMax: fullTimelineComparison.maxTimestampMs || undefined,
          title: {
            display: true,
            text: t("dashboard.timelineTimestampAxis"),
            color: darkMode ? "rgba(226, 232, 240, 0.85)" : "rgba(51, 65, 85, 0.9)",
          },
          ticks: {
            maxRotation: 0,
            color: darkMode ? "rgba(203, 213, 225, 0.85)" : "rgba(71, 85, 105, 0.9)",
            callback: (value) => formatTimelineAxisTick(value, fullTimelineComparison.timeSpanMs),
          },
          grid: {
            color: darkMode ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.14)",
            drawBorder: false,
          },
        },
      },
    }),
    [
      darkMode,
      fullTimelineComparison.maxTimestampMs,
      fullTimelineComparison.minTimestampMs,
      fullTimelineComparison.datasets,
      fullTimelineComparison.snapshotCount,
      fullTimelineComparison.datasets.length,
      fullTimelineComparison.timeSpanMs,
      t,
    ]
  );

  const aggregatedResourceSeries = useMemo(
    () => {
      if (canUsePersistentTimelineAggregate) {
        const persistentSeries = timelineComparisonRuns
          .map((run) => persistentTimelineSeedSeriesBySeed.get(run.seedId))
          .filter(Boolean);

        if (persistentSeries.length) {
          return buildAggregatedResourceSeriesFromSeedSeries(persistentSeries, {
            range: timelineRangeBounds,
            query: timelineTimestampQuery,
          });
        }
      }

      return buildAggregatedResourceSeries(timelineComparisonRuns, {
        initialEventBySeed,
        range: timelineRangeBounds,
        query: timelineTimestampQuery,
      });
    },
    [
      canUsePersistentTimelineAggregate,
      initialEventBySeed,
      persistentTimelineSeedSeriesBySeed,
      timelineComparisonRuns,
      timelineRangeBounds,
      timelineTimestampQuery,
    ]
  );

  const resourceChartData = useMemo(() => {
    const baseCpuDataset = {
      label: "CPU Usage (%)",
      borderColor: "#ff8c42",
      backgroundColor: "rgba(255, 140, 66, 0.12)",
      pointRadius: 0,
      pointHoverRadius: 3,
      pointHitRadius: 10,
      borderWidth: 2,
      borderCapStyle: "round",
      borderJoinStyle: "round",
      cubicInterpolationMode: "monotone",
      tension: 0.2,
      fill: true,
    };

    const baseMemoryDataset = {
      label: "Memory Usage (%)",
      borderColor: "#11b5ae",
      backgroundColor: "rgba(17, 181, 174, 0.12)",
      pointRadius: 0,
      pointHoverRadius: 3,
      pointHitRadius: 10,
      borderWidth: 2,
      borderCapStyle: "round",
      borderJoinStyle: "round",
      cubicInterpolationMode: "monotone",
      tension: 0.2,
      fill: true,
    };

    if (!aggregatedResourceSeries.cpuPoints.length && !aggregatedResourceSeries.memoryPoints.length) {
      return {
        datasets: [
          {
            ...baseCpuDataset,
            data: [],
          },
          {
            ...baseMemoryDataset,
            data: [],
          },
        ],
      };
    }

    return {
      datasets: [
        {
          ...baseCpuDataset,
          data: aggregatedResourceSeries.cpuPoints,
        },
        {
          ...baseMemoryDataset,
          data: aggregatedResourceSeries.memoryPoints,
        },
      ],
    };
  }, [aggregatedResourceSeries.cpuPoints, aggregatedResourceSeries.memoryPoints]);

  const resourceChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      animation: false,
      interaction: {
        mode: "index",
        axis: "x",
        intersect: false,
      },
      plugins: {
        decimation: {
          enabled: [aggregatedResourceSeries.cpuPoints, aggregatedResourceSeries.memoryPoints].some(
            (series) => (series?.length || 0) > 300
          ),
          algorithm: "lttb",
          samples: 240,
          threshold: 300,
        },
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            usePointStyle: true,
            pointStyle: "line",
            boxWidth: 10,
            boxHeight: 10,
            padding: 14,
            color: darkMode ? "rgba(226, 232, 240, 0.92)" : "rgba(51, 65, 85, 0.92)",
          },
        },
        tooltip: {
          displayColors: true,
          mode: "index",
          intersect: false,
          padding: 10,
          backgroundColor: darkMode ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)",
          titleColor: darkMode ? "#f8fafc" : "#0f172a",
          bodyColor: darkMode ? "#e2e8f0" : "#1e293b",
          borderColor: darkMode ? "rgba(148, 163, 184, 0.3)" : "rgba(148, 163, 184, 0.25)",
          borderWidth: 1,
          callbacks: {
            title: (items) => formatDateTime(items?.[0]?.raw?.x ?? items?.[0]?.parsed?.x),
            label: (context) => {
              const rawPoint = context.raw || {};
              const summary = `${context.dataset.label}: ${formatCompactPercent(context.parsed?.y)}`;
              const sampleCount = rawPoint.sampleCount ?? 0;
              const runCount = rawPoint.runCount ?? 0;
              return `${summary} | ${t("dashboard.timelineVisibleRuns", {
                runs: runCount,
                snapshots: sampleCount,
              })}`;
            },
          },
        },
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: aggregatedResourceSeries.bucketCount > 300 ? 2 : 4,
          hitRadius: 10,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            stepSize: 10,
            color: darkMode ? "rgba(203, 213, 225, 0.85)" : "rgba(71, 85, 105, 0.9)",
            callback: (value) => `${value}%`,
          },
          grid: {
            color: darkMode ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.2)",
            drawBorder: false,
          },
        },
        x: {
          type: "linear",
          min: aggregatedResourceSeries.minTimestampMs || undefined,
          suggestedMax: aggregatedResourceSeries.maxTimestampMs || undefined,
          ticks: {
            maxRotation: 0,
            color: darkMode ? "rgba(203, 213, 225, 0.85)" : "rgba(71, 85, 105, 0.9)",
            callback: (value) =>
              formatTimelineAxisTick(
                value,
                aggregatedResourceSeries.maxTimestampMs !== null && aggregatedResourceSeries.minTimestampMs !== null
                  ? aggregatedResourceSeries.maxTimestampMs - aggregatedResourceSeries.minTimestampMs
                  : 0
              ),
          },
          grid: {
            color: darkMode ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.14)",
            drawBorder: false,
          },
        },
      },
    }),
    [
      aggregatedResourceSeries.bucketCount,
      aggregatedResourceSeries.cpuPoints,
      aggregatedResourceSeries.maxTimestampMs,
      aggregatedResourceSeries.memoryPoints,
      aggregatedResourceSeries.minTimestampMs,
      darkMode,
      t,
    ]
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
      parsing: false,
      normalized: true,
      animation: false,
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
    if (!isPerformanceTabActive) {
      return buildEmptyDoughnutData();
    }

    const aggregateInitialCount = canUsePersistentDashboardAggregate && dashboardAggregate?.finalRunsByRclAlgorithm?.length
      ? dashboardAggregate.finalRunsByRclAlgorithm.reduce(
          (total, entry) => total + Number(entry.initialSeedCount || 0),
          0
        )
      : 0;
    const aggregateOutcomeCount = canUsePersistentDashboardAggregate && dashboardAggregate?.dlsOutcomeSummary?.length
      ? dashboardAggregate.dlsOutcomeSummary.reduce(
          (total, entry) => total + Number(entry.visibleOutcomeSeedCount || 0),
          0
        )
      : 0;
    const aggregateBestCount = canUsePersistentDashboardAggregate && dashboardAggregate?.finalRunsByAlgorithm?.length
      ? dashboardAggregate.finalRunsByAlgorithm.reduce(
          (total, entry) => total + Number(entry.runCount || 0),
          0
        )
      : 0;

    const distribution = [
      ["Initial Solution", aggregateInitialCount || initialSolutionEvents.length],
      ["Local Search Final", aggregateOutcomeCount || localSearchOutcomeEvents.length],
      ["Best Solution", aggregateBestCount || bestSolutionRuns.length],
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
  }, [
    bestSolutionRuns.length,
    canUsePersistentDashboardAggregate,
    dashboardAggregate?.dlsOutcomeSummary,
    dashboardAggregate?.finalRunsByAlgorithm,
    dashboardAggregate?.finalRunsByRclAlgorithm,
    initialSolutionEvents.length,
    isPerformanceTabActive,
    localSearchOutcomeEvents.length,
  ]);

  const stageDistributionOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
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
    if (canUsePersistentDashboardAggregate && dashboardAggregate?.finalRunsByRclAlgorithm?.length) {
      return dashboardAggregate.finalRunsByRclAlgorithm
        .map((entry) => ({
          algorithm: entry.algorithm || "Unknown",
          count: Number(entry.initialSeedCount || 0),
          bestInitialF1Score: Number.NEGATIVE_INFINITY,
          bestFinalF1Score: getNumericScore(entry.bestRun?.bestF1Score, 0),
        }))
        .filter((entry) => entry.count > 0)
        .sort((left, right) => right.count - left.count);
    }

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
  }, [canUsePersistentDashboardAggregate, dashboardAggregate?.finalRunsByRclAlgorithm, initialSolutionEvents, preferredRunBySeed]);

  const localSearchOutcomesBySearch = useMemo(() => {
    if (canUsePersistentDashboardAggregate && dashboardAggregate?.dlsOutcomeSummary?.length) {
      return dashboardAggregate.dlsOutcomeSummary
        .map((entry) => ({
          search: getLocalSearchMetricLabel(entry),
          count: Number(entry.visibleOutcomeSeedCount || 0),
          bestF1Score: getNumericScore(entry.bestOutcome?.bestF1Score ?? entry.avgLocalF1Score, 0),
        }))
        .filter((entry) => entry.count > 0 || entry.bestF1Score > 0)
        .sort((left, right) => right.bestF1Score - left.bestF1Score);
    }

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
  }, [canUsePersistentDashboardAggregate, dashboardAggregate?.dlsOutcomeSummary, localSearchOutcomeEvents]);

  const initialSolutionsChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Initial solutions");
    }

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
  }, [initialSolutionsByAlgorithm, isPerformanceTabActive]);

  const localSearchPerformanceChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Local-search outcomes");
    }

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
  }, [isPerformanceTabActive, localSearchOutcomesBySearch]);

  const finalSolutionsChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Final solutions");
    }

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
  }, [finalRunsByAlgorithm, isPerformanceTabActive]);

  const averageCpuChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Average CPU");
    }

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
  }, [isPerformanceTabActive, resourceAveragesByAlgorithm]);

  const averageMemoryChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Average memory");
    }

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
  }, [isPerformanceTabActive, resourceAveragesByAlgorithm]);

  const averageCpuByLocalSearchChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Average CPU");
    }

    if (!resourceAveragesByLocalSearch.length) {
      return buildEmptyBarData("Average CPU");
    }

    const labels = resourceAveragesByLocalSearch.map((entry) => getLocalSearchMetricLabel(entry));
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
  }, [isPerformanceTabActive, resourceAveragesByLocalSearch]);

  const averageMemoryByLocalSearchChartData = useMemo(() => {
    if (!isPerformanceTabActive) {
      return buildEmptyBarData("Average memory");
    }

    if (!resourceAveragesByLocalSearch.length) {
      return buildEmptyBarData("Average memory");
    }

    const labels = resourceAveragesByLocalSearch.map((entry) => getLocalSearchMetricLabel(entry));
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
  }, [isPerformanceTabActive, resourceAveragesByLocalSearch]);

  const hourlyActivityChartData = useMemo(() => {
    if (!isAnalyticsActivitySectionActive) {
      return buildEmptyBarData("Hourly activity");
    }

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
  }, [hourlyActivityMetrics, isAnalyticsActivitySectionActive, t]);

  const hourlyActivityChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      animation: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        decimation: {
          enabled: hourlyActivityMetrics.length > 120,
          algorithm: "lttb",
          samples: 72,
          threshold: 120,
        },
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
    if (!isAnalyticsTopicsSectionActive) {
      return buildEmptyBarData("Topic volume");
    }

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
  }, [isAnalyticsTopicsSectionActive, rawTopicMetrics]);

  const analyticsFeed = analyticsFeedQuery.data || createEmptyPaginatedFeed(feedControls.analytics.pageSize);
  const executionInitialFeed = executionInitialFeedQuery.data
    || createEmptyPaginatedFeed(feedControls.executionInitial.pageSize);
  const executionOutcomeFeed = executionOutcomeFeedQuery.data
    || createEmptyPaginatedFeed(feedControls.executionOutcome.pageSize);
  const executionProgressFeed = executionProgressFeedQuery.data
    || createEmptyPaginatedFeed(feedControls.executionProgress.pageSize);
  const executionBestMomentsFeed = executionBestMomentsFeedQuery.data
    || createEmptyPaginatedFeed(feedControls.executionBestMoments.pageSize);

  const pagedAnalyticsFeedEvents = useMemo(
    () => (isAnalyticsFeedSectionActive ? analyticsFeed.items.map(extractEventSnapshot) : []),
    [analyticsFeed.items, isAnalyticsFeedSectionActive]
  );
  const pagedInitialSolutionEvents = useMemo(
    () => (isExecutionsInitialSectionActive ? executionInitialFeed.items.map(extractEventSnapshot) : []),
    [executionInitialFeed.items, isExecutionsInitialSectionActive]
  );
  const pagedLocalSearchOutcomeEvents = useMemo(
    () => (isExecutionsOutcomeSectionActive ? executionOutcomeFeed.items.map(extractEventSnapshot) : []),
    [executionOutcomeFeed.items, isExecutionsOutcomeSectionActive]
  );
  const pagedLocalSearchProgressEvents = useMemo(
    () => (isExecutionsProgressSectionActive ? executionProgressFeed.items.map(extractEventSnapshot) : []),
    [executionProgressFeed.items, isExecutionsProgressSectionActive]
  );
  const pagedBestSolutionMomentEvents = useMemo(
    () => (isExecutionsBestSectionActive ? executionBestMomentsFeed.items.map(extractEventSnapshot) : []),
    [executionBestMomentsFeed.items, isExecutionsBestSectionActive]
  );

  const analyticsFeedServerPagination = useMemo(
    () => ({
      pageIndex: Math.max((analyticsFeed.pagination?.page || 1) - 1, 0),
      pageSize: analyticsFeed.pagination?.pageSize || feedControls.analytics.pageSize,
      totalEntries: analyticsFeed.pagination?.total || 0,
      pageCount: analyticsFeed.pagination?.totalPages || 1,
      search: feedControls.analytics.search,
      onPageChange: (pageIndex) => updateFeedControl("analytics", { pageIndex }),
      onPageSizeChange: (pageSize) => updateFeedControl("analytics", { pageIndex: 0, pageSize }),
      onSearchChange: (search) => updateFeedControl("analytics", { pageIndex: 0, search }),
    }),
    [analyticsFeed.pagination?.page, analyticsFeed.pagination?.pageSize, analyticsFeed.pagination?.total, analyticsFeed.pagination?.totalPages, feedControls.analytics.pageSize, feedControls.analytics.search, updateFeedControl]
  );

  const executionInitialServerPagination = useMemo(
    () => ({
      pageIndex: Math.max((executionInitialFeed.pagination?.page || 1) - 1, 0),
      pageSize: executionInitialFeed.pagination?.pageSize || feedControls.executionInitial.pageSize,
      totalEntries: executionInitialFeed.pagination?.total || 0,
      pageCount: executionInitialFeed.pagination?.totalPages || 1,
      search: feedControls.executionInitial.search,
      onPageChange: (pageIndex) => updateFeedControl("executionInitial", { pageIndex }),
      onPageSizeChange: (pageSize) => updateFeedControl("executionInitial", { pageIndex: 0, pageSize }),
      onSearchChange: (search) => updateFeedControl("executionInitial", { pageIndex: 0, search }),
    }),
    [executionInitialFeed.pagination?.page, executionInitialFeed.pagination?.pageSize, executionInitialFeed.pagination?.total, executionInitialFeed.pagination?.totalPages, feedControls.executionInitial.pageSize, feedControls.executionInitial.search, updateFeedControl]
  );

  const executionOutcomeServerPagination = useMemo(
    () => ({
      pageIndex: Math.max((executionOutcomeFeed.pagination?.page || 1) - 1, 0),
      pageSize: executionOutcomeFeed.pagination?.pageSize || feedControls.executionOutcome.pageSize,
      totalEntries: executionOutcomeFeed.pagination?.total || 0,
      pageCount: executionOutcomeFeed.pagination?.totalPages || 1,
      search: feedControls.executionOutcome.search,
      onPageChange: (pageIndex) => updateFeedControl("executionOutcome", { pageIndex }),
      onPageSizeChange: (pageSize) => updateFeedControl("executionOutcome", { pageIndex: 0, pageSize }),
      onSearchChange: (search) => updateFeedControl("executionOutcome", { pageIndex: 0, search }),
    }),
    [executionOutcomeFeed.pagination?.page, executionOutcomeFeed.pagination?.pageSize, executionOutcomeFeed.pagination?.total, executionOutcomeFeed.pagination?.totalPages, feedControls.executionOutcome.pageSize, feedControls.executionOutcome.search, updateFeedControl]
  );

  const executionProgressServerPagination = useMemo(
    () => ({
      pageIndex: Math.max((executionProgressFeed.pagination?.page || 1) - 1, 0),
      pageSize: executionProgressFeed.pagination?.pageSize || feedControls.executionProgress.pageSize,
      totalEntries: executionProgressFeed.pagination?.total || 0,
      pageCount: executionProgressFeed.pagination?.totalPages || 1,
      search: feedControls.executionProgress.search,
      onPageChange: (pageIndex) => updateFeedControl("executionProgress", { pageIndex }),
      onPageSizeChange: (pageSize) => updateFeedControl("executionProgress", { pageIndex: 0, pageSize }),
      onSearchChange: (search) => updateFeedControl("executionProgress", { pageIndex: 0, search }),
    }),
    [executionProgressFeed.pagination?.page, executionProgressFeed.pagination?.pageSize, executionProgressFeed.pagination?.total, executionProgressFeed.pagination?.totalPages, feedControls.executionProgress.pageSize, feedControls.executionProgress.search, updateFeedControl]
  );

  const executionBestMomentsServerPagination = useMemo(
    () => ({
      pageIndex: Math.max((executionBestMomentsFeed.pagination?.page || 1) - 1, 0),
      pageSize: executionBestMomentsFeed.pagination?.pageSize || feedControls.executionBestMoments.pageSize,
      totalEntries: executionBestMomentsFeed.pagination?.total || 0,
      pageCount: executionBestMomentsFeed.pagination?.totalPages || 1,
      search: feedControls.executionBestMoments.search,
      onPageChange: (pageIndex) => updateFeedControl("executionBestMoments", { pageIndex }),
      onPageSizeChange: (pageSize) => updateFeedControl("executionBestMoments", { pageIndex: 0, pageSize }),
      onSearchChange: (search) => updateFeedControl("executionBestMoments", { pageIndex: 0, search }),
    }),
    [executionBestMomentsFeed.pagination?.page, executionBestMomentsFeed.pagination?.pageSize, executionBestMomentsFeed.pagination?.total, executionBestMomentsFeed.pagination?.totalPages, feedControls.executionBestMoments.pageSize, feedControls.executionBestMoments.search, updateFeedControl]
  );

  const visibleBestSolutionRuns = useMemo(
    () => (isExecutionsBestSectionActive ? limitDashboardRows(bestSolutionRuns) : []),
    [bestSolutionRuns, isExecutionsBestSectionActive]
  );

  const resourceSummaryTableData = useMemo(
    () => {
      const columns = [
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Avg CPU", accessor: "avgCpu", align: "left" },
        { Header: "Avg Memory", accessor: "avgMemory", align: "left" },
        { Header: "Avg Memory %", accessor: "avgMemoryPercent", align: "left" },
        { Header: "Samples", accessor: "samples", align: "left" },
      ];

      if (!isAlgorithmsTabActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: resourceAveragesByAlgorithm.map((entry) => ({
          algorithm: entry.algorithm,
          avgCpu: formatMetric(entry.avgCpuUsage, "%"),
          avgMemory: formatMetric(entry.avgMemoryUsage, " MB"),
          avgMemoryPercent: formatMetric(entry.avgMemoryUsagePercent, "%"),
          samples: entry.sampleCount,
        })),
      };
    },
    [isAlgorithmsTabActive, resourceAveragesByAlgorithm]
  );

  const localSearchResourceSummaryTableData = useMemo(
    () => {
      const columns = [
        { Header: "Local Search", accessor: "algorithm", align: "left" },
        { Header: "Avg CPU", accessor: "avgCpu", align: "left" },
        { Header: "Avg Memory", accessor: "avgMemory", align: "left" },
        { Header: "Avg Memory %", accessor: "avgMemoryPercent", align: "left" },
        { Header: "Samples", accessor: "samples", align: "left" },
      ];

      if (!isAlgorithmsTabActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: resourceAveragesByLocalSearch.map((entry) => ({
          algorithm: getLocalSearchMetricLabel(entry),
          avgCpu: formatMetric(entry.avgCpuUsage, "%"),
          avgMemory: formatMetric(entry.avgMemoryUsage, " MB"),
          avgMemoryPercent: formatMetric(entry.avgMemoryUsagePercent, "%"),
          samples: entry.sampleCount,
        })),
      };
    },
    [isAlgorithmsTabActive, resourceAveragesByLocalSearch]
  );

  const finalSolutionsChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,
      animation: false,
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
    () => {
      const columns = [
        { Header: "Time", accessor: "timestamp", align: "left" },
        { Header: "RCL", accessor: "algorithm", align: "left" },
        { Header: "Initial Solution", accessor: "solution", align: "left" },
        { Header: "Initial F1", accessor: "initialF1", align: "left" },
        { Header: "Global Runtime", accessor: "runtime", align: "left" },
        { Header: "RCL / Solution Size", accessor: "sizes", align: "left" },
        { Header: "Search Plan", accessor: "searchPlan", align: "left" },
        { Header: "Best After Search", accessor: "bestAfterSearch", align: "left" },
        { Header: "Dataset", accessor: "dataset", align: "left" },
      ];

      if (!isExecutionsInitialSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: pagedInitialSolutionEvents.map((event) => {
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
          runtime: (
            <MDBox>
              <MDTypography variant="button" fontWeight="medium" color="dark">
                {formatElapsedDuration(
                  resolveRunStartTimestamp(linkedBestRun || {}, event),
                  resolveRunEndTimestamp(linkedBestRun || {})
                )}
              </MDTypography>
              <MDTypography variant="caption" color="text">
                {String(linkedBestRun?.status || "running").toLowerCase()}
              </MDTypography>
            </MDBox>
          ),
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
      };
    },
    [isExecutionsInitialSectionActive, pagedInitialSolutionEvents, preferredRunBySeed]
  );

  const localSearchTableData = useMemo(
    () => {
      const columns = [
        { Header: "Search", accessor: "search", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Iteration", accessor: "iteration", align: "left" },
        { Header: "Solution", accessor: "solution", align: "left" },
        { Header: "Local F1", accessor: "localF1", align: "left" },
        { Header: "Delta vs initial", accessor: "deltaInitial", align: "left" },
        { Header: "Final Best", accessor: "finalBest", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
      ];

      if (!isExecutionsOutcomeSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: pagedLocalSearchOutcomeEvents.map((event) => {
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
      };
    },
    [initialEventBySeed, isExecutionsOutcomeSectionActive, pagedLocalSearchOutcomeEvents, preferredRunBySeed]
  );

  const localSearchProgressTableData = useMemo(
    () => {
      const columns = [
        { Header: "Search", accessor: "search", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Iteration", accessor: "iteration", align: "left" },
        { Header: "Candidate", accessor: "candidate", align: "left" },
        { Header: "F1", accessor: "f1", align: "left" },
        { Header: "Delta", accessor: "delta", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
      ];

      if (!isExecutionsProgressSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: pagedLocalSearchProgressEvents.map((event) => ({
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
      };
    },
    [isExecutionsProgressSectionActive, pagedLocalSearchProgressEvents]
  );

  const rawTopicTableData = useMemo(
    () => {
      const columns = [
        { Header: "Topic", accessor: "topic", align: "left" },
        { Header: "Snapshots", accessor: "count", align: "left" },
        { Header: "Unique Seeds", accessor: "uniqueSeeds", align: "left" },
        { Header: "Avg F1", accessor: "avgScore", align: "left" },
        { Header: "Best F1", accessor: "bestScore", align: "left" },
      ];

      if (!isAnalyticsTopicsSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
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
      };
    },
    [isAnalyticsTopicsSectionActive, rawTopicMetrics]
  );

  const rawSolutionFeedTableData = useMemo(
    () => {
      const columns = [
        { Header: "Time", accessor: "timestamp", align: "left" },
        { Header: "Topic", accessor: "topic", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Search / Stage", accessor: "search", align: "left" },
        { Header: "Solution", accessor: "solution", align: "left" },
        { Header: "F1", accessor: "score", align: "left" },
        { Header: "Delta", accessor: "delta", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
        { Header: "Dataset", accessor: "dataset", align: "left" },
      ];

      if (!isAnalyticsFeedSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: pagedAnalyticsFeedEvents.map((event) => ({
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
      };
    },
    [isAnalyticsFeedSectionActive, pagedAnalyticsFeedEvents]
  );

  const bestSolutionsDetailedTableData = useMemo(
    () => {
      const columns = [
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Workflow", accessor: "workflow", align: "left" },
        { Header: "Best Solution", accessor: "solution", align: "left" },
        { Header: "Best F1", accessor: "bestF1", align: "left" },
        { Header: "Search / Neighborhood", accessor: "search", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
      ];

      if (!isExecutionsBestSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: visibleBestSolutionRuns.map((run) => {
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
      };
    },
    [initialEventBySeed, isExecutionsBestSectionActive, visibleBestSolutionRuns]
  );

  const bestSolutionMomentsTableData = useMemo(
    () => {
      const columns = [
        { Header: "Time", accessor: "timestamp", align: "left" },
        { Header: "RCL", accessor: "algorithm", align: "left" },
        { Header: "Best Solution", accessor: "solution", align: "left" },
        { Header: "Best F1", accessor: "bestF1", align: "left" },
        { Header: "Search / Neighborhood", accessor: "search", align: "left" },
        { Header: "Delta vs previous", accessor: "delta", align: "left" },
        { Header: "Seed", accessor: "seed", align: "left" },
        { Header: "Dataset", accessor: "dataset", align: "left" },
      ];

      if (!isExecutionsBestSectionActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
        rows: pagedBestSolutionMomentEvents.map((event) => ({
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
      };
    },
    [isExecutionsBestSectionActive, pagedBestSolutionMomentEvents]
  );

  const rclAlgorithmSummaryTableData = useMemo(
    () => {
      const columns = [
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Initial Seeds", accessor: "initialSeeds", align: "left" },
        { Header: "Visible Final Seeds", accessor: "finalSeeds", align: "left" },
        { Header: "Final Searches", accessor: "search", align: "left" },
        { Header: "Best Run", accessor: "bestRun", align: "left" },
        { Header: "Best F1-Score", accessor: "bestF1Score", align: "left" },
        { Header: "Avg Final F1", accessor: "avgF1Score", align: "left" },
        { Header: "Avg Gain vs initial", accessor: "gain", align: "left" },
        { Header: "Datasets", accessor: "dataset", align: "left" },
      ];

      if (!isAlgorithmsTabActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
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
      };
    },
    [finalRunsByRclAlgorithm, isAlgorithmsTabActive]
  );

  const dlsAlgorithmSummaryTableData = useMemo(
    () => {
      const columns = [
        { Header: "DLS Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Visible Outcome Seeds", accessor: "outcomeSeeds", align: "left" },
        { Header: "Final Wins", accessor: "finalSeeds", align: "left" },
        { Header: "Best Outcome", accessor: "bestRun", align: "left" },
        { Header: "Best Local F1", accessor: "bestF1Score", align: "left" },
        { Header: "Avg Local F1", accessor: "avgF1Score", align: "left" },
        { Header: "Avg Gain vs initial", accessor: "gain", align: "left" },
        { Header: "RCL Algorithms", accessor: "rclAlgorithms", align: "left" },
        { Header: "Datasets", accessor: "dataset", align: "left" },
      ];

      if (!isAlgorithmsTabActive) {
        return { columns, rows: [] };
      }

      return {
        columns,
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
      };
    },
    [dlsOutcomeSummary, isAlgorithmsTabActive]
  );

  const tabPanelFallback = (
    <MDBox mt={4}>
      <Card>
        <MDBox p={3} display="flex" alignItems="center" justifyContent="center" gap={1.5}>
          <CircularProgress size={22} />
          <MDTypography variant="button" color="text">
            Loading dashboard section...
          </MDTypography>
        </MDBox>
      </Card>
    </MDBox>
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

        {persistedSummary ? (
          <MDBox mt={2}>
            <Card>
              <MDBox p={2.5}>
                <MDBox
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={1.5}
                  mb={2}
                >
                  <MDBox>
                    <MDTypography variant="h6" color="dark">
                      {t("dashboard.persistedSummaryTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.persistedSummarySubtitle")}
                    </MDTypography>
                  </MDBox>
                  <MDTypography variant="caption" color="text">
                    {`${formatDateTime(persistedSummary.generatedAt)} · ${formatRelativeTime(persistedSummary.generatedAt)}`}
                  </MDTypography>
                </MDBox>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={t("dashboard.persistedRuns", { count: persistedSummary.totals.runs || 0 })} color="primary" size="small" variant="outlined" />
                  <Chip label={t("dashboard.persistedEvents", { count: persistedSummary.totals.events || 0 })} color="info" size="small" variant="outlined" />
                  <Chip label={t("dashboard.persistedActiveRuns", { count: persistedSummary.totals.activeRuns || 0 })} color="warning" size="small" variant="outlined" />
                  <Chip label={t("dashboard.persistedCompletedRuns", { count: persistedSummary.totals.completedRuns || 0 })} color="success" size="small" variant="outlined" />
                  <Chip label={t("dashboard.persistedAlgorithms", { count: persistedSummary.totals.algorithms || 0 })} color="secondary" size="small" variant="outlined" />
                  <Chip label={t("dashboard.persistedDatasets", { count: persistedSummary.totals.datasetPairs || 0 })} color="default" size="small" variant="outlined" />
                </Stack>
              </MDBox>
            </Card>
          </MDBox>
        ) : null}

        {activeTab === "overview" && summary?.quality && summary?.observability && summary?.exploration ? (
          <MDBox mt={2}>
            <ResearchSnapshotPanel summary={summary} darkMode={darkMode} t={t} />
          </MDBox>
        ) : null}

        <DashboardWorkspaceFilters
          t={t}
          activeTab={activeTab}
          dashboardTabDescriptions={dashboardTabDescriptions}
          overview={overview}
          filteredRuns={filteredRuns}
          runs={runs}
          analyticsOverview={analyticsOverview}
          activeFilterCount={activeFilterCount}
          resetWorkspaceFilters={resetWorkspaceFilters}
          connected={connected}
          loading={loading}
          detailsLoading={detailsLoading}
          darkMode={darkMode}
          filterPanelSx={filterPanelSx}
          filterPanelHeadingSx={filterPanelHeadingSx}
          filterPanelCaptionSx={filterPanelCaptionSx}
          selectedAlgorithm={selectedAlgorithm}
          setSelectedAlgorithm={setSelectedAlgorithm}
          algorithmOptions={algorithmOptions}
          selectedDataset={selectedDataset}
          setSelectedDataset={setSelectedDataset}
          datasetOptions={datasetOptions}
          selectedTimeWindow={selectedTimeWindow}
          setSelectedTimeWindow={setSelectedTimeWindow}
          timeWindowOptions={timeWindowOptions}
          customRangeStart={customRangeStart}
          setCustomRangeStart={setCustomRangeStart}
          customRangeEnd={customRangeEnd}
          setCustomRangeEnd={setCustomRangeEnd}
          customGlobalRangeHelper={customGlobalRangeHelper}
          applyGlobalRelativeRange={applyGlobalRelativeRange}
          applyGlobalTodayRange={applyGlobalTodayRange}
          setGlobalRangeEndToNow={setGlobalRangeEndToNow}
          selectedStageLens={selectedStageLens}
          setSelectedStageLens={setSelectedStageLens}
          stageLensOptions={stageLensOptions}
          selectedRunStatus={selectedRunStatus}
          setSelectedRunStatus={setSelectedRunStatus}
          runStatusOptions={runStatusOptions}
          formatWorkspaceLabel={formatWorkspaceLabel}
          selectedSearch={selectedSearch}
          setSelectedSearch={setSelectedSearch}
          searchOptions={searchOptions}
          selectedRequestFilterId={selectedRequestFilterId}
          setSelectedRequestFilterId={setSelectedRequestFilterId}
          requestFilterOptions={requestFilterOptions}
          runFocusOptions={runFocusOptions}
          safeSelectedSeedId={safeSelectedSeedId}
          setSelectedSeedId={setSelectedSeedId}
          formatCompactPercent={formatCompactPercent}
          shortenSeed={shortenSeed}
          requestFilterIsActive={requestFilterIsActive}
          activeTimeWindowLabel={activeTimeWindowLabel}
          selectedExportScope={selectedExportScope}
          setSelectedExportScope={setSelectedExportScope}
          executionRequests={executionRequests}
          featuredRun={featuredRun}
          safeSelectedRequestId={safeSelectedRequestId}
          selectedRequestId={selectedRequestId}
          setSelectedRequestId={setSelectedRequestId}
          requestDetailsLoading={requestDetailsLoading}
          selectedRequestDetails={selectedRequestDetails}
          selectedRequestBundle={selectedRequestBundle}
          requestExportSnapshots={requestExportSnapshots}
          exportDisabled={exportDisabled}
          handleExportCsv={handleExportCsv}
          handleExportJson={handleExportJson}
          exportScopeLabel={exportScopeLabel}
          FriendlyDateTimeField={FriendlyDateTimeField}
          formatDateTime={formatDateTime}
        />

        <MDBox mt={3}>
          <Card sx={dashboardTabRailSx(darkMode)}>
            <MDBox px={2} pt={1.5} pb={1}>
              <Tabs
                value={activeTab}
                onChange={(_, value) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={dashboardTabsSx(darkMode)}
              >
                {dashboardTabs.map((tab) => (
                  <Tab
                    key={tab.value}
                    value={tab.value}
                    label={t(tab.labelKey)}
                    icon={<Icon fontSize="small">{tab.icon}</Icon>}
                    iconPosition="start"
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
                              ? t("dashboard.fullExecutionTimelineComparison", {
                                shown: fullTimelineComparison.datasets.length,
                                total: timelineComparisonRuns.length,
                                snapshots: fullTimelineComparison.snapshotCount,
                              })
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

                            <MDBox>
                              <MDTypography variant="caption" display="block" color="text">
                                {t("dashboard.timelineSeriesSubtitle")}
                              </MDTypography>
                            </MDBox>

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {timelineSeriesOptions.map((option) => (
                                <Chip
                                  key={option.value}
                                  label={t(option.labelKey)}
                                  clickable
                                  color={selectedTimelineSeriesMode === option.value ? "info" : "default"}
                                  variant={selectedTimelineSeriesMode === option.value ? "filled" : "outlined"}
                                  size="small"
                                  onClick={() => setSelectedTimelineSeriesMode(option.value)}
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
                                label={t("dashboard.timelineShowingRuns", {
                                  shown: fullTimelineComparison.datasets.length,
                                  total: timelineComparisonRuns.length,
                                  snapshots: fullTimelineComparison.snapshotCount,
                                })}
                                color="info"
                                size="small"
                                variant="outlined"
                              />
                              {timelineHiddenRunCount > 0 ? (
                                <Chip
                                  label={t("dashboard.timelineHiddenRuns", { count: timelineHiddenRunCount })}
                                  color="warning"
                                  size="small"
                                  variant="outlined"
                                />
                              ) : null}
                              {featuredRun?.seedId ? (
                                <Chip
                                  label={t("dashboard.timelineFocusedSeedPinned")}
                                  color="success"
                                  size="small"
                                  variant="outlined"
                                />
                              ) : null}
                              <Chip
                                label={`${t("dashboard.filterTimeWindow")}: ${timelineActiveRangeLabel}`}
                                color="secondary"
                                size="small"
                                variant="outlined"
                              />
                              {fullTimelineComparison.datasets.length > 12 ? (
                                <Chip
                                  label={t("dashboard.timelineLegendCondensed")}
                                  color="default"
                                  size="small"
                                  variant="outlined"
                                />
                              ) : null}
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
                                  {t("dashboard.globalRuntimeLabel")}
                                </MDTypography>
                                <MDTypography variant="button" display="block" color="dark" fontWeight="medium">
                                  {formatElapsedDuration(
                                    resolveRunStartTimestamp(featuredRun, initialEventBySeed.get(featuredRun.seedId)),
                                    resolveRunEndTimestamp(featuredRun)
                                  )}
                                </MDTypography>
                                <MDTypography variant="caption" color="text">
                                  {String(featuredRun.status || "running").toLowerCase()}
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
          <Suspense fallback={tabPanelFallback}>
            <DashboardPerformanceTab
              t={t}
              initialSolutionsChartData={initialSolutionsChartData}
              localSearchPerformanceChartData={localSearchPerformanceChartData}
              finalSolutionsChartData={finalSolutionsChartData}
              stageDistributionChartData={stageDistributionChartData}
              stageDistributionOptions={stageDistributionOptions}
              averageCpuChartData={averageCpuChartData}
              averageMemoryChartData={averageMemoryChartData}
              averageCpuByLocalSearchChartData={averageCpuByLocalSearchChartData}
              averageMemoryByLocalSearchChartData={averageMemoryByLocalSearchChartData}
              finalSolutionsChartOptions={finalSolutionsChartOptions}
            />
          </Suspense>
        ) : null}

        {activeTab === "algorithms" ? (
          <Suspense fallback={tabPanelFallback}>
            <DashboardAlgorithmsTab
              t={t}
              resourceAveragesByAlgorithm={resourceAveragesByAlgorithm}
              resourceSummaryTableData={resourceSummaryTableData}
              summaryTableEntries={summaryTableEntries}
              resourceAveragesByLocalSearch={resourceAveragesByLocalSearch}
              localSearchResourceSummaryTableData={localSearchResourceSummaryTableData}
              finalRunsByRclAlgorithm={finalRunsByRclAlgorithm}
              rclAlgorithmSummaryTableData={rclAlgorithmSummaryTableData}
              dlsOutcomeSummary={dlsOutcomeSummary}
              dlsAlgorithmSummaryTableData={dlsAlgorithmSummaryTableData}
            />
          </Suspense>
        ) : null}

        {activeTab === "analytics" ? (
          <Suspense fallback={tabPanelFallback}>
            <DashboardAnalyticsTab
              t={t}
              darkMode={darkMode}
              section={analyticsSection}
              onSectionChange={handleAnalyticsSectionChange}
              analyticsOverview={analyticsOverview}
              analyticsAvgInitialF1={formatCompactPercent(analyticsOverview.avgInitialF1)}
              hourlyActivityMetrics={hourlyActivityMetrics}
              hourlyActivityChartData={hourlyActivityChartData}
              hourlyActivityChartOptions={hourlyActivityChartOptions}
              rawTopicVolumeChartData={rawTopicVolumeChartData}
              finalSolutionsChartOptions={finalSolutionsChartOptions}
            rawTopicMetrics={rawTopicMetrics}
            rawTopicTableData={rawTopicTableData}
            summaryTableEntries={summaryTableEntries}
            monitorFeedTotal={analyticsFeed.pagination?.total || 0}
            rawSolutionFeedTableData={rawSolutionFeedTableData}
            rawSolutionFeedServerPagination={analyticsFeedServerPagination}
            algorithmOptions={algorithmOptions}
            analyticsTableFilters={tableFeedFilters.analytics}
            onAnalyticsTableFiltersChange={handleAnalyticsTableFiltersChange}
            onExportAnalyticsCsv={handleExportAnalyticsCsv}
            onExportAnalyticsJson={handleExportAnalyticsJson}
            exportBusy={exportJobState.loading}
          />
          </Suspense>
        ) : null}

        {activeTab === "executions" ? (
          <Suspense fallback={tabPanelFallback}>
            <DashboardExecutionsTab
              t={t}
              darkMode={darkMode}
              section={executionsSection}
              onSectionChange={handleExecutionsSectionChange}
              filteredRuns={filteredRuns}
              initialSolutionsTotal={executionInitialFeed.pagination?.total || 0}
              initialSolutionsTableData={initialSolutionsTableData}
              localSearchOutcomesTotal={executionOutcomeFeed.pagination?.total || 0}
              localSearchTableData={localSearchTableData}
              localSearchProgressTotal={executionProgressFeed.pagination?.total || 0}
              localSearchProgressTableData={localSearchProgressTableData}
              bestSolutionMomentsTotal={executionBestMomentsFeed.pagination?.total || 0}
              bestSolutionMomentsTableData={bestSolutionMomentsTableData}
              bestSolutionRuns={visibleBestSolutionRuns}
              bestSolutionsDetailedTableData={bestSolutionsDetailedTableData}
              initialSolutionsServerPagination={executionInitialServerPagination}
              localSearchOutcomesServerPagination={executionOutcomeServerPagination}
              localSearchProgressServerPagination={executionProgressServerPagination}
              bestSolutionMomentsServerPagination={executionBestMomentsServerPagination}
              algorithmOptions={algorithmOptions}
              executionTableFilters={{
                initial: tableFeedFilters.executionInitial,
                outcome: tableFeedFilters.executionOutcome,
                progress: tableFeedFilters.executionProgress,
                best: tableFeedFilters.executionBestMoments,
              }}
              onExecutionTableFiltersChange={handleExecutionTableFiltersChange}
              onExportInitialSolutionsCsv={handleExportInitialSolutionsCsv}
              onExportInitialSolutionsJson={handleExportInitialSolutionsJson}
              onExportLocalSearchOutcomesCsv={handleExportLocalSearchOutcomesCsv}
              onExportLocalSearchOutcomesJson={handleExportLocalSearchOutcomesJson}
              onExportLocalSearchProgressCsv={handleExportLocalSearchProgressCsv}
              onExportLocalSearchProgressJson={handleExportLocalSearchProgressJson}
              onExportBestSolutionMomentsCsv={handleExportBestSolutionMomentsCsv}
              onExportBestSolutionMomentsJson={handleExportBestSolutionMomentsJson}
              exportBusy={exportJobState.loading}
            />
          </Suspense>
        ) : null}

      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
