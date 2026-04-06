import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import MDProgress from "components/MDProgress";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import DataTable from "examples/Tables/DataTable";

import useI18n from "hooks/useI18n";
import useMonitorRunQuery from "hooks/queries/useMonitorRunQuery";
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const virtualizedHistoryTableConfig = {
  enabled: true,
  maxHeight: 480,
  rowHeight: 58,
  threshold: 20,
  overscan: 6,
};

const runTimeWindowOptions = [
  { value: "all", labelKey: "dashboard.timelineWindowAll" },
  { value: "1h", labelKey: "dashboard.timelineWindowLastHour" },
  { value: "6h", labelKey: "dashboard.timelineWindowLast6Hours" },
  { value: "24h", labelKey: "dashboard.timeWindowLast24Hours" },
];

const resolveRunRangeBounds = (timeWindow, anchorTimestamp) => {
  const anchorMs = anchorTimestamp ? new Date(anchorTimestamp).getTime() : null;

  if (!Number.isFinite(anchorMs)) {
    return { start: null, end: null };
  }

  switch (timeWindow) {
    case "1h":
      return { start: anchorMs - 60 * 60 * 1000, end: anchorMs };
    case "6h":
      return { start: anchorMs - 6 * 60 * 60 * 1000, end: anchorMs };
    case "24h":
      return { start: anchorMs - 24 * 60 * 60 * 1000, end: anchorMs };
    default:
      return { start: null, end: null };
  }
};

function RunDetails() {
  const { seedId } = useParams();
  const { t } = useI18n();
  const [selectedTimeWindow, setSelectedTimeWindow] = useState("all");
  const [historyPageIndex, setHistoryPageIndex] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [rangeAnchorTimestamp, setRangeAnchorTimestamp] = useState(null);
  const rangeBounds = useMemo(
    () => resolveRunRangeBounds(selectedTimeWindow, rangeAnchorTimestamp),
    [rangeAnchorTimestamp, selectedTimeWindow]
  );
  const runQuery = useMonitorRunQuery(seedId, {
    historyLimit: 24,
    includeInsights: true,
    page: historyPageIndex + 1,
    pageSize: historyPageSize,
    start: rangeBounds.start !== null ? new Date(rangeBounds.start).toISOString() : undefined,
    end: rangeBounds.end !== null ? new Date(rangeBounds.end).toISOString() : undefined,
    timelineBucketLimit: selectedTimeWindow === "all" ? 360 : 180,
  });
  const run = runQuery.data || null;
  const loading = runQuery.isLoading || runQuery.isFetching;
  const error = runQuery.error?.message || "";
  const timelineAnchorTimestamp = run?.timelineAggregate?.maxTimestampMs
    ? new Date(run.timelineAggregate.maxTimestampMs).toISOString()
    : (run?.updatedAt || null);

  useEffect(() => {
    setHistoryPageIndex(0);
  }, [seedId, selectedTimeWindow]);

  useEffect(() => {
    setRangeAnchorTimestamp(null);
  }, [seedId]);

  useEffect(() => {
    if (timelineAnchorTimestamp) {
      setRangeAnchorTimestamp(timelineAnchorTimestamp);
    }
  }, [timelineAnchorTimestamp]);

  const historyItems = useMemo(() => {
    if (Array.isArray(run?.historyPage?.items)) {
      return run.historyPage.items;
    }

    return Array.isArray(run?.history) ? [...run.history] : [];
  }, [run?.history, run?.historyPage?.items]);
  const historyTotal = run?.historyPage?.total ?? historyItems.length;
  const historyPageCount = run?.historyPage?.totalPages ?? Math.max(Math.ceil(historyTotal / historyPageSize), 1);
  const timelinePoints = useMemo(() => {
    const aggregatePoints = Array.isArray(run?.timelineAggregate?.points) ? run.timelineAggregate.points : [];
    if (aggregatePoints.length) {
      return aggregatePoints;
    }

    const history = Array.isArray(run?.history) ? run.history : [];
    return history.map((entry, index) => ({
      timestamp: entry.timestamp,
      latestScore: Number(entry.f1Score || 0),
      averageScore: Number(entry.f1Score || 0),
      bestScore: Number(entry.f1Score || 0),
      avgCpuUsage: entry.cpuUsage ?? null,
      avgMemoryUsagePercent: entry.memoryUsagePercent ?? null,
      sampleCount: 1,
      order: index + 1,
      stage: entry.stage || null,
    }));
  }, [run?.history, run?.timelineAggregate?.points]);

  const timelineData = useMemo(() => {
    if (timelinePoints.length === 0) {
      return {
        labels: ["#1"],
        datasets: [
          {
            label: t("runDetails.f1Score"),
            data: [0],
            borderColor: "#4361ee",
            backgroundColor: "rgba(67, 97, 238, 0.10)",
            fill: true,
            tension: 0.35,
          },
        ],
      };
    }

    return {
      labels: timelinePoints.map((entry) => formatShortTime(entry.timestamp)),
      datasets: [
        {
          label: t("runDetails.f1Score"),
          data: timelinePoints.map((entry) => Number(entry.latestScore ?? entry.averageScore ?? entry.bestScore ?? 0)),
          borderColor: "#4361ee",
          backgroundColor: "rgba(67, 97, 238, 0.10)",
          fill: true,
          tension: 0.35,
        },
      ],
    };
  }, [t, timelinePoints]);

  const timelineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
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

  const historyTable = useMemo(
    () => ({
      columns: [
        { Header: t("runDetails.timestamp"), accessor: "timestamp", align: "left" },
        { Header: t("runDetails.stage"), accessor: "stage", align: "left" },
        { Header: t("runDetails.topic"), accessor: "topic", align: "left" },
        { Header: t("runDetails.localSearch"), accessor: "localSearch", align: "left" },
        { Header: t("runDetails.neighborhood"), accessor: "neighborhood", align: "left" },
        { Header: t("runDetails.iteration"), accessor: "iteration", align: "left" },
        { Header: t("runDetails.f1Score"), accessor: "f1Score", align: "left" },
        { Header: t("runDetails.delta"), accessor: "delta", align: "left" },
        { Header: t("runDetails.sizes"), accessor: "sizes", align: "left" },
        { Header: t("runDetails.features"), accessor: "features", align: "left" },
      ],
      rows: historyItems.map((entry) => ({
        timestamp: formatDateTime(entry.timestamp),
        stage: getStageLabel(entry.stage),
        topic: entry.topic || "--",
        localSearch: entry.localSearch || "--",
        neighborhood: entry.neighborhood || "--",
        iteration: entry.iterationLocalSearch ?? entry.iterationNeighborhood ?? "--",
        f1Score: formatCompactPercent(entry.f1Score),
        delta: formatMetric(entry.scoreDelta, " pts"),
        sizes: `Sol ${entry.solutionSize ?? ((entry.solutionFeatures || []).length)} / RCL ${entry.rclSize ?? ((entry.rclFeatures || []).length)}`,
        features: formatFeatureSubset(entry.solutionFeatures, 8),
      })),
    }),
    [historyItems, t]
  );

  const searchFlow = useMemo(() => {
    const values = [];
    if (run?.rclAlgorithm) {
      values.push(`RCL ${run.rclAlgorithm}`);
    }
    if (run?.neighborhood) {
      values.push(run.neighborhood);
    }
    (Array.isArray(run?.enabledLocalSearches) ? run.enabledLocalSearches : [])
      .filter(Boolean)
      .forEach((entry) => {
        if (!values.includes(entry)) {
          values.push(entry);
        }
      });
    if (run?.localSearch && !values.includes(run.localSearch)) {
      values.push(run.localSearch);
    }
    if (run?.topic === "BEST_SOLUTION_TOPIC") {
      values.push("BEST");
    }
    return values;
  }, [run]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <MDBox mb={3} display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
          <MDBox>
            <MDTypography variant="h4" color="dark">
              {t("runDetails.title")}
            </MDTypography>
            <MDTypography variant="button" color="text">
              {t("runDetails.subtitle")}
            </MDTypography>
          </MDBox>
          <MDButton component={Link} to="/dashboard" variant="outlined" color="info">
            {t("runDetails.backToDashboard")}
          </MDButton>
        </MDBox>

        {loading ? (
          <Card>
            <MDBox p={4}>
              <MDTypography variant="button" color="text">
                {t("runDetails.loading")}
              </MDTypography>
            </MDBox>
          </Card>
        ) : null}

        {!loading && error ? (
          <Alert severity="error">{error}</Alert>
        ) : null}

        {!loading && !error && !run ? (
          <Alert severity="warning">{t("runDetails.notFound")}</Alert>
        ) : null}

        {!loading && !error && run ? (
          <>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6} xl={3}>
                <ComplexStatisticsCard
                  color="info"
                  icon="insights"
                  title={t("runDetails.bestScore")}
                  count={formatCompactPercent(run.bestF1Score)}
                />
              </Grid>
              <Grid item xs={12} md={6} xl={3}>
                <ComplexStatisticsCard
                  color="success"
                  icon="timeline"
                  title={t("runDetails.currentScore")}
                  count={formatCompactPercent(run.currentF1Score)}
                />
              </Grid>
              <Grid item xs={12} md={6} xl={3}>
                <ComplexStatisticsCard
                  color="warning"
                  icon="hub"
                  title={t("runDetails.currentStage")}
                  count={getStageLabel(run.stage)}
                />
              </Grid>
              <Grid item xs={12} md={6} xl={3}>
                <ComplexStatisticsCard
                  color="dark"
                  icon="account_tree"
                  title={t("runDetails.searchFlow")}
                  count={searchFlow.length || "--"}
                />
              </Grid>
            </Grid>

            <MDBox mt={4}>
              <Grid container spacing={3}>
                <Grid item xs={12} xl={8}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDTypography variant="h6" color="dark">
                        {t("runDetails.timeline")}
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {`${run.rclAlgorithm || "GRASP-FS"} / ${run.classifier || "--"} / ${t("runDetails.checkpoints", { count: run.timelineAggregate?.snapshotCount ?? historyTotal })}`}
                      </MDTypography>
                      <MDTypography variant="caption" display="block" color="text" mt={1}>
                        {t("runDetails.timelineWindowTitle")}
                      </MDTypography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={2}>
                        {runTimeWindowOptions.map((option) => (
                          <Chip
                            key={option.value}
                            label={t(option.labelKey)}
                            clickable
                            size="small"
                            color={selectedTimeWindow === option.value ? "info" : "default"}
                            variant={selectedTimeWindow === option.value ? "filled" : "outlined"}
                            onClick={() => setSelectedTimeWindow(option.value)}
                          />
                        ))}
                        <Chip
                          label={t("runDetails.aggregatedCheckpoints", { count: timelinePoints.length })}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      </Stack>
                      <MDBox mt={3} height="340px">
                        <Line data={timelineData} options={timelineOptions} />
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>

                <Grid item xs={12} xl={4}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDTypography variant="h6" color="dark">
                        {t("runDetails.summary")}
                      </MDTypography>
                      <MDTypography variant="button" color="text">
                        {`${run.trainingFileName || "--"} -> ${run.testingFileName || "--"}`}
                      </MDTypography>

                      <Divider sx={{ my: 2 }} />

                      <Stack spacing={1.25}>
                        <MDTypography variant="caption" color="text">
                          {t("runDetails.datasetPair")}
                        </MDTypography>
                        <MDTypography variant="button" color="dark">
                          {`${run.trainingFileName || "--"} -> ${run.testingFileName || "--"}`}
                        </MDTypography>

                        <MDTypography variant="caption" color="text" mt={1}>
                          {t("runDetails.seed")}
                        </MDTypography>
                        <MDTypography variant="button" color="dark">
                          {shortenSeed(run.seedId)}
                        </MDTypography>

                        <MDTypography variant="caption" color="text" mt={1}>
                          {t("runDetails.updatedAt")}
                        </MDTypography>
                        <MDTypography variant="button" color="dark">
                          {formatDateTime(run.updatedAt)}
                        </MDTypography>
                        <MDTypography variant="caption" color="text">
                          {formatRelativeTime(run.updatedAt)}
                        </MDTypography>

                        <MDTypography variant="caption" color="text" mt={1}>
                          {t("runDetails.createdAt")}
                        </MDTypography>
                        <MDTypography variant="button" color="dark">
                          {formatDateTime(run.createdAt)}
                        </MDTypography>

                        <MDTypography variant="caption" color="text" mt={1}>
                          {t("runDetails.rclMetadata")}
                        </MDTypography>
                        <MDTypography variant="button" color="dark">
                          {`${run.rclAlgorithm || "--"} | RCL ${run.rclSize ?? ((run.rclFeatures || run.rclfeatures || []).length)} | Sol ${run.solutionSize ?? ((run.solutionFeatures || []).length)}`}
                        </MDTypography>

                        <MDTypography variant="caption" color="text" mt={1}>
                          {t("runDetails.searchPlan")}
                        </MDTypography>
                        <MDTypography variant="button" color="dark">
                          {Array.isArray(run.enabledLocalSearches) && run.enabledLocalSearches.length
                            ? run.enabledLocalSearches.join(", ")
                            : "--"}
                        </MDTypography>
                      </Stack>

                      <Divider sx={{ my: 2 }} />

                      <MDTypography variant="button" color="dark" fontWeight="medium">
                        {t("runDetails.searchFlow")}
                      </MDTypography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1}>
                        {searchFlow.map((step) => (
                          <Chip key={step} label={step} size="small" color="info" variant="outlined" />
                        ))}
                      </Stack>

                      <Divider sx={{ my: 2 }} />

                      <MDTypography variant="button" color="dark" fontWeight="medium">
                        {t("runDetails.cpuUsage")}
                      </MDTypography>
                      <MDProgress value={Math.min(Math.max(Number(run.cpuUsage || 0), 0), 100)} color="info" variant="gradient" />
                      <MDTypography variant="caption" color="text">
                        {formatMetric(run.cpuUsage, "%")}
                      </MDTypography>

                      <MDBox mt={2}>
                        <MDTypography variant="button" color="dark" fontWeight="medium">
                          {t("runDetails.memoryUsage")}
                        </MDTypography>
                        <MDProgress
                          value={Math.min(Math.max(Number(run.memoryUsagePercent || 0), 0), 100)}
                          color="success"
                          variant="gradient"
                        />
                        <MDTypography variant="caption" color="text">
                          {formatMetric(run.memoryUsage, " MB")} / {formatMetric(run.memoryUsagePercent, "%")}
                        </MDTypography>
                      </MDBox>

                      <Divider sx={{ my: 2 }} />

                      <MDTypography variant="button" color="dark" fontWeight="medium">
                        {t("runDetails.featureSubset")}
                      </MDTypography>
                      <MDTypography variant="caption" display="block" color="text" mt={1}>
                        {formatFeatureSubset(run.solutionFeatures, 24)}
                      </MDTypography>
                    </MDBox>
                  </Card>
                </Grid>
              </Grid>
            </MDBox>

            <MDBox mt={4}>
              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("runDetails.historyTable")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {historyTotal > 0
                      ? t("runDetails.persistedRecordsWindowLoaded", {
                        shown: historyItems.length,
                        total: historyTotal,
                      })
                      : (selectedTimeWindow === "all" ? t("runDetails.noHistory") : t("runDetails.noHistoryInWindow"))}
                  </MDTypography>
                </MDBox>
                <DataTable
                  table={historyTable}
                  entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                  canSearch={false}
                  showTotalEntries
                  noEndBorder
                  virtualization={virtualizedHistoryTableConfig}
                  serverPagination={run?.historyPage ? {
                    pageIndex: Math.max((run.historyPage.page || 1) - 1, 0),
                    pageSize: run.historyPage.pageSize || historyPageSize,
                    totalEntries: historyTotal,
                    pageCount: historyPageCount,
                    onPageChange: (nextPageIndex) => setHistoryPageIndex(nextPageIndex),
                    onPageSizeChange: (nextPageSize) => {
                      setHistoryPageSize(nextPageSize);
                      setHistoryPageIndex(0);
                    },
                  } : null}
                />
              </Card>
            </MDBox>
          </>
        ) : null}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default RunDetails;
