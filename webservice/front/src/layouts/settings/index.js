import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

import { getGraspServices, startGraspExecution } from "api/grasp";
import {
  algorithmCatalog,
  classifierOptions,
  defaultExecutionForm,
  localSearchCatalog,
  neighborhoodOptions,
} from "data/graspOptions";
import useDatasetCatalog from "hooks/useDatasetCatalog";
import { formatDateTime, getDatasetRoleLabel } from "utils/graspFormatters";
import { toast } from "react-toastify";

function SettingsSection({ title, description, children }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", p: 2.5 }}>
      <MDTypography variant="h6" color="dark">
        {title}
      </MDTypography>
      {description ? (
        <MDTypography variant="caption" display="block" color="text" mt={0.5} mb={2}>
          {description}
        </MDTypography>
      ) : null}
      {children}
    </Card>
  );
}

SettingsSection.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  children: PropTypes.node.isRequired,
};

SettingsSection.defaultProps = {
  description: "",
};

function Settings() {
  const navigate = useNavigate();
  const [form, setForm] = useState(defaultExecutionForm);
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastDispatch, setLastDispatch] = useState(null);
  const [error, setError] = useState("");
  const { catalog, loading: loadingDatasets, error: datasetError } = useDatasetCatalog();

  useEffect(() => {
    let active = true;

    const loadServices = async () => {
      try {
        setLoadingServices(true);
        const availableServices = await getGraspServices();
        if (active) {
          setServices(availableServices);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load local services.");
        }
      } finally {
        if (active) {
          setLoadingServices(false);
        }
      }
    };

    loadServices();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!catalog.suggestedPairs?.length) {
      return;
    }

    setForm((current) => {
      if (current.datasetTrainingName || current.datasetTestingName) {
        return current;
      }

      return {
        ...current,
        datasetTrainingName: catalog.suggestedPairs[0].trainingName,
        datasetTestingName: catalog.suggestedPairs[0].testingName,
      };
    });
  }, [catalog.suggestedPairs]);

  useEffect(() => {
    if (datasetError) {
      setError(datasetError);
    }
  }, [datasetError]);

  const datasetOptions = useMemo(() => catalog.datasets.map((dataset) => dataset.name), [catalog.datasets]);

  const selectedPair = useMemo(
    () =>
      catalog.suggestedPairs.find(
        (pair) =>
          pair.trainingName === form.datasetTrainingName && pair.testingName === form.datasetTestingName
      ) || null,
    [catalog.suggestedPairs, form.datasetTrainingName, form.datasetTestingName]
  );

  const selectedTraining = useMemo(
    () => catalog.datasets.find((dataset) => dataset.name === form.datasetTrainingName) || null,
    [catalog.datasets, form.datasetTrainingName]
  );

  const selectedTesting = useMemo(
    () => catalog.datasets.find((dataset) => dataset.name === form.datasetTestingName) || null,
    [catalog.datasets, form.datasetTestingName]
  );

  const handleChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const toggleAlgorithm = (algorithmKey) => {
    setForm((current) => {
      const exists = current.algorithms.includes(algorithmKey);
      const algorithms = exists
        ? current.algorithms.filter((item) => item !== algorithmKey)
        : [...current.algorithms, algorithmKey];

      return {
        ...current,
        algorithms,
      };
    });
  };

  const toggleLocalSearch = (localSearchKey) => {
    setForm((current) => {
      const exists = current.localSearches.includes(localSearchKey);
      const localSearches = exists
        ? current.localSearches.filter((item) => item !== localSearchKey)
        : [...current.localSearches, localSearchKey];

      return {
        ...current,
        localSearches,
      };
    });
  };

  const applySuggestedPair = (pair) => {
    setForm((current) => ({
      ...current,
      datasetTrainingName: pair.trainingName,
      datasetTestingName: pair.testingName,
    }));
  };

  const resetForm = () => {
    setForm({
      ...defaultExecutionForm,
      datasetTrainingName: catalog.suggestedPairs[0]?.trainingName || "",
      datasetTestingName: catalog.suggestedPairs[0]?.testingName || "",
    });
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.algorithms.length === 0) {
      setError("Select at least one RCL algorithm.");
      return;
    }

    if (!form.datasetTrainingName || !form.datasetTestingName) {
      setError("Select the training and testing files from the shared folder.");
      return;
    }

    if (form.localSearches.length === 0) {
      setError("Select at least one local-search service for the DLS.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const payload = {
        ...form,
        maxGenerations: Number(form.maxGenerations),
        rclCutoff: Number(form.rclCutoff),
        sampleSize: Number(form.sampleSize),
        neighborhoodMaxIterations: Number(form.neighborhoodMaxIterations),
        bitFlipMaxIterations: Number(form.bitFlipMaxIterations),
        iwssMaxIterations: Number(form.iwssMaxIterations),
        iwssrMaxIterations: Number(form.iwssrMaxIterations),
      };

      const response = await startGraspExecution(payload);
      setLastDispatch(response);
      toast.success("Execucao iniciada com sucesso.");
      navigate("/dashboard");
    } catch (submitError) {
      const message = submitError.response?.data?.error || submitError.message;
      setError(message || "Unable to start the execution.");
      toast.error(message || "Unable to start the execution.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} xl={8}>
            <Card component="form" onSubmit={handleSubmit}>
              <MDBox p={3}>
                <MDTypography variant="h4" color="dark" mb={0.5}>
                  Settings
                </MDTypography>
                <MDTypography variant="button" color="text">
                  Configure a GRASP-FS pipeline run using the files available in the shared datasets folder.
                </MDTypography>

                {error ? (
                  <MDBox mt={2}>
                    <Alert severity="error">{error}</Alert>
                  </MDBox>
                ) : null}

                {!catalog.exists && !loadingDatasets ? (
                  <MDBox mt={2}>
                    <Alert severity="warning">
                      The datasets folder was not found by the API. Set `GRASP_DATASETS_DIR` on the server or mount the folder at `/datasets`.
                    </Alert>
                  </MDBox>
                ) : null}

                <MDBox mt={3}>
                  <Grid container spacing={2.5}>
                    <Grid item xs={12}>
                      <MDTypography variant="h6" color="dark" mb={1}>
                        Analysis settings
                      </MDTypography>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <SettingsSection
                        title="Execution budget"
                        description="Core parameters that control the size and cost of the initial construction."
                      >
                        <Stack spacing={2}>
                          <TextField
                            fullWidth
                            label="Max. Number of Generations"
                            type="number"
                            value={form.maxGenerations}
                            onChange={handleChange("maxGenerations")}
                          />
                          <TextField
                            fullWidth
                            label="RCL Cutoff"
                            type="number"
                            value={form.rclCutoff}
                            onChange={handleChange("rclCutoff")}
                          />
                          <TextField
                            fullWidth
                            label="Sample Size"
                            type="number"
                            value={form.sampleSize}
                            onChange={handleChange("sampleSize")}
                          />
                          <TextField
                            fullWidth
                            label="Neighborhood Max Iterations"
                            type="number"
                            value={form.neighborhoodMaxIterations}
                            onChange={handleChange("neighborhoodMaxIterations")}
                          />
                        </Stack>
                      </SettingsSection>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <SettingsSection
                        title="Classifier and orchestration"
                        description="Choose the classifier and how the distributed local-search stage should be orchestrated."
                      >
                        <Stack spacing={2}>
                          <TextField
                            select
                            SelectProps={{ native: true }}
                            fullWidth
                            label="Classifier Algorithm"
                            value={form.classifier}
                            onChange={handleChange("classifier")}
                          >
                            {classifierOptions.map((classifier) => (
                              <option key={classifier} value={classifier}>
                                {classifier}
                              </option>
                            ))}
                          </TextField>
                          <TextField
                            select
                            SelectProps={{ native: true }}
                            fullWidth
                            label="Neighborhood Strategy"
                            value={form.neighborhoodStrategy}
                            onChange={handleChange("neighborhoodStrategy")}
                          >
                            {neighborhoodOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </TextField>
                        </Stack>
                      </SettingsSection>
                    </Grid>

                    <Grid item xs={12}>
                      <SettingsSection
                        title="Dataset selection"
                        description="Choose files manually from the shared folder or use an API-suggested pair."
                      >
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <Autocomplete
                              freeSolo
                              options={datasetOptions}
                              value={form.datasetTrainingName}
                              onInputChange={(event, value) =>
                                setForm((current) => ({ ...current, datasetTrainingName: value }))
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Training Dataset"
                                  helperText={selectedTraining ? `${selectedTraining.sizeLabel} · ${getDatasetRoleLabel(selectedTraining.roleSuggestion)}` : "Choose a file from the shared folder"}
                                  fullWidth
                                />
                              )}
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Autocomplete
                              freeSolo
                              options={datasetOptions}
                              value={form.datasetTestingName}
                              onInputChange={(event, value) =>
                                setForm((current) => ({ ...current, datasetTestingName: value }))
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Testing Dataset"
                                  helperText={selectedTesting ? `${selectedTesting.sizeLabel} · ${getDatasetRoleLabel(selectedTesting.roleSuggestion)}` : "Choose a file from the shared folder"}
                                  fullWidth
                                />
                              )}
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <MDTypography variant="button" fontWeight="medium" color="dark">
                              Suggested pairs from shared folder
                            </MDTypography>
                            <Stack direction="row" spacing={1} mt={1} flexWrap="wrap" useFlexGap>
                              {catalog.suggestedPairs.map((pair) => (
                                <Chip
                                  key={pair.id}
                                  label={pair.label}
                                  color={selectedPair?.id === pair.id ? "info" : "default"}
                                  variant={selectedPair?.id === pair.id ? "filled" : "outlined"}
                                  onClick={() => applySuggestedPair(pair)}
                                />
                              ))}
                              {!loadingDatasets && catalog.suggestedPairs.length === 0 ? (
                                <Chip label="Sem pares sugeridos" variant="outlined" />
                              ) : null}
                            </Stack>
                          </Grid>
                        </Grid>
                      </SettingsSection>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <SettingsSection
                        title="Distributed local search"
                        description="Choose which local-search services the DLS can use and set their per-run iteration budgets."
                      >
                        <Grid container spacing={1.5}>
                          {localSearchCatalog.map((localSearch) => (
                            <Grid item xs={12} key={localSearch.key}>
                              <Card variant="outlined" sx={{ p: 1.5 }}>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={form.localSearches.includes(localSearch.key)}
                                      onChange={() => toggleLocalSearch(localSearch.key)}
                                    />
                                  }
                                  label={localSearch.label}
                                />
                                <MDTypography variant="caption" color="text">
                                  {localSearch.shortDescription}
                                </MDTypography>
                                <MDBox mt={1.5}>
                                  <TextField
                                    fullWidth
                                    type="number"
                                    size="small"
                                    label={`${localSearch.label} Max Iterations`}
                                    value={
                                      localSearch.key === "BIT_FLIP"
                                        ? form.bitFlipMaxIterations
                                        : localSearch.key === "IWSS"
                                          ? form.iwssMaxIterations
                                          : form.iwssrMaxIterations
                                    }
                                    onChange={
                                      localSearch.key === "BIT_FLIP"
                                        ? handleChange("bitFlipMaxIterations")
                                        : localSearch.key === "IWSS"
                                          ? handleChange("iwssMaxIterations")
                                          : handleChange("iwssrMaxIterations")
                                    }
                                    disabled={!form.localSearches.includes(localSearch.key)}
                                  />
                                </MDBox>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </SettingsSection>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <SettingsSection
                        title="RCL algorithms"
                        description="Select the initial-solution generators that should be dispatched by the gateway."
                      >
                        <Grid container spacing={1}>
                          {algorithmCatalog.map((algorithm) => (
                            <Grid item xs={12} key={algorithm.key}>
                              <Card variant="outlined" sx={{ p: 1.5 }}>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={form.algorithms.includes(algorithm.key)}
                                      onChange={() => toggleAlgorithm(algorithm.key)}
                                    />
                                  }
                                  label={algorithm.label}
                                />
                                <MDTypography variant="caption" color="text">
                                  {algorithm.shortDescription}
                                </MDTypography>
                              </Card>
                            </Grid>
                          ))}
                        </Grid>
                      </SettingsSection>
                    </Grid>
                  </Grid>
                </MDBox>

                <MDBox mt={4} display="flex" gap={1.5}>
                  <MDButton type="submit" variant="gradient" color="info" disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit"}
                  </MDButton>
                  <MDButton variant="outlined" color="secondary" onClick={resetForm}>
                    Reset
                  </MDButton>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} xl={4}>
            <Stack spacing={3}>
              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    Shared dataset catalog
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    {catalog.directory || "Waiting for the shared folder scan..."}
                  </MDTypography>

                  <Divider sx={{ my: 2 }} />

                  <Stack spacing={1.25}>
                    <MDTypography variant="button" color="dark">
                      Available files
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      {loadingDatasets ? "Loading..." : `${catalog.datasets.length} file(s) found`}
                    </MDTypography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {catalog.datasets.slice(0, 6).map((dataset) => (
                        <Chip key={dataset.name} label={dataset.name} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Stack>
                </MDBox>
              </Card>

              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    Execution summary
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    The neighborhood strategy and local-search services below are submitted together with the execution to the distributed pipeline.
                  </MDTypography>

                  <Divider sx={{ my: 2 }} />

                  <Stack spacing={1.25}>
                    <MDTypography variant="button" color="dark">
                      Selected algorithms
                    </MDTypography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {form.algorithms.map((algorithmKey) => (
                        <Chip key={algorithmKey} label={algorithmKey} color="info" size="small" />
                      ))}
                    </Stack>
                    <MDTypography variant="caption" color="text">
                      Classifier: {form.classifier}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      Neighborhood: {form.neighborhoodStrategy}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      Neighborhood max iterations: {form.neighborhoodMaxIterations}
                    </MDTypography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {form.localSearches.map((localSearch) => (
                        <Chip key={localSearch} label={localSearch} size="small" variant="outlined" />
                      ))}
                    </Stack>
                    <MDTypography variant="caption" color="text">
                      BitFlip max iterations: {form.bitFlipMaxIterations}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      IWSS max iterations: {form.iwssMaxIterations}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      IWSSR max iterations: {form.iwssrMaxIterations}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      Training: {form.datasetTrainingName || "--"}
                    </MDTypography>
                    <MDTypography variant="caption" color="text">
                      Testing: {form.datasetTestingName || "--"}
                    </MDTypography>
                  </Stack>
                </MDBox>
              </Card>

              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    Local services
                  </MDTypography>
                  <MDTypography variant="button" color="text">
                    Endpoints exposed by the API gateway for local dispatch.
                  </MDTypography>

                  <Divider sx={{ my: 2 }} />

                  <Stack spacing={1.5}>
                    {services.map((service) => (
                      <MDBox key={service.key}>
                        <MDTypography variant="button" fontWeight="medium" color="dark">
                          {service.label}
                        </MDTypography>
                        <MDTypography variant="caption" display="block" color="text">
                          {service.url}
                        </MDTypography>
                      </MDBox>
                    ))}

                    {loadingServices ? (
                      <MDTypography variant="caption" color="text">
                        Loading local services...
                      </MDTypography>
                    ) : null}
                  </Stack>
                </MDBox>
              </Card>

              <Card>
                <MDBox p={3}>
                  <MDTypography variant="h6" color="dark">
                    Last dispatch
                  </MDTypography>
                  {lastDispatch ? (
                    <Stack spacing={1.25} mt={1.5}>
                      <MDTypography variant="caption" color="text">
                        Request ID: {lastDispatch.requestId}
                      </MDTypography>
                      <MDTypography variant="caption" color="text">
                        Requested at: {formatDateTime(lastDispatch.requestedAt)}
                      </MDTypography>
                      <MDTypography variant="caption" color="text">
                        Algorithms: {lastDispatch.algorithms.join(", ")}
                      </MDTypography>
                      <MDTypography variant="caption" color="text">
                        Neighborhood: {lastDispatch.params?.neighborhoodStrategy || "--"}
                      </MDTypography>
                      <MDTypography variant="caption" color="text">
                        Neighborhood max iterations: {lastDispatch.params?.neighborhoodMaxIterations || "--"}
                      </MDTypography>
                      <MDTypography variant="caption" color="text">
                        Local searches: {lastDispatch.params?.localSearches || "--"}
                      </MDTypography>
                      <MDTypography variant="caption" color="text">
                        BitFlip / IWSS / IWSSR max iterations: {lastDispatch.params?.bitFlipMaxIterations || "--"} / {lastDispatch.params?.iwssMaxIterations || "--"} / {lastDispatch.params?.iwssrMaxIterations || "--"}
                      </MDTypography>
                    </Stack>
                  ) : loadingDatasets ? (
                    <MDBox py={1}>
                      <CircularProgress size={18} />
                    </MDBox>
                  ) : (
                    <MDTypography variant="button" color="text">
                      No execution has been started in this session yet.
                    </MDTypography>
                  )}
                </MDBox>
              </Card>
            </Stack>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Settings;
