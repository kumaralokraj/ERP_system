import express from "express";
import { importBulkStudents, previewBulkStudents } from "../../controllers/studentBulkUploadController.js";
import { searchStudentsForFees } from "../../controllers/adminStudentController.js";
import { searchStudentsForUniforms } from "../../controllers/uniformController.js";
import { searchStudentsForBooks } from "../../controllers/booksController.js";
import adminAuth from "../../middlewares/adminAuth.js";
import bulkStudentUpload from "../../middlewares/bulkStudentUpload.js";
import { authorizePermissions } from "../../middleware/permissions.js";

const adminStudentBulkRouter = express.Router();

adminStudentBulkRouter.get(
  "/search",
  adminAuth,
  authorizePermissions("fees.view"),
  searchStudentsForFees
);

adminStudentBulkRouter.get(
  "/uniform-search",
  adminAuth,
  authorizePermissions("uniforms.view"),
  searchStudentsForUniforms
);

adminStudentBulkRouter.get(
  "/book-search",
  adminAuth,
  authorizePermissions("books.view"),
  searchStudentsForBooks
);

adminStudentBulkRouter.post(
  "/bulk-preview",
  adminAuth,
  authorizePermissions("students.view"),
  bulkStudentUpload,
  previewBulkStudents
);

adminStudentBulkRouter.post(
  "/bulk-import",
  adminAuth,
  authorizePermissions("students.view"),
  bulkStudentUpload,
  importBulkStudents
);

export default adminStudentBulkRouter;
