import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

import userService from "api/users";
import { toast } from "react-toastify";
import {
  buildUserPayload,
  formatCpf,
  formatPhone,
  formatUserFormValues,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
} from "utils/userInputFormatters";

function UserEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await userService.getUserById(id);
        setUser(data);
        setForm(formatUserFormValues({
          name: data.name,
          email: data.email,
          cpf: data.cpf || "",
          telefone: data.telefone || "",
          role: data.role,
          active: Boolean(data.active),
          password: "",
        }));
      } catch (requestError) {
        setError(requestError.response?.data?.error || requestError.message || "Unable to load the user.");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [id]);

  const handleChange = (field) => (event) => {
    const valueMap = {
      email: normalizeEmail,
      cpf: formatCpf,
      telefone: formatPhone,
    };
    const rawValue = field === "active" ? event.target.value === "true" : event.target.value;
    const value = valueMap[field] ? valueMap[field](rawValue) : rawValue;

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setError("");

    if (!isValidEmail(form.email)) {
      const message = "Enter a valid email address.";
      setError(message);
      toast.error(message);
      return;
    }

    if (form.cpf && !isValidCpf(form.cpf)) {
      const message = "Enter CPF in the 000.000.000-00 format.";
      setError(message);
      toast.error(message);
      return;
    }

    if (form.telefone && !isValidPhone(form.telefone)) {
      const message = "Enter a phone number as (11) 99999-9999 or (11) 3333-4444.";
      setError(message);
      toast.error(message);
      return;
    }

    if (form.password && form.password.length < 6) {
      const message = "The new password must be at least 6 characters long.";
      setError(message);
      toast.error(message);
      return;
    }

    try {
      setSaving(true);
      const payload = buildUserPayload(form);

      if (!payload.password) {
        delete payload.password;
      }

      const updated = await userService.updateUser(id, payload);
      setUser(updated);
      setForm((current) => ({
        ...current,
        password: "",
      }));
      toast.success("User updated successfully.");
    } catch (requestError) {
      const message = requestError.response?.data?.error || requestError.message || "Unable to save the user.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDTypography variant="h4">Edit user</MDTypography>
            <MDTypography variant="button" color="text">
              Update access role, status, and profile details for the selected user.
            </MDTypography>

            {error ? (
              <MDBox mt={2}>
                <Alert severity="error">{error}</Alert>
              </MDBox>
            ) : null}

            {loading || !form ? (
              <MDBox mt={3}>
                <MDTypography variant="button" color="text">
                  Loading user...
                </MDTypography>
              </MDBox>
            ) : (
              <>
                <Grid container spacing={2} mt={1}>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Name" value={form.name} onChange={handleChange("name")} autoComplete="name" />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Email" type="email" value={form.email} onChange={handleChange("email")} autoComplete="email" />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="CPF"
                      value={form.cpf}
                      onChange={handleChange("cpf")}
                      placeholder="000.000.000-00"
                      inputProps={{ inputMode: "numeric", maxLength: 14 }}
                      autoComplete="off"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      label="Phone"
                      value={form.telefone}
                      onChange={handleChange("telefone")}
                      placeholder="(11) 99999-9999"
                      inputProps={{ inputMode: "tel", maxLength: 15 }}
                      autoComplete="tel-national"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField select fullWidth label="Role" value={form.role} onChange={handleChange("role")}>
                      <MenuItem value="ADMIN">Administrator</MenuItem>
                      <MenuItem value="VIEWER">Viewer</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField select fullWidth label="Status" value={String(form.active)} onChange={handleChange("active")}>
                      <MenuItem value="true">Active</MenuItem>
                      <MenuItem value="false">Inactive</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="New password"
                      type="password"
                      value={form.password}
                      onChange={handleChange("password")}
                      autoComplete="new-password"
                      helperText="Fill this only if you want to reset the password."
                    />
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1.5} mt={3}>
                  <MDButton variant="gradient" color="info" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </MDButton>
                  <MDButton variant="outlined" color="secondary" onClick={() => navigate("/admin/users")}>
                    Back
                  </MDButton>
                </Stack>

                {user ? (
                  <MDBox mt={3}>
                    <MDTypography variant="caption" color="text">
                      User created on {new Date(user.createdAt).toLocaleString()}.
                    </MDTypography>
                  </MDBox>
                ) : null}
              </>
            )}
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default UserEdit;
