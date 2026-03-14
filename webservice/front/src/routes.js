import Icon from "@mui/material/Icon";

import Dashboard from "./layouts/dashboard";
import RunDetails from "./layouts/dashboard/run-details";
import Settings from "./layouts/settings";
import Datasets from "./layouts/datasets";
import Users from "./layouts/users";
import UserEdit from "./layouts/users/edit";

const routes = [
  {
    type: "collapse",
    name: "Dashboard",
    nameKey: "routes.dashboard",
    key: "dashboard",
    icon: <Icon fontSize="small">analytics</Icon>,
    route: "/dashboard",
    component: <Dashboard />,
    roles: ["ADMIN", "VIEWER"],
  },
  {
    type: "collapse",
    name: "Settings",
    nameKey: "routes.settings",
    key: "settings",
    icon: <Icon fontSize="small">tune</Icon>,
    route: "/settings",
    component: <Settings />,
    roles: ["ADMIN"],
  },
  {
    type: "collapse",
    name: "Datasets",
    nameKey: "routes.datasets",
    key: "datasets",
    icon: <Icon fontSize="small">storage</Icon>,
    route: "/datasets",
    component: <Datasets />,
    roles: ["ADMIN", "VIEWER"],
  },
  {
    type: "collapse",
    name: "Users",
    nameKey: "routes.users",
    key: "users",
    icon: <Icon fontSize="small">manage_accounts</Icon>,
    route: "/admin/users",
    component: <Users />,
    roles: ["ADMIN"],
  },
  {
    key: "user-edit",
    route: "/admin/users/:id",
    component: <UserEdit />,
    roles: ["ADMIN"],
  },
  {
    key: "run-details",
    route: "/dashboard/runs/:seedId",
    component: <RunDetails />,
    hidden: true,
    roles: ["ADMIN", "VIEWER"],
  },
];

export default routes;
