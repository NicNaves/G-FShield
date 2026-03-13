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
      setError(requestError.response?.data?.error || requestError.message || "Unable to load users.");
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
      toast.error("Enter a valid email address.");
      return;
    }

    if (form.cpf && !isValidCpf(form.cpf)) {
      toast.error("Enter CPF in the 000.000.000-00 format.");
      return;
    }

    if (form.telefone && !isValidPhone(form.telefone)) {
      toast.error("Enter a phone number as (11) 99999-9999 or (11) 3333-4444.");
      return;
    }

    if (!form.password || form.password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    try {
      setCreating(true);
      await userService.createUser(buildUserPayload(form));
      toast.success("User created successfully.");
      setForm(defaultForm);
      await loadUsers();
    } catch (requestError) {
      const message = requestError.response?.data?.error || requestError.message || "Unable to create the user.";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const table = {
    columns: [
      { Header: "Name", accessor: "name", align: "left" },
      { Header: "Email", accessor: "email", align: "left" },
      { Header: "Role", accessor: "role", align: "center" },
      { Header: "Status", accessor: "active", align: "center" },
      { Header: "Actions", accessor: "actions", align: "center" },
    ],
    rows: users.map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active ? "Active" : "Inactive",
      actions: (
        <MDButton variant="outlined" color="info" size="small" onClick={() => navigate(`/admin/users/${user.id}`)}>
          Edit
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
                <MDTypography variant="h5">User administration</MDTypography>
                <MDTypography variant="button" color="text">
                  Create users and define who can run pipeline requests or only monitor the dashboard.
                </MDTypography>

                <Stack spacing={2} mt={3}>
                  <TextField label="Name" value={form.name} onChange={handleChange("name")} autoComplete="name" fullWidth />
                  <TextField
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={handleChange("email")}
                    autoComplete="email"
                    fullWidth
                  />
                  <TextField
                    label="CPF"
                    value={form.cpf}
                    onChange={handleChange("cpf")}
                    placeholder="000.000.000-00"
                    inputProps={{ inputMode: "numeric", maxLength: 14 }}
                    autoComplete="off"
                    fullWidth
                  />
                  <TextField
                    label="Phone"
                    value={form.telefone}
                    onChange={handleChange("telefone")}
                    placeholder="(11) 99999-9999"
                    inputProps={{ inputMode: "tel", maxLength: 15 }}
                    autoComplete="tel-national"
                    fullWidth
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={form.password}
                    onChange={handleChange("password")}
                    autoComplete="new-password"
                    fullWidth
                  />
                  <TextField select label="Role" value={form.role} onChange={handleChange("role")} fullWidth>
                    <MenuItem value="ADMIN">Administrator</MenuItem>
                    <MenuItem value="VIEWER">Viewer</MenuItem>
                  </TextField>
                </Stack>

                <MDBox mt={3}>
                  <MDButton type="submit" variant="gradient" color="info" disabled={creating}>
                    {creating ? "Creating..." : "Create user"}
                  </MDButton>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5">Registered users</MDTypography>
                <MDTypography variant="button" color="text">
                  Administrators can run the pipeline. Viewers are limited to the dashboard and dataset catalog.
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
                    Loading users...
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
