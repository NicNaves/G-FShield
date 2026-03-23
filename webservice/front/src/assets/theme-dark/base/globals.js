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

// Material Dashboard 2 React Base Styles
import colors from "assets/theme-dark/base/colors";

const { info, dark, background, text, white } = colors;
const fontFamily = '"Manrope", "Segoe UI", "Helvetica Neue", sans-serif';

const globals = {
  html: {
    scrollBehavior: "smooth",
    minHeight: "100%",
    backgroundColor: background.default,
  },
  body: {
    minHeight: "100%",
    fontFamily,
    color: text.main,
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    backgroundColor: background.default,
    backgroundImage:
      "radial-gradient(circle at top left, rgba(78, 161, 255, 0.15), transparent 28%), radial-gradient(circle at bottom right, rgba(34, 197, 94, 0.08), transparent 26%), linear-gradient(180deg, #0b1220 0%, #0f172a 48%, #111c30 100%)",
    backgroundAttachment: "fixed",
  },
  "#app": {
    minHeight: "100vh",
  },
  "*, *::before, *::after": {
    margin: 0,
    padding: 0,
    boxSizing: "border-box",
  },
  "a, a:link, a:visited": {
    textDecoration: "none !important",
  },
  "a.link, .link, a.link:link, .link:link, a.link:visited, .link:visited": {
    color: `${white.main} !important`,
    transition: "color 150ms ease-in !important",
  },
  "a.link:hover, .link:hover, a.link:focus, .link:focus": {
    color: `${info.main} !important`,
  },
  "::selection": {
    backgroundColor: "rgba(78, 161, 255, 0.26)",
    color: white.main,
  },
  "*::-webkit-scrollbar": {
    width: "10px",
    height: "10px",
  },
  "*::-webkit-scrollbar-track": {
    background: "rgba(15, 23, 42, 0.72)",
  },
  "*::-webkit-scrollbar-thumb": {
    background: "rgba(143, 160, 191, 0.28)",
    borderRadius: "999px",
    border: `2px solid ${background.default}`,
  },
  "*::-webkit-scrollbar-thumb:hover": {
    background: "rgba(78, 161, 255, 0.48)",
  },
};

export default globals;
