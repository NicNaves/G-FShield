import { memo } from "react";
import PropTypes from "prop-types";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";

import { Bar, Doughnut } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

function DashboardPerformanceTab({
  t,
  initialSolutionsChartData,
  localSearchPerformanceChartData,
  finalSolutionsChartData,
  stageDistributionChartData,
  stageDistributionOptions,
  averageCpuChartData,
  averageMemoryChartData,
  averageCpuByLocalSearchChartData,
  averageMemoryByLocalSearchChartData,
  finalSolutionsChartOptions,
}) {
  return (
    <MDBox mt={4}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceInitialSolutionsByAlgorithm")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceInitialSolutionsSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={initialSolutionsChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceLocalSearchPerformance")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceLocalSearchPerformanceSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={localSearchPerformanceChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceBestResultsByAlgorithm")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceBestResultsSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={finalSolutionsChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceStageDistribution")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceStageDistributionSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Doughnut data={stageDistributionChartData} options={stageDistributionOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceAverageCpuByAlgorithm")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceAverageCpuSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={averageCpuChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceAverageMemoryByAlgorithm")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceAverageMemorySubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={averageMemoryChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceAverageCpuByLocalSearch")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceAverageCpuByLocalSearchSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={averageCpuByLocalSearchChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} xl={3}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.performanceAverageMemoryByLocalSearch")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.performanceAverageMemoryByLocalSearchSubtitle")}
              </MDTypography>
              <MDBox height="300px" mt={2}>
                <Bar data={averageMemoryByLocalSearchChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>
      </Grid>
    </MDBox>
  );
}

DashboardPerformanceTab.propTypes = {
  t: PropTypes.func.isRequired,
  initialSolutionsChartData: PropTypes.object.isRequired,
  localSearchPerformanceChartData: PropTypes.object.isRequired,
  finalSolutionsChartData: PropTypes.object.isRequired,
  stageDistributionChartData: PropTypes.object.isRequired,
  stageDistributionOptions: PropTypes.object.isRequired,
  averageCpuChartData: PropTypes.object.isRequired,
  averageMemoryChartData: PropTypes.object.isRequired,
  averageCpuByLocalSearchChartData: PropTypes.object.isRequired,
  averageMemoryByLocalSearchChartData: PropTypes.object.isRequired,
  finalSolutionsChartOptions: PropTypes.object.isRequired,
};

export default memo(DashboardPerformanceTab);
