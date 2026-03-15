import { createContext, useContext, useReducer, useMemo } from "react";
import PropTypes from "prop-types";
import { AUTH_DISABLED, DEV_ROLE, DEV_TOKEN, DEV_USER_ID } from "../config/runtime";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../i18n";

const MaterialUI = createContext();
MaterialUI.displayName = "MaterialUIContext";

const getStoredToken = () => {
  const token = localStorage.getItem("token");

  if (!AUTH_DISABLED && token === DEV_TOKEN) {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    return null;
  }

  return token;
};

const getStoredDarkMode = () => {
  const storedValue = localStorage.getItem("darkMode");

  if (storedValue === null) {
    return false;
  }

  return storedValue === "true";
};

const getStoredLocale = () => {
  const storedLocale = localStorage.getItem("locale");
  return SUPPORTED_LOCALES.includes(storedLocale) ? storedLocale : DEFAULT_LOCALE;
};

function reducer(state, action) {
  switch (action.type) {
    case "MINI_SIDENAV":
      return { ...state, miniSidenav: action.value };
    case "TRANSPARENT_SIDENAV":
      return { ...state, transparentSidenav: action.value };
    case "WHITE_SIDENAV":
      return { ...state, whiteSidenav: action.value };
    case "SIDENAV_COLOR":
      return { ...state, sidenavColor: action.value };
    case "TRANSPARENT_NAVBAR":
      return { ...state, transparentNavbar: action.value };
    case "FIXED_NAVBAR":
      return { ...state, fixedNavbar: action.value };
    case "OPEN_CONFIGURATOR":
      return { ...state, openConfigurator: action.value };
    case "DIRECTION":
      return { ...state, direction: action.value };
    case "LAYOUT":
      return { ...state, layout: action.value };
    case "DARKMODE":
      return { ...state, darkMode: action.value };
    case "LOCALE":
      return { ...state, locale: action.value };
    case "LOGIN":
      return { ...state, auth: { token: action.token, role: action.role, userId: action.userId } };
    case "LOGOUT":
      return { ...state, auth: { token: null, role: null, userId: null } };
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
}


function MaterialUIControllerProvider({ children }) {
  const initialState = {
    miniSidenav: false,
    transparentSidenav: false,
    whiteSidenav: false,
    sidenavColor: "info",
    transparentNavbar: true,
    fixedNavbar: true,
    openConfigurator: false,
    direction: "ltr",
    layout: "dashboard",
    darkMode: getStoredDarkMode(),
    locale: getStoredLocale(),
    auth: {
      token: getStoredToken() || (AUTH_DISABLED ? DEV_TOKEN : null),
      role: localStorage.getItem("role") || (AUTH_DISABLED ? DEV_ROLE : null),
      userId: localStorage.getItem("userId") || (AUTH_DISABLED ? DEV_USER_ID : null),
    },
  };

  const [controller, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => [controller, dispatch], [controller, dispatch]);

  return <MaterialUI.Provider value={value}>{children}</MaterialUI.Provider>;
}


function useMaterialUIController() {
  const context = useContext(MaterialUI);
  if (!context) {
    throw new Error(
      "useMaterialUIController should be used inside the MaterialUIControllerProvider."
    );
  }
  return context;
}


const setLogin = (dispatch, token, role, userId) => {
  localStorage.setItem("token", token);
  localStorage.setItem("role", role || DEV_ROLE);
  localStorage.setItem("userId", userId || DEV_USER_ID);
  sessionStorage.removeItem("gfshield-auth-redirecting");
  dispatch({ type: "LOGIN", token, role, userId });
};

const setLogout = (dispatch) => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
  sessionStorage.removeItem("gfshield-auth-redirecting");
  dispatch({ type: "LOGOUT" });
};


const setMiniSidenav = (dispatch, value) => dispatch({ type: "MINI_SIDENAV", value });
const setTransparentSidenav = (dispatch, value) => dispatch({ type: "TRANSPARENT_SIDENAV", value });
const setWhiteSidenav = (dispatch, value) => dispatch({ type: "WHITE_SIDENAV", value });
const setSidenavColor = (dispatch, value) => dispatch({ type: "SIDENAV_COLOR", value });
const setTransparentNavbar = (dispatch, value) => dispatch({ type: "TRANSPARENT_NAVBAR", value });
const setFixedNavbar = (dispatch, value) => dispatch({ type: "FIXED_NAVBAR", value });
const setOpenConfigurator = (dispatch, value) => dispatch({ type: "OPEN_CONFIGURATOR", value });
const setDirection = (dispatch, value) => dispatch({ type: "DIRECTION", value });
const setLayout = (dispatch, value) => dispatch({ type: "LAYOUT", value });
const setDarkMode = (dispatch, value) => {
  localStorage.setItem("darkMode", value ? "true" : "false");
  dispatch({ type: "DARKMODE", value });
};
const setLocale = (dispatch, value) => {
  const nextLocale = SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
  localStorage.setItem("locale", nextLocale);
  dispatch({ type: "LOCALE", value: nextLocale });
};

MaterialUIControllerProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export {
  MaterialUIControllerProvider,
  useMaterialUIController,
  setMiniSidenav,
  setTransparentSidenav,
  setWhiteSidenav,
  setSidenavColor,
  setTransparentNavbar,
  setFixedNavbar,
  setOpenConfigurator,
  setDirection,
  setLayout,
  setDarkMode,
  setLocale,
  setLogin,
  setLogout, 
};
