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
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    if (!isValidEmail(form.email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (form.cpf && !isValidCpf(form.cpf)) {
      setError("Enter CPF in the 000.000.000-00 format.");
      return;
    }

    if (form.telefone && !isValidPhone(form.telefone)) {
      setError("Enter a phone number as (11) 99999-9999 or (11) 3333-4444.");
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

      setSuccess("Account created successfully. You can sign in now.");
      setTimeout(() => navigate("/authentication/sign-in"), 1200);
    } catch (requestError) {
      setError(requestError.error || requestError.message || "Unable to complete the sign-up process.");
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
            Create account
          </MDTypography>
          <MDTypography display="block" variant="button" color="white" my={1}>
            Register a user to access the GF-Shield dashboard.
          </MDTypography>
        </MDBox>
        <MDBox pt={4} pb={3} px={3}>
          <MDBox component="form" role="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              {success ? <Alert severity="success">{success}</Alert> : null}
              <MDInput type="text" label="Name" value={form.name} onChange={handleChange("name")} autoComplete="name" fullWidth />
              <MDInput
                type="email"
                label="Email"
                value={form.email}
                onChange={handleChange("email")}
                autoComplete="email"
                fullWidth
              />
              <MDInput
                type="text"
                label="CPF"
                value={form.cpf}
                onChange={handleChange("cpf")}
                placeholder="000.000.000-00"
                inputProps={{ inputMode: "numeric", maxLength: 14 }}
                autoComplete="off"
                fullWidth
              />
              <MDInput
                type="text"
                label="Phone"
                value={form.telefone}
                onChange={handleChange("telefone")}
                placeholder="(11) 99999-9999"
                inputProps={{ inputMode: "tel", maxLength: 15 }}
                autoComplete="tel-national"
                fullWidth
              />
              <MDInput type="password" label="Password" value={form.password} onChange={handleChange("password")} autoComplete="new-password" fullWidth />
              <MDInput
                type="password"
                label="Confirm password"
                value={form.confirmPassword}
                onChange={handleChange("confirmPassword")}
                autoComplete="new-password"
                fullWidth
              />
            </Stack>
            <MDBox mt={4} mb={1}>
              <MDButton variant="gradient" color="info" fullWidth type="submit" disabled={submitting}>
                {submitting ? "Creating account..." : "Create account"}
              </MDButton>
            </MDBox>
            <MDBox mt={3} mb={1} textAlign="center">
              <MDTypography variant="button" color="text">
                Already have an account?{" "}
                <MDTypography
                  component={Link}
                  to="/authentication/sign-in"
                  variant="button"
                  color="info"
                  fontWeight="medium"
                  textGradient
                >
                  Sign in
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
