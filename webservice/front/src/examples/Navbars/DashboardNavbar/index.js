import { useState, useEffect } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Icon from "@mui/material/Icon";
import Badge from "@mui/material/Badge";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import Breadcrumbs from "examples/Breadcrumbs";
import NotificationItem from "examples/Items/NotificationItem";
import { navbar, navbarContainer, navbarRow, navbarIconButton, navbarMobileMenu } from "examples/Navbars/DashboardNavbar/styles";
import { useMaterialUIController, setTransparentNavbar, setMiniSidenav, setLogout } from "../../../context";
import { AUTH_DISABLED, DEV_ROLE, DEV_TOKEN, DEV_USER_ID } from "../../../config/runtime";
import {
  GRASP_NOTIFICATION_EVENT_NAME,
  clearGraspNotifications,
  readGraspNotifications,
} from "../../../utils/graspNotifications";
import useI18n from "hooks/useI18n";
import { formatCompactPercent, formatRelativeTime, shortenSeed } from "utils/graspFormatters";

function DashboardNavbar({ absolute, light, isMini }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav, transparentNavbar, fixedNavbar, darkMode } = controller;
  const [openMenu, setOpenMenu] = useState(null); 
  const [notificationsAnchor, setNotificationsAnchor] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const route = useLocation().pathname.split("/").slice(1);
  const navigate = useNavigate();
  const { t } = useI18n();

  const navbarType = fixedNavbar ? "sticky" : "static";

  useEffect(() => {
    function handleTransparentNavbar() {
      setTransparentNavbar(dispatch, (fixedNavbar && window.scrollY === 0) || !fixedNavbar);
    }

    window.addEventListener("scroll", handleTransparentNavbar);
    handleTransparentNavbar();

    return () => window.removeEventListener("scroll", handleTransparentNavbar);
  }, [dispatch, fixedNavbar]);

  const handleMiniSidenav = () => setMiniSidenav(dispatch, !miniSidenav);
  const handleOpenMenu = (event) => setOpenMenu(event.currentTarget);
  const handleCloseMenu = () => setOpenMenu(null);
  const handleOpenNotifications = (event) => setNotificationsAnchor(event.currentTarget);
  const handleCloseNotifications = () => setNotificationsAnchor(null);
  const handleClearNotifications = () => {
    clearGraspNotifications();
    handleCloseNotifications();
  };

  useEffect(() => {
    const syncNotifications = () => {
      setNotifications(readGraspNotifications());
    };

    syncNotifications();
    window.addEventListener(GRASP_NOTIFICATION_EVENT_NAME, syncNotifications);
    window.addEventListener("storage", syncNotifications);

    return () => {
      window.removeEventListener(GRASP_NOTIFICATION_EVENT_NAME, syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, []);

  // Função de logout
  const handleLogout = () => {
    setLogout(dispatch);
    if (AUTH_DISABLED) {
      localStorage.setItem("token", DEV_TOKEN);
      localStorage.setItem("role", DEV_ROLE);
      localStorage.setItem("userId", DEV_USER_ID);
      navigate("/dashboard");
      return;
    }

    navigate("/authentication/sign-in");
  };

  
  const renderProfileMenu = () => (
    <Menu
      anchorEl={openMenu}
      open={Boolean(openMenu)}
      onClose={handleCloseMenu}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      sx={{ mt: 2 }}
    >
      <MenuItem onClick={handleLogout}>
        <Icon fontSize="small" sx={{ mr: 1 }}>logout</Icon> {t("navbar.signOut")}
      </MenuItem>
    </Menu>
  );

  const renderNotificationsMenu = () => (
    <Menu
      anchorEl={notificationsAnchor}
      open={Boolean(notificationsAnchor)}
      onClose={handleCloseNotifications}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "right",
      }}
      transformOrigin={{
        vertical: "top",
        horizontal: "right",
      }}
      PaperProps={{
        sx: {
          mt: 2,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: 440,
          borderRadius: 2.5,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
      }}
      MenuListProps={{
        disablePadding: true,
        sx: {
          display: "flex",
          flexDirection: "column",
          maxHeight: 440,
          p: 0,
        },
      }}
    >
      <MDBox
        px={2}
        py={1.5}
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
        gap={1}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          background: darkMode ? "rgba(52, 61, 86, 0.98)" : "rgba(255,255,255,0.98)",
          backdropFilter: "blur(8px)",
        }}
      >
        <MDBox>
          <MDTypography variant="button" fontWeight="medium">
            {t("navbar.recentImprovements")}
          </MDTypography>
          <MDTypography variant="caption" display="block" mt={0.25}>
            {t("navbar.notificationsHint")}
          </MDTypography>
        </MDBox>
        {notifications.length > 0 ? (
          <MDButton variant="text" color="info" size="small" onClick={handleClearNotifications}>
            {t("common.clearAll")}
          </MDButton>
        ) : null}
      </MDBox>
      <Divider />
      <MDBox
        sx={{
          overflowY: "auto",
          overflowX: "hidden",
          maxHeight: 360,
          px: 1,
          py: 1,
        }}
      >
        {notifications.length === 0 ? (
          <MenuItem onClick={handleCloseNotifications}>
            <Icon fontSize="small" sx={{ mr: 1 }}>notifications_none</Icon>
            {t("navbar.noRecentImprovements")}
          </MenuItem>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id || `${notification.seedId}-${notification.timestamp}`}
              icon={<Icon fontSize="small">auto_graph</Icon>}
              title={`${notification.algorithm || "--"} · ${formatCompactPercent(notification.score)}`}
              subtitle={`${notification.search || notification.topic || "--"} · ${shortenSeed(notification.seedId)}`}
              meta={formatRelativeTime(notification.timestamp)}
              onClick={() => {
                handleCloseNotifications();
                if (notification.seedId) {
                  navigate(`/dashboard/runs/${notification.seedId}`);
                }
              }}
            />
          ))
        )}
      </MDBox>
    </Menu>
  );

  const iconsStyle = ({ palette: { dark, white, text }, functions: { rgba } }) => ({
    color: () => {
      let colorValue = light || darkMode ? white.main : dark.main;
      if (transparentNavbar && !light) {
        colorValue = darkMode ? rgba(text.main, 0.6) : text.main;
      }
      return colorValue;
    },
  });

  return (
    <AppBar
      position={absolute ? "absolute" : navbarType}
      color="inherit"
      sx={(theme) => navbar(theme, { transparentNavbar, absolute, light, darkMode })}
    >
      <Toolbar sx={(theme) => navbarContainer(theme)}>
        <MDBox color="inherit" mb={{ xs: 1, md: 0 }} sx={(theme) => navbarRow(theme, { isMini })}>
          <Breadcrumbs icon="home" title={route[route.length - 1]} route={route} light={light} />
        </MDBox>
        {isMini ? null : (
          <MDBox sx={(theme) => navbarRow(theme, { isMini })}>
            {/* <MDBox pr={1}>
              <MDInput label="Search here" />
            </MDBox> */}
            <MDBox color={light ? "white" : "inherit"}>
              <IconButton sx={navbarIconButton} size="small" disableRipple onClick={handleOpenMenu}>
                <Icon sx={iconsStyle}>account_circle</Icon>
              </IconButton>
              {renderProfileMenu()}
              <IconButton
                size="small"
                disableRipple
                color="inherit"
                sx={navbarMobileMenu}
                onClick={handleMiniSidenav}
              >
                <Icon sx={iconsStyle} fontSize="medium">
                  {miniSidenav ? "menu_open" : "menu"}
                </Icon>
              </IconButton>
              {/* <IconButton
                size="small"
                disableRipple
                color="inherit"
                sx={navbarIconButton}
                onClick={handleConfiguratorOpen}
              >
                <Icon sx={iconsStyle}>settings</Icon>
              </IconButton> */}
              <IconButton
                size="small"
                disableRipple
                color="inherit"
                sx={navbarIconButton}
                aria-controls="notification-menu"
                aria-haspopup="true"
                variant="contained"
                onClick={handleOpenNotifications}
              >
                <Badge badgeContent={notifications.length} color="error" max={9}>
                  <Icon sx={iconsStyle}>notifications</Icon>
                </Badge>
              </IconButton>
              {renderNotificationsMenu()}
            </MDBox>
          </MDBox>
        )}
      </Toolbar>
    </AppBar>
  );
}

DashboardNavbar.defaultProps = {
  absolute: false,
  light: false,
  isMini: false,
};

DashboardNavbar.propTypes = {
  absolute: PropTypes.bool,
  light: PropTypes.bool,
  isMini: PropTypes.bool,
};

export default DashboardNavbar;
