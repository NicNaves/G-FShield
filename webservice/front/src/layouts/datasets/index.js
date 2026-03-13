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
import {
  formatCompactPercent,
  formatDateTime,
  formatRelativeTime,
  getDatasetRoleLabel,
} from "utils/graspFormatters";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function Datasets() {
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
        { Header: "Dataset", accessor: "dataset", align: "left" },
        { Header: "Role", accessor: "role", align: "left" },
        { Header: "Size", accessor: "size", align: "left" },
        { Header: "Observed Runs", accessor: "runs", align: "left" },
        { Header: "Best F1", accessor: "bestF1", align: "left" },
        { Header: "Updated", accessor: "updated", align: "left" },
      ],
      rows: datasetRows.map((entry) => ({
        dataset: entry.name,
        role: (
          <Chip
            label={getDatasetRoleLabel(entry.roleSuggestion)}
            size="small"
            variant="outlined"
            color={entry.roleSuggestion === "either" ? "default" : "info"}
          />
        ),
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
              The API could not find the shared datasets folder. Update `GRASP_DATASETS_DIR` or mount it at `/datasets`.
            </Alert>
          </MDBox>
        ) : null}

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <ComplexStatisticsCard color="dark" icon="storage" title="Shared Files" count={catalog.datasets.length} />
          </Grid>
          <Grid item xs={12} md={4}>
            <ComplexStatisticsCard color="info" icon="compare_arrows" title="Suggested Pairs" count={catalog.suggestedPairs.length} />
          </Grid>
          <Grid item xs={12} md={4}>
            <ComplexStatisticsCard color="success" icon="folder_zip" title="Largest File" count={largestDataset?.sizeLabel || "--"} />
          </Grid>
        </Grid>

        <MDBox mt={4}>
          <Grid container spacing={3}>
            <Grid item xs={12} xl={8}>
              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h5" color="dark">
                    Shared Folder Inventory
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    Size of the datasets currently available to the server.
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
                    Shared path
                  </MDTypography>
                  <MDTypography variant="caption" display="block" color="text" mt={1}>
                    {catalog.directory || "Shared folder not resolved"}
                  </MDTypography>

                  <Divider sx={{ my: 2 }} />

                  <MDTypography variant="button" color="dark" fontWeight="medium">
                    Suggested pairs
                  </MDTypography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap mt={1}>
                    {catalog.suggestedPairs.map((pair) => (
                      <Chip key={pair.id} label={pair.label} size="small" variant="outlined" />
                    ))}
                    {!loading && catalog.suggestedPairs.length === 0 ? (
                      <Chip label="No inferred pairs" size="small" variant="outlined" />
                    ) : null}
                  </Stack>

                  <Divider sx={{ my: 2 }} />

                  {largestDataset ? (
                    <>
                      <MDTypography variant="button" color="dark" fontWeight="medium">
                        Largest dataset
                      </MDTypography>
                      <MDTypography variant="caption" display="block" color="text" mt={1}>
                        {largestDataset.name}
                      </MDTypography>
                      <MDTypography variant="caption" display="block" color="text">
                        {largestDataset.sizeLabel} · {formatDateTime(largestDataset.modifiedAt)}
                      </MDTypography>
                    </>
                  ) : (
                      <MDTypography variant="button" color="text">
                      {loading
                        ? "Loading shared files..."
                        : "No dataset was found in the shared folder."}
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
                Dataset Catalog
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
