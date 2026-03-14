import { useEffect, useMemo, useState } from "react";

import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import DataTable from "examples/Tables/DataTable";

import { useMaterialUIController } from "context";
import {
  algorithmCatalog,
  localSearchCatalog,
  neighborhoodOptions,
} from "data/graspOptions";
import useExecutionQueue from "hooks/useExecutionQueue";
import {
  formatDateTime,
  getStatusColor,
  shortenSeed,
} from "utils/graspFormatters";
import { toast } from "react-toastify";

function ExecutionQueuePanel() {
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;
  const { launches, loading, error, cancelLaunch, refresh } = useExecutionQueue(25, 4000);
  const [selectedRequestId, setSelectedRequestId] = useState("");

  useEffect(() => {
    if (!launches.length) {
      if (selectedRequestId) {
        setSelectedRequestId("");
      }
      return;
    }

    const selectedExists = launches.some((launch) => launch.requestId === selectedRequestId);
    if (!selectedRequestId || !selectedExists) {
      setSelectedRequestId(launches[0].requestId);
    }
  }, [launches, selectedRequestId]);

  const summary = useMemo(() => ({
    queued: launches.filter((launch) => launch.queueState === "queued").length,
    dispatching: launches.filter((launch) => ["dispatching", "cancelling"].includes(launch.queueState)).length,
    dispatched: launches.filter((launch) => launch.queueState === "dispatched").length,
    cancelled: launches.filter((launch) => launch.queueState === "cancelled").length,
  }), [launches]);

  const algorithmLabelByKey = useMemo(
    () => new Map(algorithmCatalog.map((algorithm) => [algorithm.key, algorithm.label])),
    []
  );
  const localSearchLabelByKey = useMemo(
    () => new Map(localSearchCatalog.map((search) => [search.key, search.label])),
    []
  );
  const neighborhoodLabelByKey = useMemo(
    () => new Map(neighborhoodOptions.map((option) => [option.key, option.label])),
    []
  );
  const selectedLaunch = useMemo(
    () => launches.find((launch) => launch.requestId === selectedRequestId) || launches[0] || null,
    [launches, selectedRequestId]
  );
  const selectedAlgorithms = Array.isArray(selectedLaunch?.algorithms) ? selectedLaunch.algorithms : [];
  const selectedLocalSearches = Array.isArray(selectedLaunch?.params?.localSearches)
    ? selectedLaunch.params.localSearches
    : typeof selectedLaunch?.params?.localSearches === "string"
      ? selectedLaunch.params.localSearches
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  const selectedExecutions = Array.isArray(selectedLaunch?.executions) ? selectedLaunch.executions : [];

  const tableData = useMemo(
    () => ({
      columns: [
        { Header: "Request", accessor: "request", align: "left" },
        { Header: "Queue state", accessor: "queueState", align: "left" },
        { Header: "Status", accessor: "status", align: "left" },
        { Header: "Requested at", accessor: "requestedAt", align: "left" },
        { Header: "Datasets", accessor: "datasets", align: "left" },
        { Header: "Dispatch", accessor: "dispatch", align: "left" },
        { Header: "Actions", accessor: "actions", align: "left" },
      ],
      rows: launches.map((launch) => ({
        request: (
          <Stack spacing={0.25}>
            <MDTypography variant="button" fontWeight="medium" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
              {shortenSeed(launch.requestId)}
            </MDTypography>
            <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
              {(launch.algorithms || []).join(", ") || "--"}
            </MDTypography>
          </Stack>
        ),
        queueState: (
          <Chip
            label={launch.queueState || "--"}
            size="small"
            color={
              launch.queueState === "queued"
                ? "info"
                : launch.queueState === "dispatching"
                  ? "warning"
                  : launch.queueState === "dispatched"
                    ? "success"
                    : launch.queueState === "cancelled"
                      ? "error"
                      : "default"
            }
            variant="outlined"
          />
        ),
        status: (
          <Chip
            label={launch.status || "--"}
            size="small"
            color={getStatusColor(launch.status)}
            variant="outlined"
          />
        ),
        requestedAt: formatDateTime(launch.requestedAt),
        datasets: `${launch.params?.datasetTrainingName || "--"} -> ${launch.params?.datasetTestingName || "--"}`,
        dispatch: `${launch.dispatchCount || 0}/${launch.algorithms?.length || 0}`,
        actions: (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <MDButton
              variant={selectedRequestId === launch.requestId ? "gradient" : "outlined"}
              color="info"
              size="small"
              onClick={() => setSelectedRequestId(launch.requestId)}
            >
              Summary
            </MDButton>
            {launch.canCancel ? (
              <MDButton
                variant="outlined"
                color="error"
                size="small"
                onClick={async () => {
                  try {
                    await cancelLaunch(launch.requestId);
                    toast.success("Execution cancellation requested.");
                  } catch (requestError) {
                    toast.error(requestError.message || "Unable to cancel the execution.");
                  }
                }}
              >
                Cancel
              </MDButton>
            ) : (
              <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
                {launch.queueState === "dispatched" ? "Already submitted" : "Closed"}
              </MDTypography>
            )}
          </Stack>
        ),
      })),
    }),
    [cancelLaunch, darkMode, launches, selectedRequestId]
  );

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: `1px solid ${darkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)"}`,
        background: darkMode
          ? "linear-gradient(180deg, rgba(21,33,61,0.96) 0%, rgba(17,26,49,0.94) 100%)"
          : undefined,
      }}
    >
      <MDBox p={3}>
        <MDBox
          display="flex"
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          flexDirection={{ xs: "column", md: "row" }}
          gap={1.5}
        >
          <MDBox>
            <MDTypography variant="h6" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
              Execution Queue
            </MDTypography>
            <MDTypography variant="button" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
              Queue, dispatch progress, and best-effort cancellation for launches submitted by the webservice.
            </MDTypography>
          </MDBox>

          <MDButton variant="outlined" color="info" size="small" onClick={() => refresh().catch(() => undefined)}>
            Refresh
          </MDButton>
        </MDBox>

        {error ? (
          <MDBox mt={2}>
            <Alert severity="error">{error}</Alert>
          </MDBox>
        ) : null}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={2}>
          <Chip label={`${summary.queued} queued`} color="info" size="small" variant="outlined" />
          <Chip label={`${summary.dispatching} dispatching`} color="warning" size="small" variant="outlined" />
          <Chip label={`${summary.dispatched} dispatched`} color="success" size="small" variant="outlined" />
          <Chip label={`${summary.cancelled} cancelled`} color="error" size="small" variant="outlined" />
        </Stack>
      </MDBox>

      <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 960 } }}>
        <DataTable
          table={tableData}
          entriesPerPage={{ defaultValue: 6, entries: [6, 10, 20] }}
          canSearch
          showTotalEntries
          noEndBorder
        />
      </MDBox>

      <Divider sx={{ my: 0 }} />

      <MDBox p={3}>
        <MDBox
          display="flex"
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          flexDirection={{ xs: "column", md: "row" }}
          gap={1.5}
          mb={2}
        >
          <MDBox>
            <MDTypography variant="h6" sx={{ color: darkMode ? "#f8fafc !important" : undefined }}>
              Request Summary
            </MDTypography>
            <MDTypography variant="button" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
              Persisted parameters and dispatch metadata for the selected launch.
            </MDTypography>
          </MDBox>
          {selectedLaunch ? (
            <Chip
              label={`${selectedLaunch.queueState || "--"} / ${selectedLaunch.status || "--"}`}
              size="small"
              color={getStatusColor(selectedLaunch.status)}
              variant="outlined"
            />
          ) : null}
        </MDBox>

        {selectedLaunch ? (
          <Grid container spacing={2}>
            <Grid item xs={12} md={6} lg={3}>
              <MDBox
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                  background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  height: "100%",
                }}
              >
                <MDTypography variant="button" fontWeight="medium">Request metadata</MDTypography>
                <MDTypography variant="caption" display="block" mt={1}>{`Request ID: ${selectedLaunch.requestId}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Requested at: ${formatDateTime(selectedLaunch.requestedAt)}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Queue state: ${selectedLaunch.queueState || "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Dispatch coverage: ${selectedLaunch.dispatchCount || 0}/${selectedAlgorithms.length || 0}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Completed at: ${formatDateTime(selectedLaunch.completedAt || selectedLaunch.dispatchedAt)}`}</MDTypography>
              </MDBox>
            </Grid>
            <Grid item xs={12} md={6} lg={3}>
              <MDBox
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                  background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  height: "100%",
                }}
              >
                <MDTypography variant="button" fontWeight="medium">Datasets and classifier</MDTypography>
                <MDTypography variant="caption" display="block" mt={1}>{`Training: ${selectedLaunch.params?.datasetTrainingName || "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Testing: ${selectedLaunch.params?.datasetTestingName || "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Classifier: ${selectedLaunch.params?.classifier || "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Neighborhood: ${neighborhoodLabelByKey.get(selectedLaunch.params?.neighborhoodStrategy) || selectedLaunch.params?.neighborhoodStrategy || "--"}`}</MDTypography>
              </MDBox>
            </Grid>
            <Grid item xs={12} md={6} lg={3}>
              <MDBox
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                  background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  height: "100%",
                }}
              >
                <MDTypography variant="button" fontWeight="medium">Construction budget</MDTypography>
                <MDTypography variant="caption" display="block" mt={1}>{`Max generations: ${selectedLaunch.params?.maxGenerations ?? "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`RCL cutoff: ${selectedLaunch.params?.rclCutoff ?? "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Sample size: ${selectedLaunch.params?.sampleSize ?? "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Neighborhood iterations: ${selectedLaunch.params?.neighborhoodMaxIterations ?? "--"}`}</MDTypography>
              </MDBox>
            </Grid>
            <Grid item xs={12} md={6} lg={3}>
              <MDBox
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                  background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  height: "100%",
                }}
              >
                <MDTypography variant="button" fontWeight="medium">Local-search budget</MDTypography>
                <MDTypography variant="caption" display="block" mt={1}>{`BitFlip iterations: ${selectedLaunch.params?.bitFlipMaxIterations ?? "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`IWSS iterations: ${selectedLaunch.params?.iwssMaxIterations ?? "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`IWSSR iterations: ${selectedLaunch.params?.iwssrMaxIterations ?? "--"}`}</MDTypography>
                <MDTypography variant="caption" display="block">{`Submitted algorithms: ${selectedExecutions.length || 0}`}</MDTypography>
              </MDBox>
            </Grid>
            <Grid item xs={12} lg={6}>
              <MDBox
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                  background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  minHeight: "100%",
                }}
              >
                <MDTypography variant="button" fontWeight="medium">RCL algorithms</MDTypography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1.5}>
                  {selectedAlgorithms.map((algorithm) => (
                    <Chip key={algorithm} label={algorithmLabelByKey.get(algorithm) || algorithm} color="info" size="small" />
                  ))}
                  {!selectedAlgorithms.length ? <Chip label="No algorithms selected" size="small" variant="outlined" /> : null}
                </Stack>
              </MDBox>
            </Grid>
            <Grid item xs={12} lg={6}>
              <MDBox
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                  background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  minHeight: "100%",
                }}
              >
                <MDTypography variant="button" fontWeight="medium">Local-search services</MDTypography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mt={1.5}>
                  {selectedLocalSearches.map((search) => (
                    <Chip key={search} label={localSearchLabelByKey.get(search) || search} color="success" size="small" />
                  ))}
                  {!selectedLocalSearches.length ? <Chip label="No local-search services selected" size="small" variant="outlined" /> : null}
                </Stack>
              </MDBox>
            </Grid>
            {selectedLaunch.note || selectedLaunch.error ? (
              <Grid item xs={12}>
                <MDBox
                  sx={{
                    p: 1.75,
                    borderRadius: 2.5,
                    border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
                    background: darkMode ? "rgba(15,23,42,0.24)" : "rgba(248,250,252,0.9)",
                  }}
                >
                  <MDTypography variant="button" fontWeight="medium">Dispatch notes</MDTypography>
                  {selectedLaunch.note ? <MDTypography variant="caption" display="block" mt={1}>{selectedLaunch.note}</MDTypography> : null}
                  {selectedLaunch.error ? <MDTypography variant="caption" display="block" color="error" mt={selectedLaunch.note ? 0.75 : 1}>{selectedLaunch.error}</MDTypography> : null}
                </MDBox>
              </Grid>
            ) : null}
          </Grid>
        ) : (
          <MDTypography variant="button" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
            No execution launches available yet.
          </MDTypography>
        )}
      </MDBox>

      {loading ? (
        <MDBox px={3} pb={3}>
          <MDTypography variant="caption" sx={{ color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined }}>
            Loading execution queue...
          </MDTypography>
        </MDBox>
      ) : null}
    </Card>
  );
}

export default ExecutionQueuePanel;
