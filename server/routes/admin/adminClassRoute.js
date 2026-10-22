import express from "express";
import {
    getAllClasses,
    createClass,
    updateClass,
    deleteClass,
    getClassById
} from "../../controllers/adminClassController.js";
import adminAuth from "../../middlewares/adminAuth.js";
import { authorizeAnyPermission, authorizePermissions } from "../../middleware/permissions.js";

const adminClassRouter = express.Router();

// Route to get all classes
adminClassRouter.get(
    "/classes",
    adminAuth,
    authorizeAnyPermission("classes.view", "dashboard.view", "fees.view"),
    getAllClasses
);

// Route to create a new class
adminClassRouter.post("/class/create", adminAuth, authorizePermissions("classes.view"), createClass);

// Route to update an existing class
adminClassRouter.put("/class/:classId", adminAuth, authorizePermissions("classes.view"), updateClass);

// Route to delete a class
adminClassRouter.delete("/class/:classId", adminAuth, authorizePermissions("classes.view"), deleteClass);

// Route to get a single class
adminClassRouter.get("/class/:classId", adminAuth, authorizePermissions("classes.view"), getClassById);

export default adminClassRouter;
