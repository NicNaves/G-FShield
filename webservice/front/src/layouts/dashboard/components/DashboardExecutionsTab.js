import { memo } from "react";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import DataTable from "examples/Tables/DataTable";

import ExecutionComparison from "../execution-comparison";
import FeedTableToolbarFilters from "./FeedTableToolbarFilters";

const virtualizedFeedTableConfig = {
  enabled: true,
  maxHeight: 520,
  rowHeight: 62,
  threshold: 16,
  overscan: 6,
};

const deferredExecutionSectionSx = {
  contentVisibility: "auto",
  contain: "layout paint style",
  containIntrinsicSize: "720px",
};

const deferredExecutionComparisonSectionSx = {
  contentVisibility: "auto",
  contain: "layout paint style",
  containIntrinsicSize: "560px",
};

const executionSectionTabsSx = (darkMode) => ({
  px: { xs: 1, md: 1.25 },
  py: 1,
  "& .MuiTabs-indicator": {
    display: "none",
  },
  "& .MuiTabs-flexContainer": {
    gap: 1,
  },
  "&::before": {
    content: "\"\"",
    position: "absolute",
    inset: "10px 12px",
    borderRadius: 16,
    background: darkMode ? "rgba(15, 23, 42, 0.38)" : "rgba(241, 245, 249, 0.88)",
  },
});

const executionSectionTabSx = (darkMode) => ({
  position: "relative",
  zIndex: 1,
  alignItems: "flex-start",
  minHeight: 44,
  textTransform: "none",
  fontWeight: 600,
  borderRadius: 2.5,
  px: 2,
  color: darkMode ? "rgba(212, 222, 238, 0.74)" : "rgba(71, 85, 105, 0.92)",
  transition: "all 180ms ease",
  "&:hover": {
    color: darkMode ? "#f8fafc" : "#0f172a",
  },
  "&.Mui-selected": {
    color: darkMode ? "#f8fafc" : "#0f172a",
    background: darkMode
      ? "linear-gradient(180deg, rgba(37, 99, 235, 0.24) 0%, rgba(29, 78, 216, 0.18) 100%)"
      : "linear-gradient(180deg, rgba(239, 246, 255, 1) 0%, rgba(219, 234, 254, 0.98) 100%)",
    boxShadow: darkMode ? "0 10px 20px rgba(15, 23, 42, 0.28)" : "0 10px 18px rgba(59, 130, 246, 0.14)",
  },
});

const sectionCardSx = (darkMode) => ({
  overflow: "hidden",
  borderRadius: 3,
  border: darkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(148, 163, 184, 0.18)",
  background: darkMode
    ? "linear-gradient(180deg, rgba(15, 23, 42, 0.74) 0%, rgba(17, 26, 43, 0.92) 100%)"
    : "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 247, 251, 0.94) 100%)",
});

const sectionChipSx = {
  borderRadius: 999,
};

function DashboardExecutionsTab({
  t,
  darkMode,
  section,
  onSectionChange,
  filteredRuns,
  initialSolutionsTotal,
  initialSolutionsTableData,
  localSearchOutcomesTotal,
  localSearchTableData,
  localSearchProgressTotal,
  localSearchProgressTableData,
  bestSolutionMomentsTotal,
  bestSolutionMomentsTableData,
  bestSolutionRuns,
  bestSolutionsDetailedTableData,
  initialSolutionsServerPagination,
  localSearchOutcomesServerPagination,
  localSearchProgressServerPagination,
  bestSolutionMomentsServerPagination,
  algorithmOptions,
  executionTableFilters,
  onExecutionTableFiltersChange,
  onExportInitialSolutionsCsv,
  onExportInitialSolutionsJson,
  onExportLocalSearchOutcomesCsv,
  onExportLocalSearchOutcomesJson,
  onExportLocalSearchProgressCsv,
  onExportLocalSearchProgressJson,
  onExportBestSolutionMomentsCsv,
  onExportBestSolutionMomentsJson,
  exportBusy,
}) {
  return (
    <MDBox mt={4}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card sx={sectionCardSx(darkMode)}>
            <Tabs
              value={section}
              onChange={(event, nextSection) => onSectionChange(nextSection)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={executionSectionTabsSx(darkMode)}
            >
              <Tab value="comparison" label={t("dashboard.executionsSectionComparison")} sx={executionSectionTabSx(darkMode)} />
              <Tab value="initial" label={t("dashboard.executionsSectionInitial")} sx={executionSectionTabSx(darkMode)} />
              <Tab value="outcome" label={t("dashboard.executionsSectionOutcome")} sx={executionSectionTabSx(darkMode)} />
              <Tab value="progress" label={t("dashboard.executionsSectionProgress")} sx={executionSectionTabSx(darkMode)} />
              <Tab value="best" label={t("dashboard.executionsSectionBest")} sx={executionSectionTabSx(darkMode)} />
            </Tabs>
          </Card>
        </Grid>

        {section === "comparison" ? (
          <Grid item xs={12} sx={deferredExecutionComparisonSectionSx}>
            <ExecutionComparison runs={filteredRuns} t={t} />
          </Grid>
        ) : null}

        {section === "initial" ? (
          <Grid item xs={12} sx={deferredExecutionSectionSx}>
            <Card sx={{ ...sectionCardSx(darkMode), height: "100%" }}>
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
                <Chip label={t("dashboard.rowsCount", { count: initialSolutionsTotal })} color="info" size="small" variant="outlined" sx={sectionChipSx} />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 720 } }}>
                <DataTable
                  table={initialSolutionsTableData}
                  entriesPerPage={{ defaultValue: 6, entries: [6, 10, 15] }}
                  canSearch
                  showTotalEntries
                  noEndBorder
                  serverPagination={initialSolutionsServerPagination}
                  onExportCsv={onExportInitialSolutionsCsv}
                  onExportJson={onExportInitialSolutionsJson}
                  exportDisabled={exportBusy}
                  toolbarContent={(
                    <FeedTableToolbarFilters
                      idPrefix="execution-initial"
                      algorithmOptions={algorithmOptions}
                      filters={executionTableFilters.initial}
                      onChange={(patch) => onExecutionTableFiltersChange("initial", patch)}
                    />
                  )}
                />
              </MDBox>
            </Card>
          </Grid>
        ) : null}

        {section === "outcome" ? (
          <Grid item xs={12} sx={deferredExecutionSectionSx}>
            <Card sx={{ ...sectionCardSx(darkMode), height: "100%" }}>
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
                <Chip label={t("dashboard.rowsCount", { count: localSearchOutcomesTotal })} color="success" size="small" variant="outlined" sx={sectionChipSx} />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 720 } }}>
                <DataTable
                  table={localSearchTableData}
                  entriesPerPage={{ defaultValue: 6, entries: [6, 10, 15] }}
                  canSearch
                  showTotalEntries
                  noEndBorder
                  serverPagination={localSearchOutcomesServerPagination}
                  onExportCsv={onExportLocalSearchOutcomesCsv}
                  onExportJson={onExportLocalSearchOutcomesJson}
                  exportDisabled={exportBusy}
                  toolbarContent={(
                    <FeedTableToolbarFilters
                      idPrefix="execution-outcome"
                      algorithmOptions={algorithmOptions}
                      filters={executionTableFilters.outcome}
                      onChange={(patch) => onExecutionTableFiltersChange("outcome", patch)}
                    />
                  )}
                />
              </MDBox>
            </Card>
          </Grid>
        ) : null}

        {section === "progress" ? (
          <Grid item xs={12} sx={deferredExecutionSectionSx}>
            <Card sx={{ ...sectionCardSx(darkMode), height: "100%" }}>
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
                <Chip label={t("dashboard.rowsCount", { count: localSearchProgressTotal })} color="secondary" size="small" variant="outlined" sx={sectionChipSx} />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 920 } }}>
                <DataTable
                  table={localSearchProgressTableData}
                  entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                  canSearch
                  showTotalEntries
                  noEndBorder
                  virtualization={virtualizedFeedTableConfig}
                  serverPagination={localSearchProgressServerPagination}
                  onExportCsv={onExportLocalSearchProgressCsv}
                  onExportJson={onExportLocalSearchProgressJson}
                  exportDisabled={exportBusy}
                  toolbarContent={(
                    <FeedTableToolbarFilters
                      idPrefix="execution-progress"
                      algorithmOptions={algorithmOptions}
                      filters={executionTableFilters.progress}
                      onChange={(patch) => onExecutionTableFiltersChange("progress", patch)}
                    />
                  )}
                />
              </MDBox>
            </Card>
          </Grid>
        ) : null}

        {section === "best" ? (
          <>
            <Grid item xs={12} sx={deferredExecutionSectionSx}>
              <Card sx={{ ...sectionCardSx(darkMode), height: "100%" }}>
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
                  <Chip label={t("dashboard.rowsCount", { count: bestSolutionMomentsTotal })} color="warning" size="small" variant="outlined" sx={sectionChipSx} />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1120 } }}>
                  <DataTable
                    table={bestSolutionMomentsTableData}
                    entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                    virtualization={virtualizedFeedTableConfig}
                    serverPagination={bestSolutionMomentsServerPagination}
                    onExportCsv={onExportBestSolutionMomentsCsv}
                    onExportJson={onExportBestSolutionMomentsJson}
                    exportDisabled={exportBusy}
                    toolbarContent={(
                      <FeedTableToolbarFilters
                        idPrefix="execution-best"
                        algorithmOptions={algorithmOptions}
                        filters={executionTableFilters.best}
                        onChange={(patch) => onExecutionTableFiltersChange("best", patch)}
                      />
                    )}
                  />
                </MDBox>
              </Card>
            </Grid>

            <Grid item xs={12} sx={deferredExecutionSectionSx}>
              <Card sx={sectionCardSx(darkMode)}>
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
                  <Chip label={t("dashboard.rowsCount", { count: bestSolutionRuns.length })} color="warning" size="small" variant="outlined" sx={sectionChipSx} />
                </MDBox>
                <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1080 } }}>
                  <DataTable
                    table={bestSolutionsDetailedTableData}
                    entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                    canSearch
                    showTotalEntries
                    noEndBorder
                    virtualization={virtualizedFeedTableConfig}
                  />
                </MDBox>
              </Card>
            </Grid>
          </>
        ) : null}
      </Grid>
    </MDBox>
  );
}

DashboardExecutionsTab.propTypes = {
  t: PropTypes.func.isRequired,
  darkMode: PropTypes.bool.isRequired,
  section: PropTypes.oneOf(["comparison", "initial", "outcome", "progress", "best"]).isRequired,
  onSectionChange: PropTypes.func.isRequired,
  filteredRuns: PropTypes.array.isRequired,
  initialSolutionsTotal: PropTypes.number.isRequired,
  initialSolutionsTableData: PropTypes.object.isRequired,
  localSearchOutcomesTotal: PropTypes.number.isRequired,
  localSearchTableData: PropTypes.object.isRequired,
  localSearchProgressTotal: PropTypes.number.isRequired,
  localSearchProgressTableData: PropTypes.object.isRequired,
  bestSolutionMomentsTotal: PropTypes.number.isRequired,
  bestSolutionMomentsTableData: PropTypes.object.isRequired,
  bestSolutionRuns: PropTypes.array.isRequired,
  bestSolutionsDetailedTableData: PropTypes.object.isRequired,
  initialSolutionsServerPagination: PropTypes.object.isRequired,
  localSearchOutcomesServerPagination: PropTypes.object.isRequired,
  localSearchProgressServerPagination: PropTypes.object.isRequired,
  bestSolutionMomentsServerPagination: PropTypes.object.isRequired,
  algorithmOptions: PropTypes.array.isRequired,
  executionTableFilters: PropTypes.object.isRequired,
  onExecutionTableFiltersChange: PropTypes.func.isRequired,
  onExportInitialSolutionsCsv: PropTypes.func.isRequired,
  onExportInitialSolutionsJson: PropTypes.func.isRequired,
  onExportLocalSearchOutcomesCsv: PropTypes.func.isRequired,
  onExportLocalSearchOutcomesJson: PropTypes.func.isRequired,
  onExportLocalSearchProgressCsv: PropTypes.func.isRequired,
  onExportLocalSearchProgressJson: PropTypes.func.isRequired,
  onExportBestSolutionMomentsCsv: PropTypes.func.isRequired,
  onExportBestSolutionMomentsJson: PropTypes.func.isRequired,
  exportBusy: PropTypes.bool.isRequired,
};

export default memo(DashboardExecutionsTab);
