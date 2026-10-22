import jwt from "jsonwebtoken";
import User from "../models/User.js";

const ALLOWED_ADMIN_PANEL_ROLES = new Set(["admin", "manager", "staff"]);

const normalizeRole = (role = "") => String(role).trim().toLowerCase();

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || "";

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return req.headers.token || null;
};

export const authenticateUser = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication token is required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const decodedRole = normalizeRole(decoded?.role);

    if (!decoded || typeof decoded !== "object" || !decoded.id || !ALLOWED_ADMIN_PANEL_ROLES.has(decodedRole)) {
      return res.status(401).json({ success: false, message: "Invalid authentication token" });
    }

    const user = await User.findById(decoded.id).select("name email role permissions isActive tokenVersion");

    if (!user) {
      return res.status(401).json({ success: false, message: "User no longer exists" });
    }

    const normalizedRole = normalizeRole(user.role);

    if (!ALLOWED_ADMIN_PANEL_ROLES.has(normalizedRole)) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this resource" });
    }

    const isUserActive = user.isActive !== false;

    if (!isUserActive) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact an administrator.",
      });
    }

    const decodedTokenVersion = Number.isInteger(decoded?.tokenVersion) ? decoded.tokenVersion : 0;
    const currentTokenVersion = Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0;

    if (decodedTokenVersion !== currentTokenVersion) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please sign in again.",
      });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: normalizedRole,
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      isActive: isUserActive,
      tokenVersion: currentTokenVersion,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }
};
