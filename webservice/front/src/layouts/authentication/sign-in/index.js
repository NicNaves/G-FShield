import { useState } from "react";
import { Link, useNavigate } from "react-router-dom"; 
import apiLogin from "../../../api/auth";
import { useMaterialUIController, setLogin } from "../../../context"; 


import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";


import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import BasicLayout from "layouts/authentication/components/BasicLayout";


import bgImage from "assets/images/bg-sign-in-basic.jpeg";
import { AUTH_DISABLED, DEV_ROLE, DEV_TOKEN, DEV_USER_ID } from "../../../config/runtime";
import useI18n from "hooks/useI18n";

function Login() {
  const [, dispatch] = useMaterialUIController(); 
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleGuestAccess = () => {
    setLogin(dispatch, DEV_TOKEN, DEV_ROLE, DEV_USER_ID);
    navigate("/dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
  
    try {
      const data = await apiLogin.login(email, password.trim() ? password : ""); 
      const { role, userId } = data;
  
      setLogin(dispatch, "cookie-session", role, userId);
      setPassword("");
  
      navigate("/dashboard");
    } catch (err) {
      setError(err.error || err.message || t("auth.signInError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BasicLayout image={bgImage}>
      <Card>
        <MDBox
          variant="gradient"
          bgColor="info"
          borderRadius="lg"
          coloredShadow="info"
          mx={2}
          mt={-3}
          p={2}
          mb={1}
          textAlign="center"
        >
          <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
            {AUTH_DISABLED ? t("auth.localMode") : t("auth.signIn")}
          </MDTypography>
          <Grid container spacing={3} justifyContent="center" sx={{ mt: 1, mb: 2 }}></Grid>
        </MDBox>
        <MDBox pt={4} pb={3} px={3}>
          <MDBox component="form" role="form" onSubmit={handleSubmit}>
            {AUTH_DISABLED && (
              <MDTypography variant="button" color="text" fontWeight="regular">
                {t("auth.guestDescription")}
              </MDTypography>
            )}
            {error && (
              <MDTypography variant="button" color="error" fontWeight="regular">
                {error}
              </MDTypography>
            )}
            {!AUTH_DISABLED && (
              <>
                <MDBox mb={2}>
                  <MDInput
                    type="email"
                    label={t("auth.email")}
                    fullWidth
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </MDBox>
                <MDBox mb={2}>
                  <MDInput
                    type="password"
                    label={t("auth.password")}
                    fullWidth
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </MDBox>
              </>
            )}
            <MDBox mt={4} mb={1}>
              <MDButton
                variant="gradient"
                color="info"
                fullWidth
                disabled={submitting}
                type={AUTH_DISABLED ? "button" : "submit"}
                onClick={AUTH_DISABLED ? handleGuestAccess : undefined}
              >
                {AUTH_DISABLED ? t("auth.continueWithoutSignIn") : (submitting ? `${t("auth.signIn")}...` : t("auth.signIn"))}
              </MDButton>
            </MDBox>
            {!AUTH_DISABLED && (
              <MDBox mt={3} textAlign="center">
                <MDTypography variant="button" color="text">
                  {t("auth.noAccount")}{" "}
                  <MDTypography
                    component={Link}
                    to="/authentication/sign-up"
                    variant="button"
                    color="info"
                    fontWeight="medium"
                    textGradient
                  >
                    {t("auth.createAccount")}
                  </MDTypography>
                </MDTypography>
              </MDBox>
            )}
          </MDBox>
        </MDBox>
      </Card>
    </BasicLayout>
  );
}

export default Login;
