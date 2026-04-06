import { memo } from "react";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import DataTable from "examples/Tables/DataTable";

function DashboardAlgorithmsTab({
  t,
  resourceAveragesByAlgorithm,
  resourceSummaryTableData,
  summaryTableEntries,
  resourceAveragesByLocalSearch,
  localSearchResourceSummaryTableData,
  finalRunsByRclAlgorithm,
  rclAlgorithmSummaryTableData,
  dlsOutcomeSummary,
  dlsAlgorithmSummaryTableData,
}) {
  return (
    <>
      <MDBox mt={4}>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
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
                    {t("dashboard.algorithmResourceFootprintTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.algorithmResourceFootprintSubtitle")}
                  </MDTypography>
                </MDBox>
                <Chip label={t("dashboard.algorithmsCount", { count: resourceAveragesByAlgorithm.length })} color="info" size="small" variant="outlined" />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 860 } }}>
                <DataTable
                  table={resourceSummaryTableData}
                  entriesPerPage={summaryTableEntries}
                  canSearch
                  showTotalEntries={false}
                  noEndBorder
                />
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={6}>
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
                    {t("dashboard.localSearchResourceFootprintTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.localSearchResourceFootprintSubtitle")}
                  </MDTypography>
                </MDBox>
                <Chip
                  label={t("dashboard.algorithmsCount", { count: resourceAveragesByLocalSearch.length })}
                  color="info"
                  size="small"
                  variant="outlined"
                />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 860 } }}>
                <DataTable
                  table={localSearchResourceSummaryTableData}
                  entriesPerPage={summaryTableEntries}
                  canSearch
                  showTotalEntries={false}
                  noEndBorder
                />
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <MDBox mt={4}>
        <Grid container spacing={3}>
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
                    {t("dashboard.algorithmsRclSummaryTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.algorithmsRclSummarySubtitle", { count: finalRunsByRclAlgorithm.length })}
                  </MDTypography>
                </MDBox>
                <Chip label={t("dashboard.algorithmsCount", { count: finalRunsByRclAlgorithm.length })} color="warning" size="small" variant="outlined" />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1120 } }}>
                <DataTable
                  table={rclAlgorithmSummaryTableData}
                  entriesPerPage={summaryTableEntries}
                  canSearch
                  showTotalEntries={false}
                  noEndBorder
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
                    {t("dashboard.algorithmsDlsSummaryTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.algorithmsDlsSummarySubtitle", { count: dlsOutcomeSummary.length })}
                  </MDTypography>
                </MDBox>
                <Chip label={t("dashboard.algorithmsCount", { count: dlsOutcomeSummary.length })} color="secondary" size="small" variant="outlined" />
              </MDBox>
              <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 980 } }}>
                <DataTable
                  table={dlsAlgorithmSummaryTableData}
                  entriesPerPage={summaryTableEntries}
                  canSearch
                  showTotalEntries={false}
                  noEndBorder
                />
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
    </>
  );
}

DashboardAlgorithmsTab.propTypes = {
  t: PropTypes.func.isRequired,
  resourceAveragesByAlgorithm: PropTypes.array.isRequired,
  resourceSummaryTableData: PropTypes.object.isRequired,
  summaryTableEntries: PropTypes.object.isRequired,
  resourceAveragesByLocalSearch: PropTypes.array.isRequired,
  localSearchResourceSummaryTableData: PropTypes.object.isRequired,
  finalRunsByRclAlgorithm: PropTypes.array.isRequired,
  rclAlgorithmSummaryTableData: PropTypes.object.isRequired,
  dlsOutcomeSummary: PropTypes.array.isRequired,
  dlsAlgorithmSummaryTableData: PropTypes.object.isRequired,
};

export default memo(DashboardAlgorithmsTab);
