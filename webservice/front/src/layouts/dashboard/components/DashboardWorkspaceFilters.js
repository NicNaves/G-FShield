import { memo } from "react";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Icon from "@mui/material/Icon";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

function DashboardWorkspaceFilters({
  t,
  activeTab,
  dashboardTabDescriptions,
  overview,
  filteredRuns,
  runs,
  analyticsOverview,
  activeFilterCount,
  resetWorkspaceFilters,
  connected,
  loading,
  detailsLoading,
  darkMode,
  filterPanelSx,
  filterPanelHeadingSx,
  filterPanelCaptionSx,
  selectedAlgorithm,
  setSelectedAlgorithm,
  algorithmOptions,
  selectedDataset,
  setSelectedDataset,
  datasetOptions,
  selectedTimeWindow,
  setSelectedTimeWindow,
  timeWindowOptions,
  customRangeStart,
  setCustomRangeStart,
  customRangeEnd,
  setCustomRangeEnd,
  customGlobalRangeHelper,
  applyGlobalRelativeRange,
  applyGlobalTodayRange,
  setGlobalRangeEndToNow,
  selectedStageLens,
  setSelectedStageLens,
  stageLensOptions,
  selectedRunStatus,
  setSelectedRunStatus,
  runStatusOptions,
  formatWorkspaceLabel,
  selectedSearch,
  setSelectedSearch,
  searchOptions,
  selectedRequestFilterId,
  setSelectedRequestFilterId,
  requestFilterOptions,
  runFocusOptions,
  safeSelectedSeedId,
  setSelectedSeedId,
  formatCompactPercent,
  shortenSeed,
  requestFilterIsActive,
  activeTimeWindowLabel,
  selectedExportScope,
  setSelectedExportScope,
  executionRequests,
  featuredRun,
  safeSelectedRequestId,
  selectedRequestId,
  setSelectedRequestId,
  requestDetailsLoading,
  selectedRequestDetails,
  selectedRequestBundle,
  requestExportSnapshots,
  exportDisabled,
  handleExportCsv,
  handleExportJson,
  exportScopeLabel,
  FriendlyDateTimeField,
  formatDateTime,
}) {
  return (
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

                  <Grid item xs={12}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="selected-request-filter-label">{t("dashboard.executionRequest")}</InputLabel>
                      <Select
                        labelId="selected-request-filter-label"
                        value={selectedRequestFilterId}
                        label={t("dashboard.executionRequest")}
                        onChange={(event) => setSelectedRequestFilterId(event.target.value)}
                      >
                        <MenuItem value="all">{t("dashboard.executionRequestAll")}</MenuItem>
                        {requestFilterOptions.map((requestOption) => (
                          <MenuItem key={requestOption.value} value={requestOption.value}>
                            {requestOption.label}
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
                    label={
                      requestFilterIsActive
                        ? `${t("dashboard.executionRequest")}: ${shortenSeed(selectedRequestFilterId)}`
                        : t("dashboard.executionRequestAll")
                    }
                    color={requestFilterIsActive ? "secondary" : "default"}
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
                {`${overview.initialSolutions} initial solutions, ${overview.progressSnapshots} progress snapshots, ${overview.localSearchOutcomes} local-search finals, and ${overview.bestSolutions} best solutions under the current filters`}
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
  );
}

DashboardWorkspaceFilters.propTypes = {
  t: PropTypes.func.isRequired,
  activeTab: PropTypes.string.isRequired,
  dashboardTabDescriptions: PropTypes.object.isRequired,
  overview: PropTypes.object.isRequired,
  filteredRuns: PropTypes.array.isRequired,
  runs: PropTypes.array.isRequired,
  analyticsOverview: PropTypes.object.isRequired,
  activeFilterCount: PropTypes.number.isRequired,
  resetWorkspaceFilters: PropTypes.func.isRequired,
  connected: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  detailsLoading: PropTypes.bool.isRequired,
  darkMode: PropTypes.bool.isRequired,
  filterPanelSx: PropTypes.func.isRequired,
  filterPanelHeadingSx: PropTypes.func.isRequired,
  filterPanelCaptionSx: PropTypes.func.isRequired,
  selectedAlgorithm: PropTypes.string.isRequired,
  setSelectedAlgorithm: PropTypes.func.isRequired,
  algorithmOptions: PropTypes.array.isRequired,
  selectedDataset: PropTypes.string.isRequired,
  setSelectedDataset: PropTypes.func.isRequired,
  datasetOptions: PropTypes.array.isRequired,
  selectedTimeWindow: PropTypes.string.isRequired,
  setSelectedTimeWindow: PropTypes.func.isRequired,
  timeWindowOptions: PropTypes.array.isRequired,
  customRangeStart: PropTypes.string.isRequired,
  setCustomRangeStart: PropTypes.func.isRequired,
  customRangeEnd: PropTypes.string.isRequired,
  setCustomRangeEnd: PropTypes.func.isRequired,
  customGlobalRangeHelper: PropTypes.string.isRequired,
  applyGlobalRelativeRange: PropTypes.func.isRequired,
  applyGlobalTodayRange: PropTypes.func.isRequired,
  setGlobalRangeEndToNow: PropTypes.func.isRequired,
  selectedStageLens: PropTypes.string.isRequired,
  setSelectedStageLens: PropTypes.func.isRequired,
  stageLensOptions: PropTypes.array.isRequired,
  selectedRunStatus: PropTypes.string.isRequired,
  setSelectedRunStatus: PropTypes.func.isRequired,
  runStatusOptions: PropTypes.array.isRequired,
  formatWorkspaceLabel: PropTypes.func.isRequired,
  selectedSearch: PropTypes.string.isRequired,
  setSelectedSearch: PropTypes.func.isRequired,
  searchOptions: PropTypes.array.isRequired,
  selectedRequestFilterId: PropTypes.string.isRequired,
  setSelectedRequestFilterId: PropTypes.func.isRequired,
  requestFilterOptions: PropTypes.array.isRequired,
  runFocusOptions: PropTypes.array.isRequired,
  safeSelectedSeedId: PropTypes.string.isRequired,
  setSelectedSeedId: PropTypes.func.isRequired,
  formatCompactPercent: PropTypes.func.isRequired,
  shortenSeed: PropTypes.func.isRequired,
  requestFilterIsActive: PropTypes.bool.isRequired,
  activeTimeWindowLabel: PropTypes.string.isRequired,
  selectedExportScope: PropTypes.string.isRequired,
  setSelectedExportScope: PropTypes.func.isRequired,
  executionRequests: PropTypes.array.isRequired,
  featuredRun: PropTypes.object,
  safeSelectedRequestId: PropTypes.string.isRequired,
  selectedRequestId: PropTypes.string.isRequired,
  setSelectedRequestId: PropTypes.func.isRequired,
  requestDetailsLoading: PropTypes.bool.isRequired,
  selectedRequestDetails: PropTypes.object,
  selectedRequestBundle: PropTypes.object.isRequired,
  requestExportSnapshots: PropTypes.array.isRequired,
  exportDisabled: PropTypes.bool.isRequired,
  handleExportCsv: PropTypes.func.isRequired,
  handleExportJson: PropTypes.func.isRequired,
  exportScopeLabel: PropTypes.string.isRequired,
  FriendlyDateTimeField: PropTypes.elementType.isRequired,
  formatDateTime: PropTypes.func.isRequired,
};

DashboardWorkspaceFilters.defaultProps = {
  featuredRun: null,
  selectedRequestDetails: null,
};

export default memo(DashboardWorkspaceFilters);
