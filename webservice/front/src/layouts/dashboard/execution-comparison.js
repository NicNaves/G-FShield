import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import DataTable from "examples/Tables/DataTable";

import { useMaterialUIController } from "context";
import { compareMonitorRuns } from "api/grasp";
import {
  formatCompactPercent,
  formatFeatureSubset,
  formatMetric,
  getStageLabel,
  shortenSeed,
} from "utils/graspFormatters";

function ExecutionComparison({ runs }) {
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;
  const [selectedSeedIds, setSelectedSeedIds] = useState([]);
  const [comparisonRuns, setComparisonRuns] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(
    () =>
      runs.map((run) => ({
        label: `${shortenSeed(run.seedId)} | ${run.rclAlgorithm || "--"} | ${formatCompactPercent(
          run.bestF1Score ?? run.currentF1Score
        )}`,
        value: run.seedId,
      })),
    [runs]
  );

  useEffect(() => {
    if (selectedSeedIds.length < 2) {
      setComparisonRuns([]);
      setComparison(null);
      setError("");
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await compareMonitorRuns(selectedSeedIds, 50);
        if (!cancelled) {
          setComparisonRuns(response.runs || []);
          setComparison(response.comparison || null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Unable to compare the selected executions.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedSeedIds]);

  const tableData = useMemo(
    () => ({
      columns: [
        { Header: "Seed", accessor: "seed", align: "left" },
        { Header: "Algorithm", accessor: "algorithm", align: "left" },
        { Header: "Stage", accessor: "stage", align: "left" },
        { Header: "Best F1", accessor: "bestF1", align: "left" },
        { Header: "Local search", accessor: "localSearch", align: "left" },
        { Header: "Neighborhood", accessor: "neighborhood", align: "left" },
        { Header: "Features", accessor: "features", align: "left" },
      ],
      rows: comparisonRuns.map((run) => ({
        seed: shortenSeed(run.seedId),
        algorithm: run.rclAlgorithm || "--",
        stage: getStageLabel(run.stage),
        bestF1: formatCompactPercent(run.bestF1Score ?? run.currentF1Score),
        localSearch: run.localSearch || "--",
        neighborhood: run.neighborhood || "--",
        features: formatFeatureSubset(run.solutionFeatures, 10),
      })),
    }),
    [comparisonRuns]
  );

  return (
    <Card
      sx={{
        height: "100%",
        borderRadius: 3,
        border: `1px solid ${darkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)"}`,
        background: darkMode
          ? "linear-gradient(180deg, rgba(21,33,61,0.96) 0%, rgba(17,26,49,0.94) 100%)"
          : undefined,
      }}
    >
      <MDBox p={3}>
        <MDTypography variant="h6" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
          Run Comparison Studio
        </MDTypography>
        <MDTypography variant="button" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
          Compare seeds side by side to inspect score spread, feature overlap, and search-path differences.
        </MDTypography>

        <MDBox mt={2}>
          <Autocomplete
            multiple
            options={options}
            value={options.filter((option) => selectedSeedIds.includes(option.value))}
            onChange={(event, nextOptions) => setSelectedSeedIds(nextOptions.map((option) => option.value))}
            renderInput={(params) => (
              <TextField
                {...params}
                sx={{
                  "& .MuiInputLabel-root": { color: darkMode ? "rgba(226,232,240,0.74)" : undefined },
                  "& .MuiInputBase-root": {
                    color: darkMode ? "#f8fafc" : undefined,
                    backgroundColor: darkMode ? "rgba(15,23,42,0.28)" : undefined,
                  },
                  "& .MuiFormHelperText-root": { color: darkMode ? "rgba(191,219,254,0.78)" : undefined },
                }}
                label="Executions to compare"
                helperText="Choose at least two seeds from the current dashboard slice."
              />
            )}
          />
        </MDBox>

        {error ? (
          <MDBox mt={2}>
            <Alert severity="error">{error}</Alert>
          </MDBox>
        ) : null}

        {loading ? (
          <MDBox mt={2} display="flex" alignItems="center" gap={1}>
            <CircularProgress size={18} />
            <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
              Building comparison...
            </MDTypography>
          </MDBox>
        ) : null}

        {comparison ? (
          <>
            <Grid container spacing={1.5} mt={0.5}>
              <Grid item xs={12} md={6} xl={3}>
                <MDBox p={2} borderRadius={2.5} sx={{ border: "1px solid rgba(148, 163, 184, 0.18)", background: darkMode ? "rgba(15,23,42,0.24)" : undefined }}>
                  <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.72) !important" : undefined }}>
                    Compared runs
                  </MDTypography>
                  <MDTypography variant="h5" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
                    {comparison.comparedCount}
                  </MDTypography>
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} xl={3}>
                <MDBox p={2} borderRadius={2.5} sx={{ border: "1px solid rgba(148, 163, 184, 0.18)", background: darkMode ? "rgba(15,23,42,0.24)" : undefined }}>
                  <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.72) !important" : undefined }}>
                    Score spread
                  </MDTypography>
                  <MDTypography variant="h5" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
                    {formatMetric(comparison.scoreSpread, " pts")}
                  </MDTypography>
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} xl={3}>
                <MDBox p={2} borderRadius={2.5} sx={{ border: "1px solid rgba(148, 163, 184, 0.18)", background: darkMode ? "rgba(15,23,42,0.24)" : undefined }}>
                  <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.72) !important" : undefined }}>
                    Shared features
                  </MDTypography>
                  <MDTypography variant="h5" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
                    {comparison.sharedFeatureCount}
                  </MDTypography>
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} xl={3}>
                <MDBox p={2} borderRadius={2.5} sx={{ border: "1px solid rgba(148, 163, 184, 0.18)", background: darkMode ? "rgba(15,23,42,0.24)" : undefined }}>
                  <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.72) !important" : undefined }}>
                    Best run
                  </MDTypography>
                  <MDTypography variant="h5" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
                    {comparison.bestRun ? shortenSeed(comparison.bestRun.seedId) : "--"}
                  </MDTypography>
                </MDBox>
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={2}>
              <Chip
                label={
                  comparison.sameDatasetPair
                    ? "Same dataset pair"
                    : "Mixed dataset pairs"
                }
                color={comparison.sameDatasetPair ? "success" : "warning"}
                size="small"
                variant="outlined"
              />
              {(comparison.algorithms || []).map((algorithm) => (
                <Chip key={algorithm} label={algorithm} color="info" size="small" variant="outlined" />
              ))}
              {(comparison.neighborhoods || []).map((neighborhood) => (
                <Chip key={neighborhood} label={neighborhood} color="secondary" size="small" variant="outlined" />
              ))}
            </Stack>

            <MDBox mt={2}>
              <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
                Shared features: {comparison.sharedFeatures?.length ? comparison.sharedFeatures.join(", ") : "--"}
              </MDTypography>
            </MDBox>

            <MDBox mt={3} sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 860 } }}>
              <DataTable
                table={tableData}
                entriesPerPage={{ defaultValue: 6, entries: [6, 12, 20, 30] }}
                canSearch
                showTotalEntries={false}
                noEndBorder
              />
            </MDBox>
          </>
        ) : (
          <MDBox
            mt={2}
            p={2.5}
            borderRadius={2.5}
            sx={{
              border: "1px dashed rgba(148, 163, 184, 0.22)",
              background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248, 250, 252, 0.82)",
            }}
          >
            <MDTypography variant="button" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
              Select at least two executions to enable the comparison studio.
            </MDTypography>
          </MDBox>
        )}
      </MDBox>
    </Card>
  );
}

ExecutionComparison.propTypes = {
  runs: PropTypes.arrayOf(
    PropTypes.shape({
      seedId: PropTypes.string,
      rclAlgorithm: PropTypes.string,
      bestF1Score: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      currentF1Score: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    })
  ),
};

ExecutionComparison.defaultProps = {
  runs: [],
};

export default ExecutionComparison;
