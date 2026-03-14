import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";

import userService from "api/users";
import { toast } from "react-toastify";
import {
  buildUserPayload,
  formatCpf,
  formatPhone,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
} from "utils/userInputFormatters";
import useI18n from "hooks/useI18n";

const defaultForm = {
  name: "",
  email: "",
  cpf: "",
  telefone: "",
  password: "",
  role: "VIEWER",
};

function Users() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await userService.getUsers();
      setUsers(response);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || t("users.unableLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleChange = (field) => (event) => {
    const valueMap = {
      email: normalizeEmail,
      cpf: formatCpf,
      telefone: formatPhone,
    };
    const nextValue = valueMap[field] ? valueMap[field](event.target.value) : event.target.value;

    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();

    if (!isValidEmail(form.email)) {
      toast.error(t("auth.invalidEmail"));
      return;
    }

    if (form.cpf && !isValidCpf(form.cpf)) {
      toast.error(t("auth.invalidCpf"));
      return;
    }

    if (form.telefone && !isValidPhone(form.telefone)) {
      toast.error(t("auth.invalidPhone"));
      return;
    }

    if (!form.password || form.password.length < 6) {
      toast.error(t("auth.passwordMin"));
      return;
    }

    try {
      setCreating(true);
      await userService.createUser(buildUserPayload(form));
      toast.success(t("users.created"));
      setForm(defaultForm);
      await loadUsers();
    } catch (requestError) {
      const message = requestError.response?.data?.error || requestError.message || t("users.unableCreate");
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const table = {
    columns: [
      { Header: t("users.name"), accessor: "name", align: "left" },
      { Header: t("users.email"), accessor: "email", align: "left" },
      { Header: t("users.role"), accessor: "role", align: "center" },
      { Header: t("users.status"), accessor: "active", align: "center" },
      { Header: t("users.actions"), accessor: "actions", align: "center" },
    ],
    rows: users.map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active ? t("users.active") : t("users.inactive"),
      actions: (
        <MDButton variant="outlined" color="info" size="small" onClick={() => navigate(`/admin/users/${user.id}`)}>
          {t("users.edit")}
        </MDButton>
      ),
    })),
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={5}>
            <Card component="form" onSubmit={handleCreate}>
              <MDBox p={3}>
                <MDTypography variant="h5">{t("users.title")}</MDTypography>
                <MDTypography variant="button" color="text">
                  {t("users.subtitle")}
                </MDTypography>

                <Stack spacing={2} mt={3}>
                  <TextField label={t("users.name")} value={form.name} onChange={handleChange("name")} autoComplete="name" fullWidth />
                  <TextField
                    label={t("users.email")}
                    type="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    autoComplete="email"
                    fullWidth
                  />
                  <TextField
                    label={t("users.cpf")}
                    value={form.cpf}
                    onChange={handleChange("cpf")}
                    placeholder="000.000.000-00"
                    inputProps={{ inputMode: "numeric", maxLength: 14 }}
                    autoComplete="off"
                    fullWidth
                  />
                  <TextField
                    label={t("users.phone")}
                    value={form.telefone}
                    onChange={handleChange("telefone")}
                    placeholder="(11) 99999-9999"
                    inputProps={{ inputMode: "tel", maxLength: 15 }}
                    autoComplete="tel-national"
                    fullWidth
                  />
                  <TextField
                    label={t("users.password")}
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                    autoComplete="new-password"
                    fullWidth
                  />
                  <TextField select label={t("users.role")} value={form.role} onChange={handleChange("role")} fullWidth>
                    <MenuItem value="ADMIN">{t("users.administrator")}</MenuItem>
                    <MenuItem value="VIEWER">{t("users.viewer")}</MenuItem>
                  </TextField>
                </Stack>

                <MDBox mt={3}>
                  <MDButton type="submit" variant="gradient" color="info" disabled={creating}>
                    {creating ? t("users.creating") : t("users.createUser")}
                  </MDButton>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5">{t("users.registeredUsers")}</MDTypography>
                <MDTypography variant="button" color="text">
                  {t("users.registeredUsersSubtitle")}
                </MDTypography>
              </MDBox>

              {error ? (
                <MDBox px={3} pb={2}>
                  <Alert severity="error">{error}</Alert>
                </MDBox>
              ) : null}

              <DataTable
                table={table}
                isSorted
                entriesPerPage={{ defaultValue: 10, entries: [5, 10, 20] }}
                showTotalEntries
                noEndBorder
                canSearch
              />

              {loading ? (
                <MDBox px={3} pb={3}>
                  <MDTypography variant="button" color="text">
                    {t("users.loadingUsers")}
                  </MDTypography>
                </MDBox>
              ) : null}
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Users;
