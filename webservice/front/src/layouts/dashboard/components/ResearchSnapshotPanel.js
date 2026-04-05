import PropTypes from "prop-types";

import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import {
  formatCompactPercent,
  formatDateTime,
  formatDuration,
  formatMetric,
  formatRelativeTime,
  shortenSeed,
} from "utils/graspFormatters";

const metricBoxSx = (darkMode) => ({
  height: "100%",
  borderRadius: 2.5,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: darkMode
    ? "linear-gradient(180deg, rgba(15, 23, 42, 0.32) 0%, rgba(30, 41, 59, 0.2) 100%)"
    : "linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.9) 100%)",
});

const toPercentValue = (ratio) => {
  const parsed = Number(ratio);
  return Number.isFinite(parsed) ? parsed * 100 : null;
};

function ResearchSnapshotPanel({ summary, darkMode, t }) {
  if (!summary?.quality || !summary?.observability || !summary?.exploration) {
    return null;
  }

  const { quality, observability, exploration, totals } = summary;
  const bestOverall = quality.bestOverall || null;
  const localSearchCoverage = Array.isArray(exploration.localSearchCoverage)
    ? exploration.localSearchCoverage
    : [];
  const neighborhoods = Array.isArray(exploration.neighborhoods)
    ? exploration.neighborhoods
    : [];

  const observationWindowLabel = observability.observationWindowMs !== null
    ? formatDuration(observability.observationWindowMs)
    : t("common.notAvailable");

  const firstHighQualityLabel = quality.firstHighQualityAt
    ? `${formatDateTime(quality.firstHighQualityAt)} · ${formatRelativeTime(quality.firstHighQualityAt)}`
    : t("common.notAvailable");

  return (
    <Card>
      <MDBox p={3}>
        <MDBox
          display="flex"
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          flexDirection={{ xs: "column", md: "row" }}
          gap={1.5}
        >
          <MDBox>
            <MDTypography variant="h6" color="dark">
              {t("dashboard.researchSnapshotTitle")}
            </MDTypography>
            <MDTypography variant="button" color="text">
              {t("dashboard.researchSnapshotSubtitle")}
            </MDTypography>
          </MDBox>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              label={t("dashboard.researchRequestsObserved", { count: observability.requestCount || 0 })}
              color="info"
              size="small"
              variant="outlined"
            />
            <Chip
              label={t("dashboard.researchObservationWindow", { value: observationWindowLabel })}
              color="secondary"
              size="small"
              variant="outlined"
            />
          </Stack>
        </MDBox>

        <Grid container spacing={2} mt={0.5}>
          <Grid item xs={12} md={4}>
            <MDBox p={2} sx={metricBoxSx(darkMode)}>
              <MDTypography variant="caption" color="text" fontWeight="medium">
                {t("dashboard.researchBestCheckpointTitle")}
              </MDTypography>
              <MDTypography variant="h4" color="dark" mt={0.5}>
                {formatCompactPercent(bestOverall?.bestF1Score)}
              </MDTypography>
              <MDTypography variant="button" display="block" color="dark" fontWeight="medium" mt={0.5}>
                {`${bestOverall?.rclAlgorithm || "--"} · ${shortenSeed(bestOverall?.seedId)}`}
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block">
                {bestOverall?.datasetPair || t("common.notAvailable")}
              </MDTypography>
            </MDBox>
          </Grid>

          <Grid item xs={12} md={4}>
            <MDBox p={2} sx={metricBoxSx(darkMode)}>
              <MDTypography variant="caption" color="text" fontWeight="medium">
                {t("dashboard.researchHighQualityTitle", { threshold: quality.highQualityThreshold })}
              </MDTypography>
              <MDTypography variant="h4" color="dark" mt={0.5}>
                {quality.timeToFirstHighQualityMs !== null
                  ? formatDuration(quality.timeToFirstHighQualityMs)
                  : t("common.notAvailable")}
              </MDTypography>
              <MDTypography variant="button" display="block" color="dark" fontWeight="medium" mt={0.5}>
                {t("dashboard.researchHighQualitySubtitle", {
                  count: quality.highQualityRuns || 0,
                  total: totals?.runs || 0,
                })}
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block">
                {firstHighQualityLabel}
              </MDTypography>
            </MDBox>
          </Grid>

          <Grid item xs={12} md={4}>
            <MDBox p={2} sx={metricBoxSx(darkMode)}>
              <MDTypography variant="caption" color="text" fontWeight="medium">
                {t("dashboard.researchObservabilityTitle")}
              </MDTypography>
              <MDTypography variant="h4" color="dark" mt={0.5}>
                {formatCompactPercent(toPercentValue(observability.telemetryCoverageRatio))}
              </MDTypography>
              <MDTypography variant="button" display="block" color="dark" fontWeight="medium" mt={0.5}>
                {t("dashboard.researchObservabilitySubtitle", {
                  telemetry: observability.runsWithTelemetry || 0,
                  total: totals?.runs || 0,
                })}
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block">
                {t("dashboard.researchContextLine", {
                  history: formatMetric(observability.avgHistoryDepth),
                  requests: observability.requestCount || 0,
                })}
              </MDTypography>
            </MDBox>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2.5 }} />

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label={t("dashboard.researchUniqueFeatures", { count: exploration.uniqueFeatures || 0 })}
            color="primary"
            size="small"
            variant="outlined"
          />
          <Chip
            label={t("dashboard.researchAvgSolutionSize", { value: formatMetric(exploration.avgSolutionSize) })}
            color="info"
            size="small"
            variant="outlined"
          />
          <Chip
            label={t("dashboard.researchAvgRclSize", { value: formatMetric(exploration.avgRclSize) })}
            color="info"
            size="small"
            variant="outlined"
          />
          <Chip
            label={t("dashboard.researchAvgSearchPlan", { value: formatMetric(exploration.avgEnabledLocalSearches) })}
            color="secondary"
            size="small"
            variant="outlined"
          />
          <Chip
            label={t("dashboard.researchAvgImprovementGain", { value: formatMetric(quality.averageImprovementGain, " pp") })}
            color="success"
            size="small"
            variant="outlined"
          />
          <Chip
            label={t("dashboard.researchLargestImprovementGain", { value: formatMetric(quality.largestImprovementGain, " pp") })}
            color="warning"
            size="small"
            variant="outlined"
          />
        </Stack>

        {(localSearchCoverage.length > 0 || neighborhoods.length > 0) ? (
          <MDBox mt={2.5}>
            <MDTypography variant="button" color="dark" fontWeight="medium">
              {t("dashboard.researchCoverageTitle")}
            </MDTypography>
            <MDTypography variant="caption" color="text" display="block" mb={1.25}>
              {t("dashboard.researchCoverageSubtitle")}
            </MDTypography>

            {localSearchCoverage.length > 0 ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1.25}>
                {localSearchCoverage.map((label) => (
                  <Chip key={label} label={label} color="success" size="small" variant="outlined" />
                ))}
              </Stack>
            ) : null}

            {neighborhoods.length > 0 ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {neighborhoods.map((label) => (
                  <Chip key={label} label={label} color="default" size="small" variant="outlined" />
                ))}
              </Stack>
            ) : null}
          </MDBox>
        ) : null}
      </MDBox>
    </Card>
  );
}

ResearchSnapshotPanel.propTypes = {
  darkMode: PropTypes.bool.isRequired,
  summary: PropTypes.shape({
    totals: PropTypes.shape({
      runs: PropTypes.number,
    }),
    quality: PropTypes.shape({
      highQualityThreshold: PropTypes.number,
      highQualityRuns: PropTypes.number,
      firstHighQualityAt: PropTypes.string,
      timeToFirstHighQualityMs: PropTypes.number,
      averageImprovementGain: PropTypes.number,
      largestImprovementGain: PropTypes.number,
      bestOverall: PropTypes.shape({
        seedId: PropTypes.string,
        rclAlgorithm: PropTypes.string,
        bestF1Score: PropTypes.number,
        datasetPair: PropTypes.string,
      }),
    }),
    observability: PropTypes.shape({
      requestCount: PropTypes.number,
      runsWithTelemetry: PropTypes.number,
      telemetryCoverageRatio: PropTypes.number,
      avgHistoryDepth: PropTypes.number,
      observationWindowMs: PropTypes.number,
    }),
    exploration: PropTypes.shape({
      uniqueFeatures: PropTypes.number,
      avgSolutionSize: PropTypes.number,
      avgRclSize: PropTypes.number,
      avgEnabledLocalSearches: PropTypes.number,
      localSearchCoverage: PropTypes.arrayOf(PropTypes.string),
      neighborhoods: PropTypes.arrayOf(PropTypes.string),
    }),
  }),
  t: PropTypes.func.isRequired,
};

ResearchSnapshotPanel.defaultProps = {
  summary: null,
};

export default ResearchSnapshotPanel;
