import { memo } from "react";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";

import { Bar } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import DataTable from "examples/Tables/DataTable";
import FeedTableToolbarFilters from "./FeedTableToolbarFilters";

const virtualizedFeedTableConfig = {
  enabled: true,
  maxHeight: 540,
  rowHeight: 62,
  threshold: 16,
  overscan: 6,
};

function DashboardAnalyticsTab({
  t,
  analyticsOverview,
  analyticsAvgInitialF1,
  hourlyActivityMetrics,
  hourlyActivityChartData,
  hourlyActivityChartOptions,
  rawTopicVolumeChartData,
  finalSolutionsChartOptions,
  rawTopicMetrics,
  rawTopicTableData,
  summaryTableEntries,
  monitorFeedTotal,
  rawSolutionFeedTableData,
  rawSolutionFeedServerPagination,
  algorithmOptions,
  analyticsTableFilters,
  onAnalyticsTableFiltersChange,
  onExportAnalyticsCsv,
  onExportAnalyticsJson,
  exportBusy,
}) {
  return (
    <MDBox mt={4}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6} xl={3}>
          <ComplexStatisticsCard color="dark" icon="travel_explore" title={t("dashboard.analyticsVisibleSnapshots")} count={analyticsOverview.rawSnapshots} />
        </Grid>
        <Grid item xs={12} md={6} xl={3}>
          <ComplexStatisticsCard color="info" icon="topic" title={t("dashboard.analyticsLiveEvents")} count={analyticsOverview.rawEvents} />
        </Grid>
        <Grid item xs={12} md={6} xl={3}>
          <ComplexStatisticsCard color="success" icon="fingerprint" title={t("dashboard.analyticsUniqueSeeds")} count={analyticsOverview.uniqueSeeds} />
        </Grid>
        <Grid item xs={12} md={6} xl={3}>
          <ComplexStatisticsCard
            color="warning"
            icon="query_stats"
            title={t("dashboard.analyticsAvgInitialF1")}
            count={analyticsAvgInitialF1}
          />
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
                  {t("dashboard.hourlyActivityTitle")}
                </MDTypography>
                <MDTypography variant="button" color="text">
                  {t("dashboard.hourlyActivitySubtitle")}
                </MDTypography>
              </MDBox>
              <Chip
                label={t("dashboard.hourBucketsCount", { count: hourlyActivityMetrics.length })}
                color="info"
                size="small"
                variant="outlined"
              />
            </MDBox>
            <MDBox height="340px" mt={2} px={3} pb={3}>
              <Bar data={hourlyActivityChartData} options={hourlyActivityChartOptions} />
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: "100%" }}>
            <MDBox p={3}>
              <MDTypography variant="h6" color="dark">
                {t("dashboard.topicVolumeTitle")}
              </MDTypography>
              <MDTypography variant="button" color="text">
                {t("dashboard.topicVolumeSubtitle")}
              </MDTypography>
              <MDBox height="320px" mt={2}>
                <Bar data={rawTopicVolumeChartData} options={finalSolutionsChartOptions} />
              </MDBox>
            </MDBox>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
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
                  {t("dashboard.topicSummaryTitle")}
                </MDTypography>
                <MDTypography variant="button" color="text">
                  {t("dashboard.topicSummarySubtitle")}
                </MDTypography>
              </MDBox>
              <Chip label={t("dashboard.topicsCount", { count: rawTopicMetrics.length })} color="info" size="small" variant="outlined" />
            </MDBox>
            <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 720 } }}>
              <DataTable
                table={rawTopicTableData}
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
                  {t("dashboard.visibleSolutionFeedTitle")}
                </MDTypography>
                <MDTypography variant="button" color="text">
                  {t("dashboard.visibleSolutionFeedSubtitle")}
                </MDTypography>
              </MDBox>
              <Chip label={t("dashboard.rowsCount", { count: monitorFeedTotal })} color="secondary" size="small" variant="outlined" />
            </MDBox>
            <MDBox sx={{ overflowX: "auto", "& .MuiTable-root": { minWidth: 1180 } }}>
              <DataTable
                table={rawSolutionFeedTableData}
                entriesPerPage={{ defaultValue: 25, entries: [25, 50, 100] }}
                canSearch
                showTotalEntries
                noEndBorder
                virtualization={virtualizedFeedTableConfig}
                serverPagination={rawSolutionFeedServerPagination}
                onExportCsv={onExportAnalyticsCsv}
                onExportJson={onExportAnalyticsJson}
                exportDisabled={exportBusy}
                toolbarContent={(
                  <FeedTableToolbarFilters
                    idPrefix="analytics-feed"
                    algorithmOptions={algorithmOptions}
                    filters={analyticsTableFilters}
                    onChange={onAnalyticsTableFiltersChange}
                  />
                )}
              />
            </MDBox>
          </Card>
        </Grid>
      </Grid>
    </MDBox>
  );
}

DashboardAnalyticsTab.propTypes = {
  t: PropTypes.func.isRequired,
  analyticsOverview: PropTypes.object.isRequired,
  analyticsAvgInitialF1: PropTypes.string.isRequired,
  hourlyActivityMetrics: PropTypes.array.isRequired,
  hourlyActivityChartData: PropTypes.object.isRequired,
  hourlyActivityChartOptions: PropTypes.object.isRequired,
  rawTopicVolumeChartData: PropTypes.object.isRequired,
  finalSolutionsChartOptions: PropTypes.object.isRequired,
  rawTopicMetrics: PropTypes.array.isRequired,
  rawTopicTableData: PropTypes.object.isRequired,
  summaryTableEntries: PropTypes.object.isRequired,
  monitorFeedTotal: PropTypes.number.isRequired,
  rawSolutionFeedTableData: PropTypes.object.isRequired,
  rawSolutionFeedServerPagination: PropTypes.object.isRequired,
  algorithmOptions: PropTypes.array.isRequired,
  analyticsTableFilters: PropTypes.object.isRequired,
  onAnalyticsTableFiltersChange: PropTypes.func.isRequired,
  onExportAnalyticsCsv: PropTypes.func.isRequired,
  onExportAnalyticsJson: PropTypes.func.isRequired,
  exportBusy: PropTypes.bool.isRequired,
};

export default memo(DashboardAnalyticsTab);
