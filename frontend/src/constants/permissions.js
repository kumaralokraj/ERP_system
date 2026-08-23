export const PERMISSIONS = [
  "dashboard.view",
  "fees.view",
  "fees.collect",
  "classes.view",
  "promotions.view",
  "teachers.view",
  "students.view",
  "uniforms.view",
  "books.view",
  "users.view",
  "users.manage",
  "users.create",
  "profile.view",
  "settings.view",
];

export const PERMISSION_GROUPS = [
  {
    module: "Dashboard",
    permissions: [{ key: "dashboard.view", label: "View Dashboard" }],
  },
  {
    module: "Fees",
    permissions: [
      { key: "fees.view", label: "View Fees" },
      { key: "fees.collect", label: "Collect Fees" },
    ],
  },
  {
    module: "Classes",
    permissions: [{ key: "classes.view", label: "View Classes" }],
  },
  {
    module: "Promotions",
    permissions: [{ key: "promotions.view", label: "Manage Promotions" }],
  },
  {
    module: "Teachers",
    permissions: [{ key: "teachers.view", label: "View Teachers" }],
  },
  {
    module: "Students",
    permissions: [{ key: "students.view", label: "View Students" }],
  },
  {
    module: "Uniforms",
    permissions: [{ key: "uniforms.view", label: "View Uniforms" }],
  },
  {
    module: "Books",
    permissions: [{ key: "books.view", label: "View Books" }],
  },
  {
    module: "Users",
    permissions: [
      { key: "users.view", label: "View Users" },
      { key: "users.manage", label: "Manage User Access" },
      { key: "users.create", label: "Create Users" },
    ],
  },
  {
    module: "Profile",
    permissions: [{ key: "profile.view", label: "View Profile" }],
  },
  {
    module: "Settings",
    permissions: [{ key: "settings.view", label: "View Settings" }],
  },
];

export const DEFAULT_ADMIN_ROUTE_BY_PERMISSION = [
  { permission: "dashboard.view", path: "/admin" },
  { permission: "fees.view", path: "/admin/fees" },
  { permission: "classes.view", path: "/admin/classes" },
  { permission: "promotions.view", path: "/admin/promotions" },
  { permission: "teachers.view", path: "/admin/teachers" },
  { permission: "students.view", path: "/admin/students" },
  { permission: "uniforms.view", path: "/admin/uniforms" },
  { permission: "books.view", path: "/admin/books" },
  { permission: "users.view", path: "/admin/users/manage" },
  { permission: "users.manage", path: "/admin/users/manage" },
  { permission: "users.create", path: "/admin/users/create" },
  { permission: "profile.view", path: "/admin/profile" },
  { permission: "settings.view", path: "/admin/settings" },
];

export const MANAGER_STAFF_RESTRICTED_PERMISSIONS = ["users.create", "users.view", "users.manage"];

export const getAssignablePermissionGroups = (groups = PERMISSION_GROUPS) => {
  const restrictedPermissionSet = new Set(MANAGER_STAFF_RESTRICTED_PERMISSIONS);

  return groups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter(
        (permission) => !restrictedPermissionSet.has(permission.key)
      ),
    }))
    .filter((group) => group.permissions.length > 0);
};
