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
import colors from "assets/theme/base/colors";

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
    color: text.focus,
    textRendering: "optimizeLegibility",
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
    backgroundColor: background.default,
    backgroundImage:
      "radial-gradient(circle at top left, rgba(61, 142, 245, 0.12), transparent 32%), linear-gradient(180deg, #f7fbff 0%, #edf3f8 52%, #e7eef7 100%)",
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
    color: `${dark.main} !important`,
    transition: "color 150ms ease-in !important",
  },
  "a.link:hover, .link:hover, a.link:focus, .link:focus": {
    color: `${info.main} !important`,
  },
  "::selection": {
    backgroundColor: "rgba(61, 142, 245, 0.18)",
    color: dark.main,
  },
  "*::-webkit-scrollbar": {
    width: "10px",
    height: "10px",
  },
  "*::-webkit-scrollbar-track": {
    background: "rgba(148, 163, 184, 0.14)",
  },
  "*::-webkit-scrollbar-thumb": {
    background: "rgba(31, 43, 66, 0.26)",
    borderRadius: "999px",
    border: `2px solid ${white.main}`,
  },
  "*::-webkit-scrollbar-thumb:hover": {
    background: "rgba(61, 142, 245, 0.45)",
  },
};

export default globals;
