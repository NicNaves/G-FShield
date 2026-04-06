import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Icon from "@mui/material/Icon";

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

function RunDetails() {
  const { seedId } = useParams();
  const { t } = useI18n();
  const runQuery = useMonitorRunQuery(seedId, {
    historyLimit: 2000,
  });
  const run = runQuery.data || null;
  const loading = runQuery.isLoading || runQuery.isFetching;
  const error = runQuery.error?.message || "";

  const history = useMemo(() => (Array.isArray(run?.history) ? [...run.history] : []), [run?.history]);

  const timelineData = useMemo(() => {
    if (history.length === 0) {
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
      labels: history.map((entry) => formatShortTime(entry.timestamp)),
      datasets: [
        {
          label: t("runDetails.f1Score"),
          data: history.map((entry) => Number(entry.f1Score || 0)),
          borderColor: "#4361ee",
          backgroundColor: "rgba(67, 97, 238, 0.10)",
          fill: true,
          tension: 0.35,
        },
      ],
    };
  }, [history, t]);

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
      rows: history.map((entry) => ({
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
    [history, t]
  );

  const searchFlow = useMemo(() => {
    const values = [];
    if (run?.rclAlgorithm) {
      values.push(`RCL ${run.rclAlgorithm}`);
    }
    if (run?.neighborhood) {
      values.push(run.neighborhood);
    }
    history.forEach((entry) => {
      if (entry.localSearch && !values.includes(entry.localSearch)) {
        values.push(entry.localSearch);
      }
    });
    if (run?.topic === "BEST_SOLUTION_TOPIC") {
      values.push("BEST");
    }
    return values;
  }, [history, run]);

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
                        {`${run.rclAlgorithm || "GRASP-FS"} / ${run.classifier || "--"} / ${t("runDetails.checkpoints", { count: history.length })}`}
                      </MDTypography>
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
                    {history.length > 0 ? t("runDetails.persistedRecordsLoaded", { count: history.length }) : t("runDetails.noHistory")}
                  </MDTypography>
                </MDBox>
                <DataTable
                  table={historyTable}
                  entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                  canSearch
                  showTotalEntries
                  noEndBorder
                  virtualization={virtualizedHistoryTableConfig}
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
