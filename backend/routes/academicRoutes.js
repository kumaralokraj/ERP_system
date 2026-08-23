import express from "express";
import adminAuth from "../middlewares/adminAuth.js";
import { authorizePermissions } from "../middleware/permissions.js";
import {
  createClassSession,
  createMasterClass,
  deleteClassSession,
  enrollStudent,
  getAllMasterClasses,
  getClassSessionById,
  getClassSessionCopyTemplate,
  getClassSessions,
  getStudentEnrollments,
  promoteStudents,
  updateClassSession,
} from "../controllers/academicStructureController.js";

const academicRouter = express.Router();

academicRouter.get("/classes", adminAuth, authorizePermissions("classes.view"), getAllMasterClasses);
academicRouter.post("/classes", adminAuth, authorizePermissions("classes.view"), createMasterClass);

academicRouter.get(
  "/class-sessions/copy-template",
  adminAuth,
  authorizePermissions("classes.view"),
  getClassSessionCopyTemplate
);
academicRouter.get("/class-sessions", adminAuth, authorizePermissions("classes.view"), getClassSessions);
academicRouter.post("/class-sessions", adminAuth, authorizePermissions("classes.view"), createClassSession);
academicRouter.get("/class-sessions/:id", adminAuth, authorizePermissions("classes.view"), getClassSessionById);
academicRouter.put("/class-sessions/:id", adminAuth, authorizePermissions("classes.view"), updateClassSession);
academicRouter.delete(
  "/class-sessions/:id",
  adminAuth,
  authorizePermissions("classes.view"),
  deleteClassSession
);

academicRouter.post("/enroll-student", adminAuth, authorizePermissions("classes.view"), enrollStudent);
academicRouter.get(
  "/students/:id/enrollments",
  adminAuth,
  authorizePermissions("classes.view"),
  getStudentEnrollments
);
academicRouter.post("/promote-students", adminAuth, authorizePermissions("classes.view"), promoteStudents);

export default academicRouter;
