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

function SignUp() {
  const navigate = useNavigate();
  const { t } = useI18n();
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (form.password.length < 6) {
      setError(t("auth.passwordMin"));
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    if (!isValidEmail(form.email)) {
      setError(t("auth.invalidEmail"));
      return;
    }

    if (form.cpf && !isValidCpf(form.cpf)) {
      setError(t("auth.invalidCpf"));
      return;
    }

    if (form.telefone && !isValidPhone(form.telefone)) {
      setError(t("auth.invalidPhone"));
      return;
    }

    try {
      setSubmitting(true);
      await authApi.register(buildUserPayload({
        name: form.name,
        email: form.email,
        cpf: form.cpf,
        telefone: form.telefone,
        password: form.password,
      }));

      setSuccess(t("auth.accountCreated"));
      setTimeout(() => navigate("/authentication/sign-in"), 1200);
    } catch (requestError) {
      setError(requestError.error || requestError.message || t("auth.unableSignUp"));
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
            {t("auth.signUpTitle")}
          </MDTypography>
          <MDTypography display="block" variant="button" color="white" my={1}>
            {t("auth.signUpSubtitle")}
          </MDTypography>
        </MDBox>
        <MDBox pt={4} pb={3} px={3}>
          <MDBox component="form" role="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              {success ? <Alert severity="success">{success}</Alert> : null}
              <MDInput type="text" label={t("auth.name")} value={form.name} onChange={handleChange("name")} autoComplete="name" fullWidth />
              <MDInput
                type="email"
                label={t("auth.email")}
                value={form.email}
                onChange={handleChange("email")}
                autoComplete="email"
                fullWidth
              />
              <MDInput
                type="text"
                label={t("auth.cpf")}
                value={form.cpf}
                onChange={handleChange("cpf")}
                placeholder="000.000.000-00"
                inputProps={{ inputMode: "numeric", maxLength: 14 }}
                autoComplete="off"
                fullWidth
              />
              <MDInput
                type="text"
                label={t("auth.phone")}
                value={form.telefone}
                onChange={handleChange("telefone")}
                placeholder="(11) 99999-9999"
                inputProps={{ inputMode: "tel", maxLength: 15 }}
                autoComplete="tel-national"
                fullWidth
              />
              <MDInput type="password" label={t("auth.password")} value={form.password} onChange={handleChange("password")} autoComplete="new-password" fullWidth />
              <MDInput
                type="password"
                label={t("auth.confirmPassword")}
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                autoComplete="new-password"
                fullWidth
              />
            </Stack>
            <MDBox mt={4} mb={1}>
              <MDButton variant="gradient" color="info" fullWidth type="submit" disabled={submitting}>
                {submitting ? t("auth.creatingAccount") : t("auth.createAccount")}
              </MDButton>
            </MDBox>
            <MDBox mt={3} mb={1} textAlign="center">
              <MDTypography variant="button" color="text">
                {t("auth.alreadyHaveAccount")}{" "}
                <MDTypography
                  component={Link}
                  to="/authentication/sign-in"
                  variant="button"
                  color="info"
                  fontWeight="medium"
                  textGradient
                >
                  {t("auth.signIn")}
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
