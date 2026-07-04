import { memo } from "react";
import PropTypes from "prop-types";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Stack from "@mui/material/Stack";

import { Bar } from "react-chartjs-2";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";
import DataTable from "examples/Tables/DataTable";
import FeedTableToolbarFilters from "./FeedTableToolbarFilters";
import { formatDateTime } from "utils/graspFormatters";

const virtualizedFeedTableConfig = {
  enabled: true,
  maxHeight: 540,
  rowHeight: 62,
  threshold: 16,
  overscan: 6,
};

const deferredAnalyticsSectionSx = {
  contain: "layout paint style",
  containIntrinsicSize: "480px",
};

const deferredAnalyticsFeedSectionSx = {
  contain: "layout paint style",
  containIntrinsicSize: "760px",
};

const analyticsSectionTabsSx = (darkMode) => ({
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

const analyticsSectionTabSx = (darkMode) => ({
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

function DashboardAnalyticsTab({
  t,
  darkMode,
  section,
  onSectionChange,
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
          <Card sx={sectionCardSx(darkMode)}>
            <Tabs
              value={section}
              onChange={(event, nextSection) => onSectionChange(nextSection)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={analyticsSectionTabsSx(darkMode)}
            >
              <Tab value="activity" label={t("dashboard.analyticsSectionActivity")} sx={analyticsSectionTabSx(darkMode)} />
              <Tab value="topics" label={t("dashboard.analyticsSectionTopics")} sx={analyticsSectionTabSx(darkMode)} />
              <Tab value="feed" label={t("dashboard.analyticsSectionFeed")} sx={analyticsSectionTabSx(darkMode)} />
            </Tabs>
          </Card>
        </Grid>

        {section === "activity" ? (
          <Grid item xs={12} sx={deferredAnalyticsSectionSx}>
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
                  sx={sectionChipSx}
                />
              </MDBox>
              <Stack spacing={1.75} mt={2} px={3} pb={3}>
                {hourlyActivityMetrics.length ? (() => {
                  const maxCount = Math.max(...hourlyActivityMetrics.map((entry) => entry.count || 0), 1);
                  const maxLogWeight = Math.log10(maxCount + 1) || 1;

                  return hourlyActivityMetrics.map((entry) => {
                    const logWeight = Math.log10((entry.count || 0) + 1);
                    const barWidth = Math.max(12, Math.round((logWeight / maxLogWeight) * 100));
                    const bestScore = Number.isFinite(Number(entry.bestScore)) ? Number(entry.bestScore) : 0;

                    return (
                      <Stack key={entry.timestamp} spacing={0.75}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                          <MDTypography variant="button" color="text" sx={{ fontWeight: 600 }}>
                            {formatDateTime(entry.timestamp)}
                          </MDTypography>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
                            <Chip
                              label={`${entry.count ?? 0} snapshots`}
                              color="info"
                              size="small"
                              variant="outlined"
                              sx={sectionChipSx}
                            />
                            <Chip
                              label={`Best F1 ${bestScore.toFixed(1)}%`}
                              color="success"
                              size="small"
                              variant="outlined"
                              sx={sectionChipSx}
                            />
                          </Stack>
                        </Stack>
                        <Box
                          sx={{
                            width: "100%",
                            height: 16,
                            borderRadius: 999,
                            backgroundColor: darkMode ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.14)",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          <Box
                            sx={{
                              width: `${barWidth}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: "linear-gradient(90deg, rgba(67, 97, 238, 0.92), rgba(124, 156, 255, 0.95))",
                              boxShadow: "0 0 18px rgba(67, 97, 238, 0.25)",
                            }}
                          />
                          <Box
                            sx={{
                              position: "absolute",
                              right: `${Math.max(0, Math.min(100, Math.round(bestScore)))}%`,
                              top: "50%",
                              transform: "translate(50%, -50%)",
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              backgroundColor: "#36c56c",
                              boxShadow: "0 0 0 3px rgba(54, 197, 108, 0.18)",
                            }}
                          />
                        </Box>
                      </Stack>
                    );
                  });
                })() : (
                  <MDTypography variant="caption" color="text">
                    No hourly activity is available yet for the current filters.
                  </MDTypography>
                )}
              </Stack>
            </Card>
          </Grid>
        ) : null}

        {section === "topics" ? (
          <>
            <Grid item xs={12} md={6} sx={deferredAnalyticsSectionSx}>
              <Card sx={{ ...sectionCardSx(darkMode), height: "100%" }}>
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

            <Grid item xs={12} md={6} sx={deferredAnalyticsSectionSx}>
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
                      {t("dashboard.topicSummaryTitle")}
                    </MDTypography>
                    <MDTypography variant="button" color="text">
                      {t("dashboard.topicSummarySubtitle")}
                    </MDTypography>
                  </MDBox>
                  <Chip label={t("dashboard.topicsCount", { count: rawTopicMetrics.length })} color="info" size="small" variant="outlined" sx={sectionChipSx} />
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
          </>
        ) : null}

        {section === "feed" ? (
          <Grid item xs={12} sx={deferredAnalyticsFeedSectionSx}>
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
                    {t("dashboard.visibleSolutionFeedTitle")}
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {t("dashboard.visibleSolutionFeedSubtitle")}
                  </MDTypography>
                </MDBox>
                <Chip label={t("dashboard.rowsCount", { count: monitorFeedTotal })} color="secondary" size="small" variant="outlined" sx={sectionChipSx} />
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
        ) : null}
      </Grid>
    </MDBox>
  );
}

DashboardAnalyticsTab.propTypes = {
  t: PropTypes.func.isRequired,
  darkMode: PropTypes.bool.isRequired,
  section: PropTypes.oneOf(["activity", "topics", "feed"]).isRequired,
  onSectionChange: PropTypes.func.isRequired,
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
