

import { useEffect } from "react";

// react-router-dom components
import { useLocation, NavLink } from "react-router-dom";

// prop-types is a library for typechecking of props.
import PropTypes from "prop-types";

// @mui material components
import List from "@mui/material/List";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Icon from "@mui/material/Icon";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

// Material Dashboard 2 React example components
import SidenavCollapse from "examples/Sidenav/SidenavCollapse";

// Custom styles for the Sidenav
import SidenavRoot from "examples/Sidenav/SidenavRoot";
import sidenavLogoLabel from "examples/Sidenav/styles/sidenav";

// Material Dashboard 2 React context
import {
  useMaterialUIController,
  setMiniSidenav,
  setTransparentSidenav,
  setWhiteSidenav,
} from "context";
import useI18n from "hooks/useI18n";

function Sidenav({ color, brand, brandName, routes, ...rest }) {
  const [controller, dispatch] = useMaterialUIController();
  const { t } = useI18n();
  const { miniSidenav, transparentSidenav, whiteSidenav, darkMode, sidenavColor } = controller;
  const theme = useTheme();
  const isMobileSidenav = useMediaQuery(theme.breakpoints.down("lg"));
  const location = useLocation();
  const collapseName = location.pathname.replace("/", "");

  let textColor = "white";

  if (transparentSidenav || (whiteSidenav && !darkMode)) {
    textColor = "dark";
  } else if (whiteSidenav && darkMode) {
    textColor = "inherit";
  }

  const closeSidenav = () => setMiniSidenav(dispatch, true);

  useEffect(() => {
    setMiniSidenav(dispatch, isMobileSidenav);
    setTransparentSidenav(dispatch, isMobileSidenav ? false : transparentSidenav);
    setWhiteSidenav(dispatch, isMobileSidenav ? false : whiteSidenav);
  }, [dispatch, isMobileSidenav, transparentSidenav, whiteSidenav]);

  useEffect(() => {
    if (isMobileSidenav) {
      closeSidenav();
    }
  }, [isMobileSidenav, location.pathname]);

  // Render all the routes from the routes.js (All the visible items on the Sidenav)
  const renderRoutes = routes
  .filter((route) => !route.hidden) 
  .map(({ type, name, nameKey, icon, title, noCollapse, key, href, route }) => {
    let returnValue;
    const resolvedName = nameKey ? t(nameKey) : name;

    if (type === "collapse") {
      returnValue = href ? (
        <Link
          href={href}
          key={key}
          target="_blank"
          rel="noreferrer"
          sx={{ textDecoration: "none" }}
          onClick={isMobileSidenav ? closeSidenav : undefined}
        >
          <SidenavCollapse
            name={resolvedName}
            icon={icon}
            active={key === collapseName}
            noCollapse={noCollapse}
          />
        </Link>
      ) : (
        <NavLink key={key} to={route} onClick={isMobileSidenav ? closeSidenav : undefined}>
          <SidenavCollapse name={resolvedName} icon={icon} active={key === collapseName} />
        </NavLink>
      );
    } else if (type === "title") {
      returnValue = (
        <MDTypography
          key={key}
          color={textColor}
          display="block"
          variant="caption"
          fontWeight="bold"
          textTransform="uppercase"
          pl={3}
          mt={2}
          mb={1}
          ml={1}
        >
          {title}
        </MDTypography>
      );
    } else if (type === "divider") {
      returnValue = (
        <Divider
          key={key}
          light={
            (!darkMode && !whiteSidenav && !transparentSidenav) ||
            (darkMode && !transparentSidenav && whiteSidenav)
          }
        />
      );
    }

    return returnValue;
  });


  return (
    <SidenavRoot
      {...rest}
      variant={isMobileSidenav ? "temporary" : "permanent"}
      open={isMobileSidenav ? !miniSidenav : true}
      onClose={closeSidenav}
      ModalProps={{
        keepMounted: true,
      }}
      ownerState={{ transparentSidenav, whiteSidenav, miniSidenav, darkMode, isMobileSidenav }}
    >
      <MDBox pt={3} pb={1} px={4} textAlign="center">
        <MDBox
          display={{ xs: "block", lg: "none" }}
          position="absolute"
          top={0}
          right={0}
          p={1.625}
          onClick={closeSidenav}
          sx={{ cursor: "pointer" }}
        >
          <MDTypography variant="h6" color="secondary">
            <Icon sx={{ fontWeight: "bold" }}>close</Icon>
          </MDTypography>
        </MDBox>
        <MDBox
          component={NavLink}
          to="/dashboard"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          width="100%"
          gap={1}
          sx={{ textDecoration: "none" }}
        >
          {brand && <MDBox component="img" src={brand} alt="Brand" width="5rem" mx="auto" />}
          {brandName ? (
            <MDBox
              width={!brandName && "100%"}
              textAlign="center"
              sx={(theme) => sidenavLogoLabel(theme, { miniSidenav })}
            >
              <MDTypography component="h6" variant="button" fontWeight="medium" color={textColor}>
                {brandName}
              </MDTypography>
            </MDBox>
          ) : null}
        </MDBox>
      </MDBox>
      <Divider
        light={
          (!darkMode && !whiteSidenav && !transparentSidenav) ||
          (darkMode && !transparentSidenav && whiteSidenav)
        }
      />
      <List>{renderRoutes}</List>
      
    </SidenavRoot>
  );
}

// Setting default values for the props of Sidenav
Sidenav.defaultProps = {
  color: "info",
  brand: "",
  brandName: "",
};

// Typechecking props for the Sidenav
Sidenav.propTypes = {
  color: PropTypes.oneOf(["primary", "secondary", "info", "success", "warning", "error", "dark"]),
  brand: PropTypes.string,
  brandName: PropTypes.string,
  routes: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default Sidenav;
