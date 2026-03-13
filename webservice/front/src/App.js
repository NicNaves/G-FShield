import { useState, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import Sidenav from "examples/Sidenav";
import Configurator from "examples/Configurator";
import theme from "assets/theme";
import themeDark from "assets/theme-dark";
import rtlPlugin from "stylis-plugin-rtl";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import routes from "routes"; 
import { useMaterialUIController, setMiniSidenav, setOpenConfigurator, setLogin } from "context";
import logo from "assets/images/logo.png";
import Login from "./layouts/authentication/sign-in";
import SignUp from "./layouts/authentication/sign-up";
import PropTypes from "prop-types"; 
import { AUTH_DISABLED, DEV_ROLE, DEV_TOKEN, DEV_USER_ID } from "./config/runtime";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";


const PrivateRoute = ({ element, roles }) => {
  const [controller] = useMaterialUIController();
  const { auth } = controller;

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
};

PrivateRoute.defaultProps = {
  roles: [],
};

export default function App() {
  const [controller, dispatch] = useMaterialUIController();
  const {
    miniSidenav,
    direction,
    layout,
    openConfigurator,
    sidenavColor,
    transparentSidenav,
    whiteSidenav,
    darkMode,
    auth
  } = controller;
  const [onMouseEnter, setOnMouseEnter] = useState(false);
  const [rtlCache, setRtlCache] = useState(null);
  const { pathname } = useLocation();

  // Verifica e carrega o token do localStorage na inicialização
  useEffect(() => {
    if (!AUTH_DISABLED && localStorage.getItem("token") === DEV_TOKEN) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
    }

    const token = localStorage.getItem("token") || (AUTH_DISABLED ? DEV_TOKEN : null);
    const role = localStorage.getItem("role") || (AUTH_DISABLED ? DEV_ROLE : null);
    const userId = localStorage.getItem("userId") || (AUTH_DISABLED ? DEV_USER_ID : null);

    if (token && !auth.token) {
      setLogin(dispatch, token, role, userId);
    }
  }, [dispatch, auth.token]);

  // Reage a mudanças no estado de autenticação
  useEffect(() => {
    if ((AUTH_DISABLED || auth.token) && pathname === "/authentication/sign-in") {
      window.location.href = "/dashboard";
    }
  }, [auth.token, pathname]);

  useMemo(() => {
    const cacheRtl = createCache({
      key: "rtl",
      stylisPlugins: [rtlPlugin],
    });
    setRtlCache(cacheRtl);
  }, []);

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
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
  }, [pathname]);

  
  const visibleRoutes = useMemo(
    () =>
      routes.filter((route) => !route.roles?.length || route.roles.includes(auth.role) || AUTH_DISABLED),
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
            element={<PrivateRoute element={route.component} roles={route.roles} />}
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
      bgColor="white"
      shadow="sm"
      borderRadius="50%"
      position="fixed"
      right="2rem"
      bottom="2rem"
      zIndex={99}
      color="dark"
      sx={{ cursor: "pointer" }}
      onClick={handleConfiguratorOpen}
    >
      <Icon fontSize="small" color="inherit">
        settings
      </Icon>
    </MDBox>
  );

  return (
    
      <ThemeProvider theme={darkMode ? themeDark : theme}>
        <ToastContainer />
        <CssBaseline />
        {layout === "dashboard" && (
          <>
            <Sidenav
              color={sidenavColor}
              brand={logo}
              brandName=""
              routes={visibleRoutes}
              // onMouseEnter={handleOnMouseEnter}
              // onMouseLeave={handleOnMouseLeave}
              sx={{ position: "fixed", left: 0 }}
            />
            <Configurator />
            {configsButton}
          </>
        )}
        <Routes>
          <Route path="/authentication/sign-in" element={<Login />} />
          <Route path="/authentication/sign-up" element={<SignUp />} />
          {getRoutes(routes)}
          <Route path="*" element={<Navigate to={AUTH_DISABLED ? "/dashboard" : "/authentication/sign-in"} />} />
        </Routes>
      </ThemeProvider>
   
  );
}
