import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useNavigate } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

import { useMaterialUIController } from "context";
import { getGraspServices, resetDistributedEnvironment, resetMonitorState, startGraspExecution } from "api/grasp";
import {
  algorithmCatalog,
  classifierOptions,
  defaultExecutionForm,
  localSearchCatalog,
  neighborhoodOptions,
} from "data/graspOptions";
import useDatasetCatalog from "hooks/useDatasetCatalog";
import useI18n from "hooks/useI18n";
import { formatDateTime, getDatasetRoleLabel } from "utils/graspFormatters";
import { clearGraspNotifications } from "utils/graspNotifications";
import ExecutionQueuePanel from "./execution-queue-panel";
import { toast } from "react-toastify";

const cardSx = (darkMode) => ({
  borderRadius: 3,
  border: `1px solid ${darkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)"}`,
  background: darkMode
    ? "linear-gradient(180deg, rgba(21,33,61,0.96) 0%, rgba(17,26,49,0.94) 100%)"
    : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%)",
  boxShadow: darkMode ? "0 20px 34px rgba(2,6,23,0.32)" : "0 18px 30px rgba(15,23,42,0.08)",
  "& .MuiTypography-root": { color: darkMode ? "#f8fafc !important" : undefined },
  "& .MuiTypography-caption, & .MuiTypography-button, & .MuiTypography-body2": {
    color: darkMode ? "rgba(226,232,240,0.78) !important" : undefined,
  },
  "& .MuiDivider-root": {
    borderColor: darkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)",
  },
});

const fieldSx = (darkMode) => ({
  "& .MuiInputLabel-root": { color: darkMode ? "rgba(226,232,240,0.74)" : undefined },
  "& .MuiInputLabel-root.Mui-focused": { color: darkMode ? "#93c5fd" : undefined },
  "& .MuiInputBase-root": {
    color: darkMode ? "#f8fafc" : undefined,
    backgroundColor: darkMode ? "rgba(15,23,42,0.28)" : undefined,
  },
  "& .MuiInputBase-input": { color: darkMode ? "#f8fafc" : undefined },
  "& .MuiFormHelperText-root": { color: darkMode ? "rgba(191,219,254,0.78)" : undefined },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: darkMode ? "rgba(148,163,184,0.28)" : undefined,
  },
  "& .MuiSvgIcon-root": { color: darkMode ? "rgba(226,232,240,0.82)" : undefined },
  "& .MuiSelect-select": { color: darkMode ? "#f8fafc" : undefined },
  "& .MuiSelect-icon": { color: darkMode ? "rgba(226,232,240,0.82)" : undefined },
});

const selectMenuProps = (darkMode) => ({
  PaperProps: {
    sx: {
      mt: 1,
      borderRadius: 2,
      border: `1px solid ${darkMode ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)"}`,
      background: darkMode ? "rgba(15,23,42,0.98)" : "#ffffff",
      boxShadow: darkMode ? "0 18px 32px rgba(2,6,23,0.42)" : "0 16px 28px rgba(15,23,42,0.12)",
      "& .MuiMenuItem-root": {
        color: darkMode ? "#f8fafc" : "#111827",
      },
      "& .MuiMenuItem-root:hover": {
        backgroundColor: darkMode ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.08)",
      },
      "& .MuiMenuItem-root.Mui-selected": {
        backgroundColor: darkMode ? "rgba(59,130,246,0.24)" : "rgba(59,130,246,0.12)",
      },
      "& .MuiMenuItem-root.Mui-selected:hover": {
        backgroundColor: darkMode ? "rgba(59,130,246,0.3)" : "rgba(59,130,246,0.16)",
      },
    },
  },
});

const chipSx = (darkMode, variant = "outlined") => ({
  color: darkMode ? "#e2e8f0" : undefined,
  borderColor: darkMode ? "rgba(148,163,184,0.36)" : undefined,
  backgroundColor:
    darkMode && variant === "filled" ? "rgba(59,130,246,0.18)" : darkMode ? "rgba(15,23,42,0.28)" : undefined,
  "& .MuiChip-label": {
    color: darkMode ? "#e2e8f0" : undefined,
  },
});

function SettingsSection({ darkMode, title, description, children }) {
  return (
    <Card variant="outlined" sx={{ ...cardSx(darkMode), height: "100%", p: 2.5 }}>
      <MDTypography variant="h6" fontWeight="medium">{title}</MDTypography>
      {description ? <MDTypography variant="caption" display="block" mt={0.5} mb={2}>{description}</MDTypography> : null}
      {children}
    </Card>
  );
}

SettingsSection.propTypes = {
  darkMode: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node.isRequired,
};

SettingsSection.defaultProps = { description: "" };

function Settings() {
  const { t } = useI18n();
  const [controller] = useMaterialUIController();
  const { darkMode } = controller;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("execution");
  const [form, setForm] = useState(defaultExecutionForm);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resettingMonitor, setResettingMonitor] = useState(false);
  const [resettingEnvironment, setResettingEnvironment] = useState(false);
  const [fullResetDialogOpen, setFullResetDialogOpen] = useState(false);
  const [lastDispatch, setLastDispatch] = useState(null);
  const [error, setError] = useState("");
  const { catalog, loading: loadingDatasets, error: datasetError } = useDatasetCatalog();
  const hasAuthSession = Boolean(controller.auth?.token && controller.auth?.userId);

  useEffect(() => {
    let active = true;
    getGraspServices()
      .then((next) => active && setServices(next))
      .catch((loadError) => active && setError(loadError.message || t("settings.unableLoadServices")))
      .finally(() => active && setLoadingServices(false));
    return () => { active = false; };
  }, [t]);

  useEffect(() => {
    if (catalog.suggestedPairs?.length && !form.datasetTrainingName && !form.datasetTestingName) {
      setForm((current) => ({
        ...current,
        datasetTrainingName: catalog.suggestedPairs[0].trainingName,
        datasetTestingName: catalog.suggestedPairs[0].testingName,
      }));
    }
  }, [catalog.suggestedPairs, form.datasetTrainingName, form.datasetTestingName]);

  useEffect(() => {
    if (datasetError) {
      setError(datasetError);
    }
  }, [datasetError]);

  const selectedTraining = useMemo(
    () => catalog.datasets.find((dataset) => dataset.name === form.datasetTrainingName) || null,
    [catalog.datasets, form.datasetTrainingName]
  );
  const selectedTesting = useMemo(
    () => catalog.datasets.find((dataset) => dataset.name === form.datasetTestingName) || null,
    [catalog.datasets, form.datasetTestingName]
  );

  const helperForDataset = (dataset) =>
    dataset
      ? t("datasets.datasetMetaSummary", {
          size: dataset.sizeLabel,
          attributes: dataset.attributeCount ?? "--",
          instances: dataset.instanceCount ?? "--",
          updated: getDatasetRoleLabel(dataset.roleSuggestion),
        })
      : t("settings.chooseSharedFile");

  const tabs = useMemo(
    () => [
      { value: "execution", label: t("settings.executionTab"), icon: "tune" },
      { value: "datasets", label: t("settings.datasetsTab"), icon: "dataset" },
      { value: "operations", label: t("settings.operationsTab"), icon: "admin_panel_settings" },
    ],
    [t]
  );

  const handleChange = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const handleBooleanChange = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.checked }));
  const toggleListValue = (field, value) => setForm((current) => ({
    ...current,
    [field]: current[field].includes(value)
      ? current[field].filter((item) => item !== value)
      : [...current[field], value],
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!hasAuthSession) {
      const message = t("settings.loginRequiredToExecute");
      setError(message);
      toast.error(message);
      navigate("/authentication/sign-in");
      return;
    }
    if (!form.algorithms.length) return setError(t("settings.selectOneAlgorithm"));
    if (!form.datasetTrainingName || !form.datasetTestingName) return setError(t("settings.selectDatasets"));
    if (!form.localSearches.length) return setError(t("settings.selectLocalSearch"));

    try {
      setSubmitting(true);
      setError("");
      const payload = Object.fromEntries(
        Object.entries({
          ...form,
          maxGenerations: Number(form.maxGenerations),
          rclCutoff: Number(form.rclCutoff),
          sampleSize: Number(form.sampleSize),
          neighborhoodMaxIterations: Number(form.neighborhoodMaxIterations),
          bitFlipMaxIterations: Number(form.bitFlipMaxIterations),
          iwssMaxIterations: Number(form.iwssMaxIterations),
          iwssrMaxIterations: Number(form.iwssrMaxIterations),
        })
      );
      const response = await startGraspExecution(payload);
      setLastDispatch(response.launch || response);
      toast.success(t("settings.executionStarted"));
      setActiveTab("operations");
    } catch (submitError) {
      const message = submitError.response?.data?.error || submitError.message;
      setError(message || t("settings.unableStartExecution"));
      toast.error(message || t("settings.unableStartExecution"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetMonitor = async () => {
    try {
      setResettingMonitor(true);
      await resetMonitorState();
      clearGraspNotifications();
      setLastDispatch(null);
      toast.success(t("settings.resetMonitorSuccess"));
    } catch (requestError) {
      toast.error(requestError.message || t("settings.resetMonitorError"));
    } finally {
      setResettingMonitor(false);
    }
  };

  const handleResetEnvironment = async () => {
    try {
      setFullResetDialogOpen(false);
      setResettingEnvironment(true);
      await resetDistributedEnvironment();
      clearGraspNotifications();
      setLastDispatch(null);
      toast.success(t("settings.fullResetSuccess"));
    } catch (requestError) {
      toast.error(requestError.message || t("settings.fullResetError"));
    } finally {
      setResettingEnvironment(false);
    }
  };

  const closeFullResetDialog = () => {
    if (resettingEnvironment) return;
    setFullResetDialogOpen(false);
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card component="form" onSubmit={handleSubmit} sx={cardSx(darkMode)}>
          <MDBox p={3.5}>
            <MDBox display="flex" justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }} flexDirection={{ xs: "column", lg: "row" }} gap={2}>
              <MDBox>
                <MDTypography variant="h4" fontWeight="medium">{t("settings.title")}</MDTypography>
                <MDTypography variant="button">{t("settings.subtitle")}</MDTypography>
              </MDBox>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`${catalog.datasets.length} datasets`} color="info" size="small" variant="outlined" />
                <Chip label={`${form.algorithms.length} algorithms`} color="warning" size="small" variant="outlined" />
                <Chip label={`${form.localSearches.length} local searches`} color="success" size="small" variant="outlined" />
              </Stack>
            </MDBox>

            {error ? <MDBox mt={2.5}><Alert severity="error">{error}</Alert></MDBox> : null}
            {!hasAuthSession ? <MDBox mt={2.5}><Alert severity="warning">{t("settings.loginRequiredToExecute")}</Alert></MDBox> : null}
            {!catalog.exists && !loadingDatasets ? <MDBox mt={2.5}><Alert severity="warning">{t("settings.apiFolderMissing")}</Alert></MDBox> : null}

            <Tabs value={activeTab} onChange={(event, value) => setActiveTab(value)} sx={{
              mt: 3, mb: 3, borderRadius: 3, border: `1px solid ${darkMode ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
              background: darkMode ? "rgba(15,23,42,0.34)" : "rgba(248,250,252,0.95)",
              "& .MuiTabs-indicator": { height: "100%", borderRadius: 2.5, background: darkMode ? "rgba(67,97,238,0.32)" : "rgba(67,97,238,0.12)" },
              "& .MuiTab-root": { minHeight: "auto", py: 1.4, zIndex: 1, textTransform: "none", color: darkMode ? "rgba(226,232,240,0.82)" : "rgba(31,41,55,0.82)" },
              "& .Mui-selected": { color: `${darkMode ? "#f8fafc" : "#111827"} !important` },
            }}>
              {tabs.map((tab) => <Tab key={tab.value} value={tab.value} icon={<span className="material-icons-round">{tab.icon}</span>} iconPosition="start" label={tab.label} />)}
            </Tabs>

            {activeTab === "execution" ? <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <SettingsSection darkMode={darkMode} title={t("settings.executionBudget")} description={t("settings.executionBudgetDescription")}>
                  <Stack spacing={2}>
                    {[
                      ["maxGenerations", t("settings.maxGenerations")],
                      ["rclCutoff", t("settings.rclCutoff")],
                      ["sampleSize", t("settings.sampleSize")],
                      ["neighborhoodMaxIterations", t("settings.neighborhoodMaxIterations")],
                    ].map(([field, label]) => (
                      <TextField key={field} sx={fieldSx(darkMode)} fullWidth type="number" label={label} value={form[field]} onChange={handleChange(field)} />
                    ))}
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} md={6}>
                <SettingsSection darkMode={darkMode} title={t("settings.classifierSection")} description={t("settings.classifierSectionDescription")}>
                  <Stack spacing={2}>
                    <TextField sx={fieldSx(darkMode)} select SelectProps={{ MenuProps: selectMenuProps(darkMode) }} fullWidth label={t("settings.classifier")} value={form.classifier} onChange={handleChange("classifier")}>
                      {classifierOptions.map((classifier) => <MenuItem key={classifier} value={classifier}>{classifier}</MenuItem>)}
                    </TextField>
                    <TextField sx={fieldSx(darkMode)} select SelectProps={{ MenuProps: selectMenuProps(darkMode) }} fullWidth label={t("settings.neighborhoodStrategy")} value={form.neighborhoodStrategy} onChange={handleChange("neighborhoodStrategy")}>
                      {neighborhoodOptions.map((option) => <MenuItem key={option.key} value={option.key}>{option.label}</MenuItem>)}
                    </TextField>
                    <Card variant="outlined" sx={{ ...cardSx(darkMode), p: 1.5 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={form.useTrainingCache}
                            onChange={handleBooleanChange("useTrainingCache")}
                            sx={{ color: darkMode ? "rgba(226,232,240,0.84)" : undefined }}
                          />
                        }
                        label={t("settings.useTrainingCache")}
                      />
                      <MDTypography variant="caption">{t("settings.useTrainingCacheDescription")}</MDTypography>
                    </Card>
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} md={6}>
                <SettingsSection darkMode={darkMode} title={t("settings.localSearchSection")} description={t("settings.localSearchSectionDescription")}>
                  <Stack spacing={1.5}>
                    {localSearchCatalog.map((search) => (
                      <Card key={search.key} variant="outlined" sx={{ ...cardSx(darkMode), p: 1.5 }}>
                        <FormControlLabel
                          control={<Checkbox checked={form.localSearches.includes(search.key)} onChange={() => toggleListValue("localSearches", search.key)} sx={{ color: darkMode ? "rgba(226,232,240,0.84)" : undefined }} />}
                              label={search.label}
                        />
                        <MDTypography variant="caption">{search.shortDescription}</MDTypography>
                        <MDBox mt={1.5}>
                          <TextField
                            sx={fieldSx(darkMode)}
                            fullWidth size="small" type="number" label={`${search.label} ${t("settings.neighborhoodMaxIterations")}`}
                            value={search.key === "BIT_FLIP" ? form.bitFlipMaxIterations : search.key === "IWSS" ? form.iwssMaxIterations : form.iwssrMaxIterations}
                            onChange={search.key === "BIT_FLIP" ? handleChange("bitFlipMaxIterations") : search.key === "IWSS" ? handleChange("iwssMaxIterations") : handleChange("iwssrMaxIterations")}
                            disabled={!form.localSearches.includes(search.key)}
                          />
                        </MDBox>
                      </Card>
                    ))}
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} md={6}>
                <SettingsSection darkMode={darkMode} title={t("settings.algorithmsSection")} description={t("settings.algorithmsSectionDescription")}>
                  <Stack spacing={1.5}>
                    {algorithmCatalog.map((algorithm) => (
                      <Card key={algorithm.key} variant="outlined" sx={{ ...cardSx(darkMode), p: 1.5 }}>
                        <FormControlLabel
                          control={<Checkbox checked={form.algorithms.includes(algorithm.key)} onChange={() => toggleListValue("algorithms", algorithm.key)} sx={{ color: darkMode ? "rgba(226,232,240,0.84)" : undefined }} />}
                          label={algorithm.label}
                        />
                        <MDTypography variant="caption">{algorithm.shortDescription}</MDTypography>
                      </Card>
                    ))}
                  </Stack>
                </SettingsSection>
              </Grid>
            </Grid> : null}

            {activeTab === "datasets" ? <Grid container spacing={3}>
              <Grid item xs={12} lg={7}>
                <SettingsSection darkMode={darkMode} title={t("settings.datasetSection")} description={t("settings.datasetSectionDescription")}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Autocomplete freeSolo options={catalog.datasets.map((dataset) => dataset.name)} value={form.datasetTrainingName} onInputChange={(event, value) => setForm((current) => ({ ...current, datasetTrainingName: value }))} renderInput={(params) => <TextField {...params} sx={fieldSx(darkMode)} label={t("settings.trainingDataset")} helperText={helperForDataset(selectedTraining)} fullWidth />} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Autocomplete freeSolo options={catalog.datasets.map((dataset) => dataset.name)} value={form.datasetTestingName} onInputChange={(event, value) => setForm((current) => ({ ...current, datasetTestingName: value }))} renderInput={(params) => <TextField {...params} sx={fieldSx(darkMode)} label={t("settings.testingDataset")} helperText={helperForDataset(selectedTesting)} fullWidth />} />
                    </Grid>
                  </Grid>
                  <Divider sx={{ my: 2 }} />
                  <MDTypography variant="button" fontWeight="medium">{t("settings.suggestedPairs")}</MDTypography>
                  <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                    {catalog.suggestedPairs.map((pair) => {
                      const selected = form.datasetTrainingName === pair.trainingName && form.datasetTestingName === pair.testingName;
                      return (
                        <Chip
                          key={pair.id}
                          label={pair.label}
                          color={selected ? "info" : "default"}
                          variant={selected ? "filled" : "outlined"}
                          sx={chipSx(darkMode, selected ? "filled" : "outlined")}
                          onClick={() => setForm((current) => ({ ...current, datasetTrainingName: pair.trainingName, datasetTestingName: pair.testingName }))}
                        />
                      );
                    })}
                    {!loadingDatasets && !catalog.suggestedPairs.length ? <Chip label={t("settings.noSuggestedPairs")} variant="outlined" sx={chipSx(darkMode)} /> : null}
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} lg={5}>
                <Stack spacing={3}>
                  <SettingsSection darkMode={darkMode} title={t("settings.sharedDatasetCatalog")} description={catalog.directory || t("settings.waitingSharedScan")}>
                    <MDTypography variant="caption" display="block">{loadingDatasets ? t("common.loading") : t("settings.filesFound", { count: catalog.datasets.length })}</MDTypography>
                    <MDTypography variant="caption" display="block">{t("settings.formatsSummary", { value: (catalog.summary?.availableFormats || []).join(", ") || "--" })}</MDTypography>
                    <MDTypography variant="caption" display="block">{t("settings.totalSizeSummary", { value: catalog.summary?.totalSizeLabel || "--" })}</MDTypography>
                    <MDTypography variant="caption" display="block">{t("settings.familiesSummary", { value: catalog.summary?.familyCount || 0 })}</MDTypography>
                    <MDTypography variant="caption" display="block">{t("settings.instancesSummary", { value: catalog.summary?.totalInstances || 0 })}</MDTypography>
                    <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                      {catalog.datasets.slice(0, 8).map((dataset) => <Chip key={dataset.name} label={dataset.name} size="small" variant="outlined" sx={chipSx(darkMode)} />)}
                    </Stack>
                  </SettingsSection>
                  <SettingsSection darkMode={darkMode} title={t("settings.executionSummary")} description={t("settings.reviewNextLaunch")}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {form.algorithms.map((algorithm) => <Chip key={algorithm} label={algorithm} color="info" size="small" />)}
                    </Stack>
                    <MDBox mt={1.25}>
                      <MDTypography variant="caption" display="block">{t("settings.classifierSummary", { value: form.classifier })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.neighborhoodSummary", { value: form.neighborhoodStrategy })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.neighborhoodIterationsSummary", { value: form.neighborhoodMaxIterations })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.bitFlipIterationsSummary", { value: form.bitFlipMaxIterations })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.iwssIterationsSummary", { value: form.iwssMaxIterations })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.iwssrIterationsSummary", { value: form.iwssrMaxIterations })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.trainingCacheSummary", { value: form.useTrainingCache ? t("common.yes") : t("common.no") })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.trainingSummary", { value: form.datasetTrainingName || "--" })}</MDTypography>
                      <MDTypography variant="caption" display="block">{t("settings.testingSummary", { value: form.datasetTestingName || "--" })}</MDTypography>
                    </MDBox>
                  </SettingsSection>
                </Stack>
              </Grid>
            </Grid> : null}

            {activeTab === "operations" ? <Grid container spacing={3}>
              <Grid item xs={12}>
                <ExecutionQueuePanel />
              </Grid>
              <Grid item xs={12} lg={8}>
                <Stack spacing={3}>
                  <SettingsSection darkMode={darkMode} title={t("settings.localServices")} description={t("settings.localServicesDescription")}>
                    {services.map((service) => <MDBox key={service.key} mb={1.25}><MDTypography variant="button" fontWeight="medium">{service.label}</MDTypography><MDTypography variant="caption" display="block">{service.url}</MDTypography></MDBox>)}
                    {loadingServices ? <MDTypography variant="caption">{t("settings.loadingLocalServices")}</MDTypography> : null}
                  </SettingsSection>
                  <SettingsSection darkMode={darkMode} title={t("settings.lastDispatch")} description={t("settings.lastDispatchDescription")}>
                    {lastDispatch ? <Stack spacing={1}><MDTypography variant="caption">{`${t("settings.requestId")}: ${lastDispatch.requestId}`}</MDTypography><MDTypography variant="caption">{`${t("settings.requestedAt")}: ${formatDateTime(lastDispatch.requestedAt)}`}</MDTypography><MDTypography variant="caption">{`${t("settings.queueState")}: ${lastDispatch.queueState || "--"}`}</MDTypography><MDTypography variant="caption">{`${t("settings.algorithms")}: ${(lastDispatch.algorithms || []).join(", ")}`}</MDTypography></Stack> : <MDTypography variant="button">{t("settings.noDispatchYet")}</MDTypography>}
                  </SettingsSection>
                </Stack>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Stack spacing={3}>
                  <SettingsSection darkMode={darkMode} title={t("settings.resetMonitorCardTitle")} description={t("settings.resetMonitorCardDescription")}>
                    <Stack spacing={1.5}>
                      <Card
                        variant="outlined"
                        sx={{
                          ...cardSx(darkMode),
                          p: 2,
                          borderColor: darkMode ? "rgba(96,165,250,0.28)" : "rgba(59,130,246,0.18)",
                          boxShadow: "none",
                        }}
                      >
                        <MDTypography variant="button" fontWeight="medium">
                          {t("settings.clearBrowserStateButton")}
                        </MDTypography>
                        <MDTypography variant="caption" display="block" mt={0.75} mb={1.5}>
                          {t("settings.browserResetScope")}
                        </MDTypography>
                        <MDButton
                          variant="outlined"
                          color="info"
                          disabled={resettingMonitor || resettingEnvironment}
                          onClick={() => {
                            clearGraspNotifications();
                            toast.success(t("settings.clearBrowserStateSuccess"));
                          }}
                        >
                          {t("settings.clearBrowserStateButton")}
                        </MDButton>
                      </Card>

                      <Card
                        variant="outlined"
                        sx={{
                          ...cardSx(darkMode),
                          p: 2,
                          borderColor: darkMode ? "rgba(245,158,11,0.3)" : "rgba(245,158,11,0.2)",
                          boxShadow: "none",
                        }}
                      >
                        <MDTypography variant="button" fontWeight="medium">
                          {t("settings.resetMonitorButton")}
                        </MDTypography>
                        <MDTypography variant="caption" display="block" mt={0.75} mb={1.5}>
                          {t("settings.resetMonitorScope")}
                        </MDTypography>
                        <MDButton
                          variant="gradient"
                          color="warning"
                          onClick={handleResetMonitor}
                          disabled={resettingEnvironment || resettingMonitor}
                        >
                          {resettingMonitor ? t("settings.resetMonitorRunning") : t("settings.resetMonitorButton")}
                        </MDButton>
                      </Card>

                      <Card
                        variant="outlined"
                        sx={{
                          ...cardSx(darkMode),
                          p: 2,
                          borderColor: "rgba(239,68,68,0.35)",
                          background: darkMode
                            ? "linear-gradient(180deg, rgba(49,18,24,0.38) 0%, rgba(29,18,31,0.24) 100%)"
                            : "linear-gradient(180deg, rgba(255,251,251,0.98) 0%, rgba(255,245,245,0.96) 100%)",
                          boxShadow: "none",
                        }}
                      >
                        <MDBox
                          display="flex"
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          flexDirection={{ xs: "column", sm: "row" }}
                          gap={1}
                        >
                          <MDTypography variant="button" fontWeight="medium">
                            {t("settings.fullResetButton")}
                          </MDTypography>
                          <Chip
                            label={t("settings.fullResetBadge")}
                            color="error"
                            size="small"
                            variant="outlined"
                            sx={chipSx(darkMode)}
                          />
                        </MDBox>
                        <MDTypography variant="caption" display="block" mt={0.75} mb={1.5}>
                          {t("settings.fullResetScope")}
                        </MDTypography>
                        <MDBox
                          sx={{
                            mb: 1.5,
                            p: 1.25,
                            borderRadius: 2,
                            border: "1px solid rgba(239,68,68,0.22)",
                            background: darkMode ? "rgba(127,29,29,0.18)" : "rgba(254,242,242,0.92)",
                          }}
                        >
                          <MDTypography variant="caption" fontWeight="medium" display="block">
                            {t("settings.fullResetOnlyLabel")}
                          </MDTypography>
                          <MDTypography variant="caption" display="block" mt={0.5}>
                            {t("settings.fullResetWarning")}
                          </MDTypography>
                        </MDBox>
                        <MDButton
                          variant="outlined"
                          color="error"
                          disabled={resettingEnvironment || resettingMonitor}
                          onClick={() => setFullResetDialogOpen(true)}
                        >
                          {resettingEnvironment ? t("settings.fullResetRunning") : t("settings.fullResetButton")}
                        </MDButton>
                      </Card>
                    </Stack>
                  </SettingsSection>
                </Stack>
              </Grid>
            </Grid> : null}

            <MDBox mt={4} display="flex" gap={1.5} flexWrap="wrap">
              <MDButton type="submit" variant="gradient" color="info" disabled={submitting || !hasAuthSession}>
                {submitting ? t("settings.submitting") : t("settings.queueExecution")}
              </MDButton>
              <MDButton variant="outlined" color="secondary" onClick={() => setForm({ ...defaultExecutionForm, datasetTrainingName: catalog.suggestedPairs[0]?.trainingName || "", datasetTestingName: catalog.suggestedPairs[0]?.testingName || "" })}>
                {t("common.reset")}
              </MDButton>
            </MDBox>
          </MDBox>
        </Card>
      </MDBox>
      <Dialog
        open={fullResetDialogOpen}
        onClose={closeFullResetDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t("settings.fullResetDialogTitle")}</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="button" display="block">
            {t("settings.fullResetDialogMessage")}
          </MDTypography>
          <MDBox component="ul" pl={3} mb={0} mt={1.5}>
            <li>
              <MDTypography variant="caption">{t("settings.fullResetImpactDocker")}</MDTypography>
            </li>
            <li>
              <MDTypography variant="caption">{t("settings.fullResetImpactKafka")}</MDTypography>
            </li>
            <li>
              <MDTypography variant="caption">{t("settings.fullResetImpactMonitor")}</MDTypography>
            </li>
            <li>
              <MDTypography variant="caption">{t("settings.fullResetImpactMetrics")}</MDTypography>
            </li>
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton variant="text" color="secondary" onClick={closeFullResetDialog} disabled={resettingEnvironment}>
            {t("common.cancel")}
          </MDButton>
          <MDButton variant="gradient" color="error" onClick={handleResetEnvironment} disabled={resettingEnvironment}>
            {resettingEnvironment ? t("settings.fullResetRunning") : t("settings.fullResetConfirmButton")}
          </MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default Settings;
