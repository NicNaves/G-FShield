import { memo } from "react";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import DataTable from "examples/Tables/DataTable";

import ExecutionComparison from "../execution-comparison";

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
};

export default memo(DashboardExecutionsTab);
