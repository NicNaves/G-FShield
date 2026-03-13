import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import Card from "@mui/material/Card";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import CoverLayout from "layouts/authentication/components/CoverLayout";

import bgImage from "assets/images/bg-sign-up-cover.jpeg";
import authApi from "api/auth";

function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    cpf: "",
    telefone: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("A confirmacao de senha nao confere.");
      return;
    }

    try {
      setSubmitting(true);
      await authApi.register({
        name: form.name,
        email: form.email,
        cpf: form.cpf || undefined,
        telefone: form.telefone || undefined,
        password: form.password,
      });

      setSuccess("Cadastro realizado com sucesso. Agora voce pode entrar.");
      setTimeout(() => navigate("/authentication/sign-in"), 1200);
    } catch (requestError) {
      setError(requestError.error || requestError.message || "Nao foi possivel concluir o cadastro.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CoverLayout image={bgImage}>
      <Card>
        <MDBox
          variant="gradient"
          bgColor="info"
          borderRadius="lg"
          coloredShadow="info"
          mx={2}
          mt={-3}
          p={3}
          mb={1}
          textAlign="center"
        >
          <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
            Criar conta
          </MDTypography>
          <MDTypography display="block" variant="button" color="white" my={1}>
            Cadastre um usuario para acompanhar o dashboard do GF-Shield.
          </MDTypography>
        </MDBox>
        <MDBox pt={4} pb={3} px={3}>
          <MDBox component="form" role="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              {success ? <Alert severity="success">{success}</Alert> : null}
              <MDInput type="text" label="Nome" value={form.name} onChange={handleChange("name")} fullWidth />
              <MDInput type="email" label="Email" value={form.email} onChange={handleChange("email")} fullWidth />
              <MDInput type="text" label="CPF" value={form.cpf} onChange={handleChange("cpf")} fullWidth />
              <MDInput type="text" label="Telefone" value={form.telefone} onChange={handleChange("telefone")} fullWidth />
              <MDInput type="password" label="Senha" value={form.password} onChange={handleChange("password")} fullWidth />
              <MDInput
                type="password"
                label="Confirmar senha"
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                fullWidth
              />
            </Stack>
            <MDBox mt={4} mb={1}>
              <MDButton variant="gradient" color="info" fullWidth type="submit" disabled={submitting}>
                {submitting ? "Cadastrando..." : "Cadastrar"}
              </MDButton>
            </MDBox>
            <MDBox mt={3} mb={1} textAlign="center">
              <MDTypography variant="button" color="text">
                Ja tem uma conta?{" "}
                <MDTypography
                  component={Link}
                  to="/authentication/sign-in"
                  variant="button"
                  color="info"
                  fontWeight="medium"
                  textGradient
                >
                  Entrar
                </MDTypography>
              </MDTypography>
            </MDBox>
          </MDBox>
        </MDBox>
      </Card>
    </CoverLayout>
  );
}

export default SignUp;
