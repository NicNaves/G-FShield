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

// @mui material components
import Drawer from "@mui/material/Drawer";
import { styled } from "@mui/material/styles";

export default styled(Drawer)(({ theme, ownerState }) => {
  const { boxShadows, functions, transitions } = theme;
  const { openConfigurator } = ownerState;

  const configuratorWidth = "min(400px, calc(100vw - 0.75rem))";
  const { lg } = boxShadows;
  const { pxToRem } = functions;

  // drawer styles when openConfigurator={true}
  const drawerOpenStyles = () => ({
    transform: "translateX(0)",
    transition: transitions.create("transform", {
      easing: transitions.easing.sharp,
      duration: transitions.duration.short,
    }),
  });

  // drawer styles when openConfigurator={false}
  const drawerCloseStyles = () => ({
    transform: "translateX(100%)",
    transition: transitions.create("transform", {
      easing: transitions.easing.sharp,
      duration: transitions.duration.short,
    }),
  });

  return {
    "& .MuiDrawer-paper": {
      width: configuratorWidth,
      maxWidth: "100vw",
      height: "100vh",
      margin: 0,
      padding: `0 ${pxToRem(16)}`,
      borderRadius: 0,
      boxShadow: lg,
      overflowY: "auto",
      overflowX: "hidden",
      boxSizing: "border-box",
      left: "auto",
      right: 0,
      ...(openConfigurator ? drawerOpenStyles() : drawerCloseStyles()),
    },
  };
});
