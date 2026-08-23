import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import User from "../models/User.js";
import {
  getFriendlyMongooseError,
  isValidEmail,
  isValidObjectId,
  normalizeEmail,
  sendValidationError,
  trimString,
} from "../utils/requestValidation.js";
import { PERMISSIONS, PERMISSION_GROUPS, sanitizePermissions } from "../constants/permissions.js";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";
const ROLES = new Set(["admin", "manager", "staff"]);
const MANAGED_USER_ROLES = ["manager", "staff"];
const NON_ASSIGNABLE_USER_PERMISSIONS = new Set(["users.create", "users.view", "users.manage"]);
const DEFAULT_USER_PAGE_SIZE = 10;
const MAX_USER_PAGE_SIZE = 50;

const normalizeRoleValue = (role = "") => trimString(role).toLowerCase();
const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parsePageNumber = (value) => {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 1;
  }
  return parsedValue;
};
const parsePageSize = (value) => {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_USER_PAGE_SIZE;
  }
  return Math.min(parsedValue, MAX_USER_PAGE_SIZE);
};

const buildUserResponse = (user) => {
  const normalizedRole = normalizeRoleValue(user.role);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: normalizedRole,
    permissions: normalizedRole === "admin" ? [...PERMISSIONS] : user.permissions || [],
    isActive: user.isActive !== false,
  };
};

const buildManagedUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: normalizeRoleValue(user.role),
  permissions: Array.isArray(user.permissions) ? user.permissions : [],
  isActive: user.isActive !== false,
  lastLogin: user.lastLogin || null,
  createdAt: user.createdAt || null,
  updatedAt: user.updatedAt || null,
});

const buildAssignablePermissionCatalog = () => {
  const assignablePermissions = PERMISSIONS.filter(
    (permission) => !NON_ASSIGNABLE_USER_PERMISSIONS.has(permission)
  );

  const assignableGroups = PERMISSION_GROUPS
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((permission) =>
        assignablePermissions.includes(permission.key)
      ),
    }))
    .filter((group) => group.permissions.length > 0);

  return {
    assignablePermissions,
    assignableGroups,
  };
};

const formatValidationErrors = (req) => {
  const result = validationResult(req);
  if (result.isEmpty()) return null;

  const errors = {};
  result.array().forEach((item) => {
    if (!errors[item.path]) {
      errors[item.path] = item.msg;
    }
  });

  return errors;
};

const updateLoginHistory = async (userId, device = "", ip = "") => {
  await User.updateOne(
    { _id: userId },
    { $set: { "loginHistory.$[entry].status": "Logged out" } },
    { arrayFilters: [{ "entry.status": "Active" }] }
  );

  await User.findByIdAndUpdate(userId, {
    $set: { lastLogin: new Date() },
    $push: {
      loginHistory: {
        $each: [{ date: new Date(), device, ip, status: "Active" }],
        $slice: -20,
      },
    },
  });
};

export const ensureDefaultAdminUser = async () => {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  if (!adminEmail || !adminPassword || !isValidEmail(adminEmail)) {
    return null;
  }

  let adminUser = await User.findOne({ email: adminEmail }).select("+password");

  if (!adminUser) {
    adminUser = await User.create({
      name: "System Admin",
      email: adminEmail,
      password: adminPassword,
      role: "admin",
      permissions: [...PERMISSIONS],
      position: "Principal",
      department: "School Administration",
    });
    return adminUser;
  }

  if (normalizeRoleValue(adminUser.role) !== "admin") {
    adminUser.role = "admin";
    adminUser.permissions = [...PERMISSIONS];
    await adminUser.save();
  }

  return adminUser;
};

export const loginUser = async (req, res) => {
  try {
    await ensureDefaultAdminUser();

    const validationErrors = formatValidationErrors(req);
    if (validationErrors) {
      return sendValidationError(res, "Please provide valid login details", validationErrors);
    }

    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";
    const requestedRole = normalizeRoleValue(req.body.role);

    if (!email || !password) {
      return sendValidationError(res, "Email and password are required");
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const userRole = normalizeRoleValue(user.role);
    if (!ROLES.has(userRole)) {
      return res.status(403).json({
        success: false,
        message: "This account role is not allowed to access the admin panel.",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact an administrator.",
      });
    }

    if (requestedRole && requestedRole !== userRole) {
      return res.status(403).json({
        success: false,
        message: `This account is registered as ${userRole}. Please choose the correct role.`,
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (user.role !== userRole) {
      user.role = userRole;
      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        role: userRole,
        tokenVersion: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const device = req.headers["user-agent"] || "";
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "";
    await updateLoginHistory(user._id, device, ip);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error("Error during user login:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const createUser = async (req, res) => {
  try {
    const validationErrors = formatValidationErrors(req);
    if (validationErrors) {
      return sendValidationError(res, "Please fix validation errors", validationErrors);
    }

    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can create users" });
    }

    const name = trimString(req.body.name);
    const email = normalizeEmail(req.body.email);
    const password = req.body.password || "";
    const role = trimString(req.body.role).toLowerCase();
    const requestedPermissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];

    if (!["manager", "staff"].includes(role)) {
      return sendValidationError(res, "Role must be either manager or staff", { role: "Invalid role" });
    }

    const invalidPermissions = [...new Set(requestedPermissions)].filter(
      (permission) => !PERMISSIONS.includes(permission)
    );

    if (invalidPermissions.length) {
      return sendValidationError(res, "One or more permissions are invalid", {
        permissions: `Invalid permissions: ${invalidPermissions.join(", ")}`,
      });
    }

    const sanitizedPermissions = sanitizePermissions(requestedPermissions);
    if (!sanitizedPermissions.length) {
      return sendValidationError(res, "Please assign at least one permission", {
        permissions: 'At least one permission is required',
      });
    }

    const nonAssignablePermissions = sanitizedPermissions.filter((permission) =>
      NON_ASSIGNABLE_USER_PERMISSIONS.has(permission)
    );

    if (nonAssignablePermissions.length > 0) {
      return sendValidationError(res, "Selected permissions are reserved for admin accounts", {
        permissions: `Reserved permissions: ${nonAssignablePermissions.join(", ")}`,
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      permissions: sanitizedPermissions,
      position: role === "manager" ? "Manager" : "Staff",
      department: "School Administration",
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error("Error creating user:", error);
    const message = getFriendlyMongooseError(error, "Failed to create user");
    const statusCode = error.code === 11000 || error.name === "ValidationError" ? 400 : 500;
    return res.status(statusCode).json({ success: false, message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name email role permissions");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user: buildUserResponse(user) });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getPermissionCatalog = async (_req, res) => {
  const { assignablePermissions, assignableGroups } = buildAssignablePermissionCatalog();

  return res.json({
    success: true,
    permissions: [...PERMISSIONS],
    groups: PERMISSION_GROUPS,
    assignablePermissions,
    assignableGroups,
  });
};

export const getUsers = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can access users" });
    }

    const page = parsePageNumber(req.query.page);
    const limit = parsePageSize(req.query.limit);
    const roleFilter = normalizeRoleValue(req.query.role);
    const statusFilter = normalizeRoleValue(req.query.status);
    const searchFilter = trimString(req.query.search);

    const query = {
      role: { $in: MANAGED_USER_ROLES },
    };

    if (MANAGED_USER_ROLES.includes(roleFilter)) {
      query.role = roleFilter;
    }

    if (statusFilter === "active") {
      query.isActive = { $ne: false };
    }

    if (["inactive", "disabled", "deactivated"].includes(statusFilter)) {
      query.isActive = false;
    }

    if (searchFilter) {
      const searchRegex = new RegExp(escapeRegex(searchFilter), "i");
      query.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    const totalItems = await User.countDocuments(query);
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;
    const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    const skip = (safePage - 1) * limit;

    const users = await User.find(query)
      .select("name email role permissions isActive lastLogin createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.json({
      success: true,
      users: users.map((user) => buildManagedUserResponse(user)),
      pagination: {
        page: safePage,
        limit,
        totalItems,
        totalPages,
        hasNextPage: totalPages > 0 && safePage < totalPages,
        hasPrevPage: totalPages > 0 && safePage > 1,
      },
      filters: {
        role: MANAGED_USER_ROLES.includes(roleFilter) ? roleFilter : "all",
        status: statusFilter || "all",
        search: searchFilter,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateUserPermissions = async (req, res) => {
  try {
    const validationErrors = formatValidationErrors(req);
    if (validationErrors) {
      return sendValidationError(res, "Please fix validation errors", validationErrors);
    }

    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can update user permissions" });
    }

    const userId = trimString(req.params.userId);
    if (!isValidObjectId(userId)) {
      return sendValidationError(res, "Invalid user id", { userId: "Invalid user id" });
    }

    const requestedPermissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const invalidPermissions = [...new Set(requestedPermissions)].filter(
      (permission) => !PERMISSIONS.includes(permission)
    );

    if (invalidPermissions.length) {
      return sendValidationError(res, "One or more permissions are invalid", {
        permissions: `Invalid permissions: ${invalidPermissions.join(", ")}`,
      });
    }

    const sanitizedPermissions = sanitizePermissions(requestedPermissions);
    if (!sanitizedPermissions.length) {
      return sendValidationError(res, "Please assign at least one permission", {
        permissions: "At least one permission is required",
      });
    }

    const nonAssignablePermissions = sanitizedPermissions.filter((permission) =>
      NON_ASSIGNABLE_USER_PERMISSIONS.has(permission)
    );

    if (nonAssignablePermissions.length > 0) {
      return sendValidationError(res, "Selected permissions are reserved for admin accounts", {
        permissions: `Reserved permissions: ${nonAssignablePermissions.join(", ")}`,
      });
    }

    const user = await User.findOne({
      _id: userId,
      role: { $in: MANAGED_USER_ROLES },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.permissions = sanitizedPermissions;
    await user.save();

    return res.json({
      success: true,
      message: "User permissions updated successfully",
      user: buildManagedUserResponse(user),
    });
  } catch (error) {
    console.error("Error updating user permissions:", error);
    const message = getFriendlyMongooseError(error, "Failed to update user permissions");
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    return res.status(statusCode).json({ success: false, message });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const validationErrors = formatValidationErrors(req);
    if (validationErrors) {
      return sendValidationError(res, "Please fix validation errors", validationErrors);
    }

    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can update user status" });
    }

    const userId = trimString(req.params.userId);
    if (!isValidObjectId(userId)) {
      return sendValidationError(res, "Invalid user id", { userId: "Invalid user id" });
    }

    const nextIsActive = req.body.isActive === true;

    const user = await User.findOne({
      _id: userId,
      role: { $in: MANAGED_USER_ROLES },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isCurrentlyActive = user.isActive !== false;

    if (isCurrentlyActive === nextIsActive) {
      return res.json({
        success: true,
        message: nextIsActive ? "User is already active" : "User is already inactive",
        user: buildManagedUserResponse(user),
      });
    }

    user.isActive = nextIsActive;

    if (nextIsActive) {
      user.deactivatedAt = null;
      user.deactivatedBy = null;
    } else {
      user.deactivatedAt = new Date();
      user.deactivatedBy = req.user.id;
      user.tokenVersion = (Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) + 1;

      await User.updateOne(
        { _id: user._id },
        { $set: { "loginHistory.$[entry].status": "Logged out" } },
        { arrayFilters: [{ "entry.status": "Active" }] }
      );
    }

    await user.save();

    return res.json({
      success: true,
      message: nextIsActive
        ? "User activated successfully"
        : "User deactivated successfully. Active sessions were logged out.",
      user: buildManagedUserResponse(user),
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateUserPassword = async (req, res) => {
  try {
    const validationErrors = formatValidationErrors(req);
    if (validationErrors) {
      return sendValidationError(res, "Please fix validation errors", validationErrors);
    }

    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can update user passwords" });
    }

    const userId = trimString(req.params.userId);
    if (!isValidObjectId(userId)) {
      return sendValidationError(res, "Invalid user id", { userId: "Invalid user id" });
    }

    const newPassword = req.body.newPassword || "";
    if (newPassword.length < 6) {
      return sendValidationError(res, "New password must be at least 6 characters", {
        newPassword: "New password must be at least 6 characters",
      });
    }

    const user = await User.findOne({
      _id: userId,
      role: { $in: MANAGED_USER_ROLES },
    }).select("+password");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return sendValidationError(res, "New password must be different from current password", {
        newPassword: "Choose a different password",
      });
    }

    user.password = newPassword;
    user.tokenVersion = (Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0) + 1;

    await User.updateOne(
      { _id: user._id },
      { $set: { "loginHistory.$[entry].status": "Logged out" } },
      { arrayFilters: [{ "entry.status": "Active" }] }
    );

    await user.save();

    return res.json({
      success: true,
      message: "User password updated successfully. Active sessions were logged out.",
      user: buildManagedUserResponse(user),
    });
  } catch (error) {
    console.error("Error updating user password:", error);
    const message = getFriendlyMongooseError(error, "Failed to update user password");
    const statusCode = error.name === "ValidationError" ? 400 : 500;
    return res.status(statusCode).json({ success: false, message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Only admin can delete users" });
    }

    const userId = trimString(req.params.userId);
    if (!isValidObjectId(userId)) {
      return sendValidationError(res, "Invalid user id", { userId: "Invalid user id" });
    }

    if (req.user?.id === userId) {
      return sendValidationError(res, "You cannot delete your own account", {
        userId: "Cannot delete your own account",
      });
    }

    const deletedUser = await User.findOneAndDelete({
      _id: userId,
      role: { $in: MANAGED_USER_ROLES },
    }).select("_id");

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await User.updateMany({ deactivatedBy: deletedUser._id }, { $set: { deactivatedBy: null } });

    return res.json({
      success: true,
      message: "User deleted successfully",
      deletedUserId: deletedUser._id.toString(),
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
