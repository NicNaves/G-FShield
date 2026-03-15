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

import { forwardRef } from "react";

// prop-types is a library for typechecking of props.
import PropTypes from "prop-types";

// @mui material components
import MenuItem from "@mui/material/MenuItem";
import Link from "@mui/material/Link";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

// custom styles for the NotificationItem
import menuItem from "examples/Items/NotificationItem/styles";

const NotificationItem = forwardRef(({ icon, title, subtitle, meta, ...rest }, ref) => (
  <MenuItem {...rest} ref={ref} sx={(theme) => menuItem(theme)}>
    <MDBox component={Link} py={0.5} display="flex" alignItems="flex-start" width="100%">
      <MDTypography variant="body1" color="secondary" lineHeight={0.75} mt={0.25}>
        {icon}
      </MDTypography>
      <MDBox ml={1.25} flex={1} minWidth={0}>
        <MDBox display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
          <MDTypography variant="button" fontWeight="regular">
            {title}
          </MDTypography>
          {meta ? (
            <MDTypography variant="caption" color="text" sx={{ whiteSpace: "nowrap" }}>
              {meta}
            </MDTypography>
          ) : null}
        </MDBox>
        {subtitle ? (
          <MDTypography variant="caption" color="text" display="block" mt={0.35}>
            {subtitle}
          </MDTypography>
        ) : null}
      </MDBox>
    </MDBox>
  </MenuItem>
));

// Typechecking props for the NotificationItem
NotificationItem.propTypes = {
  icon: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  meta: PropTypes.string,
};

NotificationItem.defaultProps = {
  subtitle: "",
  meta: "",
};

export default NotificationItem;
