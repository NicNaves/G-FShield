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
import borders from "assets/theme-dark/base/borders";
import typography from "assets/theme-dark/base/typography";

// Material Dashboard 2 React helper functions
import pxToRem from "assets/theme-dark/functions/pxToRem";
import rgba from "assets/theme-dark/functions/rgba";

const { background, inputBorderColor, info, text, transparent, white } = colors;
const { borderRadius } = borders;
const { size } = typography;

const inputOutlined = {
  styleOverrides: {
    root: {
      backgroundColor: rgba(background.default, 0.22),
      fontSize: size.sm,
      borderRadius: borderRadius.md,
      transition: "border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease",

      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: rgba(white.main, 0.22),
      },

      "&.Mui-focused": {
        backgroundColor: rgba(background.default, 0.34),
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: info.main,
          boxShadow: `0 0 0 3px ${rgba(info.main, 0.18)}`,
        },
      },
    },

    notchedOutline: {
      borderColor: rgba(inputBorderColor, 0.72),
    },

    input: {
      color: text.focus,
      padding: pxToRem(12),
      backgroundColor: transparent.main,

      "&::-webkit-input-placeholder": {
        color: rgba(white.main, 0.44),
      },
    },

    inputSizeSmall: {
      fontSize: size.xs,
      padding: pxToRem(10),
    },

    multiline: {
      color: text.main,
      padding: 0,
    },
  },
};

export default inputOutlined;
