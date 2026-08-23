import express from "express";
import { body } from "express-validator";
import { authenticateUser } from "../middleware/auth.js";
import { authorizePermissions, authorizeRoles } from "../middleware/permissions.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  createUser,
  deleteUser,
  getCurrentUser,
  getPermissionCatalog,
  getUsers,
  updateUserPassword,
  updateUserPermissions,
  updateUserStatus,
} from "../controllers/userController.js";

const userRouter = express.Router();

const createUserValidators = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long"),
  body("role").isIn(["manager", "staff"]).withMessage("Role must be manager or staff"),
  body("permissions")
    .optional()
    .isArray()
    .withMessage("Permissions must be an array")
    .custom((permissions = []) => permissions.every((permission) => PERMISSIONS.includes(permission)))
    .withMessage("One or more permissions are invalid"),
];

const updateUserPermissionsValidators = [
  body("permissions")
    .isArray({ min: 1 })
    .withMessage("At least one permission is required")
    .custom((permissions = []) => permissions.every((permission) => PERMISSIONS.includes(permission)))
    .withMessage("One or more permissions are invalid"),
];

const updateUserStatusValidators = [
  body("isActive").isBoolean().withMessage("isActive must be boolean").toBoolean(),
];

const updateUserPasswordValidators = [
  body("newPassword")
    .isString()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters long"),
];

userRouter.get("/me", authenticateUser, authorizeRoles("admin", "manager", "staff"), getCurrentUser);
userRouter.get("/permissions", authenticateUser, authorizeRoles("admin"), getPermissionCatalog);
userRouter.get("/", authenticateUser, authorizeRoles("admin"), authorizePermissions("users.view"), getUsers);

userRouter.post(
  "/create",
  authenticateUser,
  authorizeRoles("admin"),
  authorizePermissions("users.create"),
  createUserValidators,
  createUser
);

userRouter.put(
  "/:userId/permissions",
  authenticateUser,
  authorizeRoles("admin"),
  authorizePermissions("users.manage"),
  updateUserPermissionsValidators,
  updateUserPermissions
);

userRouter.patch(
  "/:userId/status",
  authenticateUser,
  authorizeRoles("admin"),
  authorizePermissions("users.manage"),
  updateUserStatusValidators,
  updateUserStatus
);

userRouter.patch(
  "/:userId/password",
  authenticateUser,
  authorizeRoles("admin"),
  authorizePermissions("users.manage"),
  updateUserPasswordValidators,
  updateUserPassword
);

userRouter.delete(
  "/:userId",
  authenticateUser,
  authorizeRoles("admin"),
  authorizePermissions("users.manage"),
  deleteUser
);

export default userRouter;
