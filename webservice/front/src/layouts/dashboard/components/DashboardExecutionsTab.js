import { memo } from "react";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";

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

function DashboardExecutionsTab({
  t,
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
              <Chip label={t("dashboard.rowsCount", { count: initialSolutionsTotal })} color="info" size="small" variant="outlined" />
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
              <Chip label={t("dashboard.rowsCount", { count: localSearchOutcomesTotal })} color="success" size="small" variant="outlined" />
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
              <Chip label={t("dashboard.rowsCount", { count: localSearchProgressTotal })} color="secondary" size="small" variant="outlined" />
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
              <Chip label={t("dashboard.rowsCount", { count: bestSolutionMomentsTotal })} color="warning" size="small" variant="outlined" />
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
                entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                canSearch
                showTotalEntries
                noEndBorder
                virtualization={virtualizedFeedTableConfig}
              />
            </MDBox>
          </Card>
        </Grid>
      </Grid>
    </MDBox>
  );
}

DashboardExecutionsTab.propTypes = {
  t: PropTypes.func.isRequired,
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
