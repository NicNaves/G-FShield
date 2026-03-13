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
        setForm({
          name: data.name,
          email: data.email,
          cpf: data.cpf || "",
          telefone: data.telefone || "",
          role: data.role,
          active: Boolean(data.active),
          password: "",
        });
      } catch (requestError) {
        setError(requestError.response?.data?.error || requestError.message || "Nao foi possivel carregar o usuario.");
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [id]);

  const handleChange = (field) => (event) => {
    const value = field === "active" ? event.target.value === "true" : event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        ...form,
      };

      if (!payload.password) {
        delete payload.password;
      }

      const updated = await userService.updateUser(id, payload);
      setUser(updated);
      setForm((current) => ({
        ...current,
        password: "",
      }));
      toast.success("Usuario atualizado com sucesso.");
    } catch (requestError) {
      const message = requestError.response?.data?.error || requestError.message || "Nao foi possivel salvar o usuario.";
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
            <MDTypography variant="h4">Editar usuario</MDTypography>
            <MDTypography variant="button" color="text">
              Ajuste perfil de acesso, status e dados cadastrais do usuario selecionado.
            </MDTypography>

            {error ? (
              <MDBox mt={2}>
                <Alert severity="error">{error}</Alert>
              </MDBox>
            ) : null}

            {loading || !form ? (
              <MDBox mt={3}>
                <MDTypography variant="button" color="text">
                  Carregando usuario...
                </MDTypography>
              </MDBox>
            ) : (
              <>
                <Grid container spacing={2} mt={1}>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Nome" value={form.name} onChange={handleChange("name")} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Email" value={form.email} onChange={handleChange("email")} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="CPF" value={form.cpf} onChange={handleChange("cpf")} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField fullWidth label="Telefone" value={form.telefone} onChange={handleChange("telefone")} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField select fullWidth label="Perfil" value={form.role} onChange={handleChange("role")}>
                      <MenuItem value="ADMIN">Administrador</MenuItem>
                      <MenuItem value="VIEWER">Visualizador</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField select fullWidth label="Status" value={String(form.active)} onChange={handleChange("active")}>
                      <MenuItem value="true">Ativo</MenuItem>
                      <MenuItem value="false">Inativo</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Nova senha"
                      type="password"
                      value={form.password}
                      onChange={handleChange("password")}
                      helperText="Preencha apenas se quiser redefinir a senha."
                    />
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1.5} mt={3}>
                  <MDButton variant="gradient" color="info" onClick={handleSave} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar alteracoes"}
                  </MDButton>
                  <MDButton variant="outlined" color="secondary" onClick={() => navigate("/admin/users")}>
                    Voltar
                  </MDButton>
                </Stack>

                {user ? (
                  <MDBox mt={3}>
                    <MDTypography variant="caption" color="text">
                      Usuario criado em {new Date(user.createdAt).toLocaleString()}.
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
