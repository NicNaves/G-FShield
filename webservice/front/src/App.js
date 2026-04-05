import { useState, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useLocation, matchPath } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import Sidenav from "examples/Sidenav";
import Configurator from "examples/Configurator";
import theme from "assets/theme";
import themeDark from "assets/theme-dark";
import routes from "routes";
import { useMaterialUIController, setMiniSidenav, setOpenConfigurator, setLogin } from "context";
import logoShield from "assets/images/logoshield.png";
import Login from "./layouts/authentication/sign-in";
import SignUp from "./layouts/authentication/sign-up";
import PropTypes from "prop-types";
import { ALLOW_PUBLIC_REGISTRATION, AUTH_DISABLED, DEV_ROLE, DEV_TOKEN, DEV_USER_ID } from "./config/runtime";
import useI18n from "hooks/useI18n";
import authApi from "./api/auth";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const PrivateRoute = ({ element, roles, authReady }) => {
  const [controller] = useMaterialUIController();
  const { auth } = controller;

  if (!AUTH_DISABLED && !authReady) {
    return null;
  }

  if (!(AUTH_DISABLED || auth.token)) {
    return <Navigate to="/authentication/sign-in" replace />;
  }

  if (roles?.length && !roles.includes(auth.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return element;
};

PrivateRoute.propTypes = {
  element: PropTypes.node.isRequired,
  roles: PropTypes.arrayOf(PropTypes.string),
  authReady: PropTypes.bool,
};

PrivateRoute.defaultProps = {
  roles: [],
  authReady: false,
};

export default function App() {
  const [controller, dispatch] = useMaterialUIController();
  const {
    miniSidenav,
    direction,
    layout,
    openConfigurator,
    sidenavColor,
    darkMode,
    auth,
  } = controller;
  const [onMouseEnter, setOnMouseEnter] = useState(false);
  const [authReady, setAuthReady] = useState(AUTH_DISABLED);
  const { pathname } = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    if (AUTH_DISABLED) {
      if (!auth.token) {
        setLogin(dispatch, DEV_TOKEN, DEV_ROLE, DEV_USER_ID);
      }
      setAuthReady(true);
      return undefined;
    }

    let active = true;

    authApi.me({ skipAuthRedirect: true })
      .then((user) => {
        if (!active || !user?.id) {
          return;
        }

        setLogin(dispatch, "cookie-session", user.role, user.id);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        sessionStorage.removeItem("token");
        sessionStorage.removeItem("role");
        sessionStorage.removeItem("userId");
      })
      .finally(() => {
        if (active) {
          setAuthReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [auth.token, dispatch]);

  const handleOnMouseEnter = () => {
    if (miniSidenav && !onMouseEnter) {
      setMiniSidenav(dispatch, false);
      setOnMouseEnter(true);
    }
  };

  const handleOnMouseLeave = () => {
    if (onMouseEnter) {
      setMiniSidenav(dispatch, true);
      setOnMouseEnter(false);
    }
  };

  const handleConfiguratorOpen = () => setOpenConfigurator(dispatch, !openConfigurator);

  useEffect(() => {
    document.body.setAttribute("dir", direction);
  }, [direction]);

  useEffect(() => {
    const nextTheme = darkMode ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.body.setAttribute("data-theme", nextTheme);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
  }, [pathname]);

  useEffect(() => {
    const authTitles = {
      "/authentication/sign-in": t("auth.signIn"),
      "/authentication/sign-up": t("auth.createAccount"),
    };

    const matchedRoute = routes.find((route) => route.route && matchPath({ path: route.route, end: true }, pathname));
    const routeTitle = matchedRoute?.nameKey
      ? t(matchedRoute.nameKey)
      : matchedRoute?.key === "run-details"
        ? t("routes.runDetails")
        : authTitles[pathname];

    document.title = routeTitle ? `G-FShield - ${routeTitle}` : "G-FShield";
  }, [pathname, t]);

  const visibleRoutes = useMemo(
    () => routes.filter((route) => !route.roles?.length || route.roles.includes(auth.role) || AUTH_DISABLED),
    [auth.role]
  );

  const getRoutes = (allRoutes) =>
    allRoutes.map((route) => {
      if (route.collapse) {
        return getRoutes(route.collapse);
      }

      if (route.route) {
        return (
          <Route
            key={route.key}
            path={route.route}
            element={<PrivateRoute element={route.component} roles={route.roles} authReady={authReady} />}
          />
        );
      }

      return null;
    });

  const configsButton = (
    <MDBox
      display="flex"
      justifyContent="center"
      alignItems="center"
      width="3.25rem"
      height="3.25rem"
      shadow="sm"
      borderRadius="50%"
      position="fixed"
      right="2rem"
      bottom="2rem"
      zIndex={99}
      color={darkMode ? "white" : "dark"}
      sx={{
        cursor: "pointer",
        background: darkMode
          ? "linear-gradient(180deg, rgba(32,41,64,0.98) 0%, rgba(26,32,53,0.98) 100%)"
          : "#ffffff",
        border: darkMode ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(15,23,42,0.08)",
        boxShadow: darkMode ? "0 18px 28px rgba(2,6,23,0.34)" : undefined,
      }}
      onClick={handleConfiguratorOpen}
    >
      <Icon fontSize="small" color="inherit">
        settings
      </Icon>
    </MDBox>
  );

  const canResolveAuth = AUTH_DISABLED || authReady;

  return (
    <ThemeProvider theme={darkMode ? themeDark : theme}>
      <ToastContainer theme={darkMode ? "dark" : "light"} />
      <CssBaseline />
      {layout === "dashboard" && (
        <>
          <Sidenav
            color={sidenavColor}
            brand={logoShield}
            brandName=""
            routes={visibleRoutes}
            onMouseEnter={handleOnMouseEnter}
            onMouseLeave={handleOnMouseLeave}
            sx={{ position: "fixed", left: 0 }}
          />
          <Configurator />
          {configsButton}
        </>
      )}
      <Routes>
        <Route
          path="/"
          element={canResolveAuth ? <Navigate to={AUTH_DISABLED || auth.token ? "/dashboard" : "/authentication/sign-in"} replace /> : null}
        />
        <Route
          path="/authentication/sign-in"
          element={canResolveAuth ? (AUTH_DISABLED || auth.token ? <Navigate to="/dashboard" replace /> : <Login />) : null}
        />
        <Route
          path="/authentication/sign-up"
          element={ALLOW_PUBLIC_REGISTRATION ? <SignUp /> : <Navigate to="/authentication/sign-in" replace />}
        />
        {canResolveAuth ? getRoutes(routes) : null}
        <Route path="*" element={<Navigate to={AUTH_DISABLED || auth.token ? "/dashboard" : "/authentication/sign-in"} replace />} />
      </Routes>
    </ThemeProvider>
  );
}
