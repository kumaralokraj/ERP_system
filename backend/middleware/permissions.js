import { PERMISSIONS } from "../constants/permissions.js";

const hasAllPermissions = (grantedPermissions = [], requiredPermissions = []) =>
  requiredPermissions.every((permission) => grantedPermissions.includes(permission));

const hasAnyPermission = (grantedPermissions = [], requiredPermissions = []) =>
  requiredPermissions.some((permission) => grantedPermissions.includes(permission));

const normalizeRole = (role = "") => String(role).trim().toLowerCase();

export const authorizeRoles = (...allowedRoles) => {
  const allowedRoleSet = new Set(allowedRoles.map((role) => normalizeRole(role)));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const requestRole = normalizeRole(req.user.role);

    if (!allowedRoleSet.has(requestRole)) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this resource" });
    }

    req.user.role = requestRole;
    return next();
  };
};

export const authorizePermissions = (...requiredPermissions) => {
  const uniqueRequiredPermissions = [...new Set(requiredPermissions)].filter((permission) =>
    PERMISSIONS.includes(permission)
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const requestRole = normalizeRole(req.user.role);

    if (requestRole === "admin") {
      return next();
    }

    if (!hasAllPermissions(req.user.permissions, uniqueRequiredPermissions)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
        requiredPermissions: uniqueRequiredPermissions,
      });
    }

    return next();
  };
};

export const authorizeAnyPermission = (...requiredPermissions) => {
  const uniqueRequiredPermissions = [...new Set(requiredPermissions)].filter((permission) =>
    PERMISSIONS.includes(permission)
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized access" });
    }

    const requestRole = normalizeRole(req.user.role);

    if (requestRole === "admin") {
      return next();
    }

    if (uniqueRequiredPermissions.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    if (!hasAnyPermission(req.user.permissions, uniqueRequiredPermissions)) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
        anyOfPermissions: uniqueRequiredPermissions,
      });
    }

    return next();
  };
};
