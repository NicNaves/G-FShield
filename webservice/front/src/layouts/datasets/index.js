import { useMemo } from "react";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import DataTable from "examples/Tables/DataTable";

import useGraspMonitor from "hooks/useGraspMonitor";
import useDatasetCatalog from "hooks/useDatasetCatalog";
import useI18n from "hooks/useI18n";
import {
  formatCompactPercent,
  formatDateTime,
  formatRelativeTime,
  getDatasetRoleLabel,
} from "utils/graspFormatters";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function Datasets() {
  const { t } = useI18n();
  const { runs, error: runsError } = useGraspMonitor(100);
  const { catalog, loading, error: catalogError } = useDatasetCatalog();

  const usageByFile = useMemo(() => {
    const usage = new Map();

    runs.forEach((run) => {
      [run.trainingFileName, run.testingFileName].filter(Boolean).forEach((fileName) => {
        usage.set(fileName, (usage.get(fileName) || 0) + 1);
      });
    });

    return usage;
  }, [runs]);

  const datasetRows = useMemo(
    () =>
      catalog.datasets.map((dataset) => ({
        ...dataset,
        observedRuns: usageByFile.get(dataset.name) || 0,
        bestF1Score: runs
          .filter(
            (run) =>
              run.trainingFileName === dataset.name || run.testingFileName === dataset.name
          )
          .reduce((best, run) => Math.max(best, Number(run.bestF1Score || 0)), 0),
      })),
    [catalog.datasets, runs, usageByFile]
  );

  const largestDataset = useMemo(
    () =>
      [...datasetRows].sort((a, b) => b.sizeBytes - a.sizeBytes)[0] || null,
    [datasetRows]
  );

  const chartData = useMemo(
    () => ({
      labels: datasetRows.slice(0, 6).map((entry) => entry.name.replace(".arff", "")),
      datasets: [
        {
          label: "Size (MB)",
          backgroundColor: "#4361ee",
          borderRadius: 8,
          data: datasetRows.slice(0, 6).map((entry) => Number((entry.sizeBytes / 1024 / 1024).toFixed(2))),
        },
      ],
    }),
    [datasetRows]
  );

  const chartOptions = useMemo(
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

  const tableData = useMemo(
    () => ({
      columns: [
        { Header: t("datasets.dataset"), accessor: "dataset", align: "left" },
        { Header: "Format", accessor: "format", align: "left" },
        { Header: "Relation", accessor: "relation", align: "left" },
        { Header: t("datasets.role"), accessor: "role", align: "left" },
        { Header: "Attributes", accessor: "attributes", align: "left" },
        { Header: "Instances", accessor: "instances", align: "left" },
        { Header: "Class", accessor: "classAttribute", align: "left" },
        { Header: t("datasets.size"), accessor: "size", align: "left" },
        { Header: t("datasets.observedRuns"), accessor: "runs", align: "left" },
        { Header: t("datasets.bestF1"), accessor: "bestF1", align: "left" },
        { Header: t("datasets.updated"), accessor: "updated", align: "left" },
      ],
      rows: datasetRows.map((entry) => ({
        dataset: entry.name,
        format: entry.datasetFormat || "--",
        relation: entry.relationName || "--",
        role: (
          <Chip
            label={getDatasetRoleLabel(entry.roleSuggestion)}
            size="small"
            variant="outlined"
            color={entry.roleSuggestion === "either" ? "default" : "info"}
          />
        ),
        attributes: entry.attributeCount ?? "--",
        instances: entry.instanceCount ?? "--",
        classAttribute: entry.classAttribute || "--",
        size: entry.sizeLabel,
        runs: entry.observedRuns,
        bestF1: entry.observedRuns > 0 ? formatCompactPercent(entry.bestF1Score) : "--",
        updated: formatRelativeTime(entry.modifiedAt),
      })),
    }),
    [datasetRows]
  );

  const pageError = catalogError || runsError;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        {pageError ? (
          <MDBox mb={3}>
            <Alert severity="error">{pageError}</Alert>
          </MDBox>
        ) : null}

        {!catalog.exists && !loading ? (
          <MDBox mb={3}>
            <Alert severity="warning">
              {t("datasets.sharedFolderWarning")}
            </Alert>
          </MDBox>
        ) : null}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard color="dark" icon="storage" title={t("datasets.sharedFiles")} count={catalog.datasets.length} />
          </Grid>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard color="info" icon="compare_arrows" title={t("datasets.suggestedPairs")} count={catalog.suggestedPairs.length} />
          </Grid>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard color="success" icon="dataset" title="Total instances" count={catalog.summary?.totalInstances || 0} />
          </Grid>
          <Grid item xs={12} md={6} xl={3}>
            <ComplexStatisticsCard color="warning" icon="folder_zip" title={t("datasets.largestFile")} count={largestDataset?.sizeLabel || "--"} />
          </Grid>
        </Grid>

        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} xl={8}>
              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h5" color="dark">
                    {t("datasets.inventoryTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("datasets.inventorySubtitle")}
                  </MDTypography>

                  <MDBox mt={3} height="320px">
                    <Bar data={chartData} options={chartOptions} />
                  </MDBox>
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} xl={4}>
              <Card sx={{ height: "100%" }}>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    {t("datasets.sharedPath")}
                  </MDTypography>
                  <MDTypography variant="caption" display="block" color="text" mt={1}>
                    {catalog.directory || t("datasets.sharedPathMissing")}
                  </MDTypography>

                  <Divider sx={{ my: 2 }} />

                  <MDTypography variant="button" color="dark" fontWeight="medium">
                    Catalog summary
                  </MDTypography>
                  <MDTypography variant="caption" display="block" color="text" mt={1}>
                    {`Formats: ${(catalog.summary?.availableFormats || []).join(", ") || "--"}`}
                  </MDTypography>
                  <MDTypography variant="caption" display="block" color="text">
                    {`Total size: ${catalog.summary?.totalSizeLabel || "--"}`}
                  </MDTypography>
                  <MDTypography variant="caption" display="block" color="text">
                    {`Catalogued attributes: ${catalog.summary?.totalAttributes || 0}`}
                  </MDTypography>
                  <MDTypography variant="caption" display="block" color="text">
                    {`Richest dataset: ${catalog.summary?.richestDataset?.name || "--"} (${catalog.summary?.richestDataset?.attributeCount || "--"} attrs)`}
                  </MDTypography>

                  <Divider sx={{ my: 2 }} />

                  <MDTypography variant="button" color="dark" fontWeight="medium">
                      {t("datasets.suggestedPairs")}
                  </MDTypography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap mt={1}>
                    {catalog.suggestedPairs.map((pair) => (
                      <Chip
                        key={pair.id}
                        label={`${pair.label}${pair.attributeDelta !== null ? ` | dAttrs ${pair.attributeDelta}` : ""}`}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                    {!loading && catalog.suggestedPairs.length === 0 ? (
                      <Chip label={t("datasets.noInferredPairs")} size="small" variant="outlined" />
                    ) : null}
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  {largestDataset ? (
                    <>
                      <MDTypography variant="button" color="dark" fontWeight="medium">
                        {t("datasets.largestDataset")}
                      </MDTypography>
                      <MDTypography variant="caption" display="block" color="text" mt={1}>
                        {largestDataset.name}
                      </MDTypography>
                      <MDTypography variant="caption" display="block" color="text">
                        {largestDataset.sizeLabel} | {largestDataset.attributeCount ?? "--"} attrs | {largestDataset.instanceCount ?? "--"} rows | {formatDateTime(largestDataset.modifiedAt)}
                      </MDTypography>
                    </>
                  ) : (
                      <MDTypography variant="button" color="text">
                      {loading
                        ? t("datasets.loadingSharedFiles")
                        : t("datasets.noDatasetsFound")}
                    </MDTypography>
                  )}
                </MDBox>
              </Card>
            </Grid>
          </Grid>
        </MDBox>

        <MDBox mt={4}>
          <Card>
            <MDBox p={3}>
                <MDTypography variant="h6" color="dark">
                {t("datasets.catalogTitle")}
              </MDTypography>
            </MDBox>
            <DataTable
              table={tableData}
              entriesPerPage={{ defaultValue: 10, entries: [5, 10, 15] }}
              canSearch
              showTotalEntries
              noEndBorder
            />
          </Card>
        </MDBox>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Datasets;
