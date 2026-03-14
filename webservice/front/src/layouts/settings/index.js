import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
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
import { getGraspServices, resetMonitorState, startGraspExecution } from "api/grasp";
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

const tabs = [
  { value: "execution", label: "Execution Setup", icon: "tune" },
  { value: "datasets", label: "Datasets & Summary", icon: "dataset" },
  { value: "operations", label: "Operations", icon: "admin_panel_settings" },
];

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
  const [activeTab, setActiveTab] = useState("execution");
  const [form, setForm] = useState(defaultExecutionForm);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastDispatch, setLastDispatch] = useState(null);
  const [error, setError] = useState("");
  const { catalog, loading: loadingDatasets, error: datasetError } = useDatasetCatalog();

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
      ? `${dataset.sizeLabel} | ${dataset.attributeCount ?? "--"} attrs | ${dataset.instanceCount ?? "--"} rows | ${getDatasetRoleLabel(dataset.roleSuggestion)}`
      : "Choose a file from the shared folder";

  const handleChange = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const toggleListValue = (field, value) => setForm((current) => ({
    ...current,
    [field]: current[field].includes(value)
      ? current[field].filter((item) => item !== value)
      : [...current[field], value],
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
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
      toast.success("Execution queued successfully.");
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
      await resetMonitorState();
      clearGraspNotifications();
      setLastDispatch(null);
      toast.success(t("settings.resetMonitorSuccess"));
    } catch (requestError) {
      toast.error(requestError.message || t("settings.resetMonitorError"));
    }
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
                <SettingsSection darkMode={darkMode} title="Execution budget" description="Core parameters that define the construction and neighborhood budget.">
                  <Stack spacing={2}>
                    {[
                      ["maxGenerations", "Max. Number of Generations"],
                      ["rclCutoff", "RCL Cutoff"],
                      ["sampleSize", "Sample Size"],
                      ["neighborhoodMaxIterations", "Neighborhood Max Iterations"],
                    ].map(([field, label]) => (
                      <TextField key={field} sx={fieldSx(darkMode)} fullWidth type="number" label={label} value={form[field]} onChange={handleChange(field)} />
                    ))}
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} md={6}>
                <SettingsSection darkMode={darkMode} title="Classifier and orchestration" description="Define the classifier and the neighborhood strategy used by the distributed local search.">
                  <Stack spacing={2}>
                    <TextField sx={fieldSx(darkMode)} select SelectProps={{ MenuProps: selectMenuProps(darkMode) }} fullWidth label="Classifier Algorithm" value={form.classifier} onChange={handleChange("classifier")}>
                      {classifierOptions.map((classifier) => <MenuItem key={classifier} value={classifier}>{classifier}</MenuItem>)}
                    </TextField>
                    <TextField sx={fieldSx(darkMode)} select SelectProps={{ MenuProps: selectMenuProps(darkMode) }} fullWidth label="Neighborhood Strategy" value={form.neighborhoodStrategy} onChange={handleChange("neighborhoodStrategy")}>
                      {neighborhoodOptions.map((option) => <MenuItem key={option.key} value={option.key}>{option.label}</MenuItem>)}
                    </TextField>
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} md={6}>
                <SettingsSection darkMode={darkMode} title="Distributed local search" description="Enable the DLS services and set the max iteration budget for each one.">
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
                            fullWidth size="small" type="number" label={`${search.label} Max Iterations`}
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
                <SettingsSection darkMode={darkMode} title="RCL algorithms" description="Choose the generators that should produce the initial solutions.">
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
                <SettingsSection darkMode={darkMode} title="Dataset selection" description="Choose the training and testing files manually or start from an inferred pair.">
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Autocomplete freeSolo options={catalog.datasets.map((dataset) => dataset.name)} value={form.datasetTrainingName} onInputChange={(event, value) => setForm((current) => ({ ...current, datasetTrainingName: value }))} renderInput={(params) => <TextField {...params} sx={fieldSx(darkMode)} label="Training Dataset" helperText={helperForDataset(selectedTraining)} fullWidth />} />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Autocomplete freeSolo options={catalog.datasets.map((dataset) => dataset.name)} value={form.datasetTestingName} onInputChange={(event, value) => setForm((current) => ({ ...current, datasetTestingName: value }))} renderInput={(params) => <TextField {...params} sx={fieldSx(darkMode)} label="Testing Dataset" helperText={helperForDataset(selectedTesting)} fullWidth />} />
                    </Grid>
                  </Grid>
                  <Divider sx={{ my: 2 }} />
                  <MDTypography variant="button" fontWeight="medium">Suggested pairs from shared folder</MDTypography>
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
                    {!loadingDatasets && !catalog.suggestedPairs.length ? <Chip label="No suggested pairs" variant="outlined" sx={chipSx(darkMode)} /> : null}
                  </Stack>
                </SettingsSection>
              </Grid>
              <Grid item xs={12} lg={5}>
                <Stack spacing={3}>
                  <SettingsSection darkMode={darkMode} title="Shared dataset catalog" description={catalog.directory || "Waiting for the shared folder scan..."}>
                    <MDTypography variant="caption" display="block">{loadingDatasets ? "Loading..." : `${catalog.datasets.length} file(s) found`}</MDTypography>
                    <MDTypography variant="caption" display="block">{`Formats: ${(catalog.summary?.availableFormats || []).join(", ") || "--"}`}</MDTypography>
                    <MDTypography variant="caption" display="block">{`Total size: ${catalog.summary?.totalSizeLabel || "--"}`}</MDTypography>
                    <MDTypography variant="caption" display="block">{`Families: ${catalog.summary?.familyCount || 0}`}</MDTypography>
                    <MDTypography variant="caption" display="block">{`Instances: ${catalog.summary?.totalInstances || 0}`}</MDTypography>
                    <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                      {catalog.datasets.slice(0, 8).map((dataset) => <Chip key={dataset.name} label={dataset.name} size="small" variant="outlined" sx={chipSx(darkMode)} />)}
                    </Stack>
                  </SettingsSection>
                  <SettingsSection darkMode={darkMode} title="Execution summary" description="Review the next launch before it enters the queue.">
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {form.algorithms.map((algorithm) => <Chip key={algorithm} label={algorithm} color="info" size="small" />)}
                    </Stack>
                    <MDBox mt={1.25}>
                      <MDTypography variant="caption" display="block">{`Classifier: ${form.classifier}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`Neighborhood: ${form.neighborhoodStrategy}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`Neighborhood max iterations: ${form.neighborhoodMaxIterations}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`BitFlip max iterations: ${form.bitFlipMaxIterations}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`IWSS max iterations: ${form.iwssMaxIterations}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`IWSSR max iterations: ${form.iwssrMaxIterations}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`Training: ${form.datasetTrainingName || "--"}`}</MDTypography>
                      <MDTypography variant="caption" display="block">{`Testing: ${form.datasetTestingName || "--"}`}</MDTypography>
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
                  <SettingsSection darkMode={darkMode} title="Local services" description="Endpoints exposed by the API gateway for dispatch.">
                    {services.map((service) => <MDBox key={service.key} mb={1.25}><MDTypography variant="button" fontWeight="medium">{service.label}</MDTypography><MDTypography variant="caption" display="block">{service.url}</MDTypography></MDBox>)}
                    {loadingServices ? <MDTypography variant="caption">Loading local services...</MDTypography> : null}
                  </SettingsSection>
                  <SettingsSection darkMode={darkMode} title={t("settings.lastDispatch")} description="Most recent queued launch created from this browser session.">
                    {lastDispatch ? <Stack spacing={1}><MDTypography variant="caption">{`Request ID: ${lastDispatch.requestId}`}</MDTypography><MDTypography variant="caption">{`Requested at: ${formatDateTime(lastDispatch.requestedAt)}`}</MDTypography><MDTypography variant="caption">{`Queue state: ${lastDispatch.queueState || "--"}`}</MDTypography><MDTypography variant="caption">{`Algorithms: ${(lastDispatch.algorithms || []).join(", ")}`}</MDTypography></Stack> : loadingDatasets ? <CircularProgress size={18} /> : <MDTypography variant="button">{t("settings.noDispatchYet")}</MDTypography>}
                  </SettingsSection>
                </Stack>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Stack spacing={3}>
                  <SettingsSection darkMode={darkMode} title={t("settings.resetMonitorCardTitle")} description={t("settings.resetMonitorCardDescription")}>
                    <MDBox display="flex" gap={1.5} flexWrap="wrap">
                      <MDButton variant="gradient" color="error" onClick={handleResetMonitor}>{t("settings.resetMonitorButton")}</MDButton>
                      <MDButton variant="outlined" color="info" onClick={() => { clearGraspNotifications(); toast.success(t("settings.clearBrowserStateSuccess")); }}>{t("settings.clearBrowserStateButton")}</MDButton>
                    </MDBox>
                  </SettingsSection>
                </Stack>
              </Grid>
            </Grid> : null}

            <MDBox mt={4} display="flex" gap={1.5} flexWrap="wrap">
              <MDButton type="submit" variant="gradient" color="info" disabled={submitting}>
                {submitting ? t("settings.submitting") : "Queue execution"}
              </MDButton>
              <MDButton variant="outlined" color="secondary" onClick={() => setForm({ ...defaultExecutionForm, datasetTrainingName: catalog.suggestedPairs[0]?.trainingName || "", datasetTestingName: catalog.suggestedPairs[0]?.testingName || "" })}>
                {t("common.reset")}
              </MDButton>
            </MDBox>
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Settings;
