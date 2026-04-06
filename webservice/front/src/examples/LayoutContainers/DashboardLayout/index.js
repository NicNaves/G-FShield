/**
=========================================================
* Material Dashboard 2 React - v2.2.0
=========================================================

* Product Page: https://www.creative-tim.com/product/material-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)

Coded by www.creative-tim.com

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect } from "react";

// react-router-dom components
import { useLocation } from "react-router-dom";

// prop-types is a library for typechecking of props.
import PropTypes from "prop-types";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";

// Material Dashboard 2 React context
import { useMaterialUIController, setLayout } from "context";

function DashboardLayout({ children }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav, darkMode } = controller;
  const { pathname } = useLocation();

  useEffect(() => {
    setLayout(dispatch, "dashboard");
  }, [pathname]);

  return (
    <MDBox
      sx={({ breakpoints, transitions, functions: { pxToRem } }) => {
        const desktopSidebarWidth = miniSidenav ? pxToRem(120) : pxToRem(274);

        return ({
        p: { xs: 1.5, sm: 2, md: 3 },
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        background: darkMode
          ? "radial-gradient(circle at top right, rgba(78, 161, 255, 0.08), transparent 26%), transparent"
          : "radial-gradient(circle at top right, rgba(61, 142, 245, 0.08), transparent 24%), transparent",

        [breakpoints.up("lg")]: {
          marginLeft: desktopSidebarWidth,
          width: `calc(100% - ${desktopSidebarWidth})`,
          maxWidth: `calc(100% - ${desktopSidebarWidth})`,
          minWidth: 0,
          transition: transitions.create(["margin-left", "margin-right"], {
            easing: transitions.easing.easeInOut,
            duration: transitions.duration.standard,
          }),
        },
      });
      }}
    >
      {children}
    </MDBox>
  );
}

// Typechecking props for the DashboardLayout
DashboardLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default DashboardLayout;
