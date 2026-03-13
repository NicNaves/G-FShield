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
      setError(requestError.response?.data?.error || requestError.message || "Nao foi possivel carregar usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();

    try {
      setCreating(true);
      await userService.createUser(form);
      toast.success("Usuario criado com sucesso.");
      setForm(defaultForm);
      await loadUsers();
    } catch (requestError) {
      const message = requestError.response?.data?.error || requestError.message || "Nao foi possivel criar o usuario.";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const table = {
    columns: [
      { Header: "Nome", accessor: "name", align: "left" },
      { Header: "Email", accessor: "email", align: "left" },
      { Header: "Perfil", accessor: "role", align: "center" },
      { Header: "Status", accessor: "active", align: "center" },
      { Header: "Acoes", accessor: "actions", align: "center" },
    ],
    rows: users.map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active ? "Ativo" : "Inativo",
      actions: (
        <MDButton variant="outlined" color="info" size="small" onClick={() => navigate(`/admin/users/${user.id}`)}>
          Editar
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
                <MDTypography variant="h5">Administracao de usuarios</MDTypography>
                <MDTypography variant="button" color="text">
                  Crie usuarios e defina quem pode executar consultas ou apenas acompanhar o dashboard.
                </MDTypography>

                <Stack spacing={2} mt={3}>
                  <TextField label="Nome" value={form.name} onChange={handleChange("name")} fullWidth />
                  <TextField label="Email" value={form.email} onChange={handleChange("email")} fullWidth />
                  <TextField label="CPF" value={form.cpf} onChange={handleChange("cpf")} fullWidth />
                  <TextField label="Telefone" value={form.telefone} onChange={handleChange("telefone")} fullWidth />
                  <TextField label="Senha" type="password" value={form.password} onChange={handleChange("password")} fullWidth />
                  <TextField select label="Perfil" value={form.role} onChange={handleChange("role")} fullWidth>
                    <MenuItem value="ADMIN">Administrador</MenuItem>
                    <MenuItem value="VIEWER">Visualizador</MenuItem>
                  </TextField>
                </Stack>

                <MDBox mt={3}>
                  <MDButton type="submit" variant="gradient" color="info" disabled={creating}>
                    {creating ? "Criando..." : "Criar usuario"}
                  </MDButton>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5">Usuarios cadastrados</MDTypography>
                <MDTypography variant="button" color="text">
                  Administradores podem executar o pipeline. Visualizadores ficam restritos ao dashboard e catalogo.
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
                    Carregando usuarios...
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
