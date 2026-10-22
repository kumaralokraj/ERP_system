export const PERMISSIONS = Object.freeze([
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
]);

export const ROLES = Object.freeze(["admin", "manager", "staff"]);

export const PERMISSION_GROUPS = Object.freeze([
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
]);

export const sanitizePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) return [];
  return [...new Set(permissions)].filter((permission) => PERMISSIONS.includes(permission));
};
