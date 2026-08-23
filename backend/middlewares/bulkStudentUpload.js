import path from "path";
import multer from "multer";

const MAX_BULK_STUDENT_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx"]);

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const extension = path.extname(file.originalname || "").toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    const error = new Error("Invalid file type. Please upload a CSV or XLSX file.");
    error.statusCode = 400;
    return cb(error);
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_BULK_STUDENT_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

const bulkStudentUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File is too large. Please upload a smaller CSV or XLSX file.",
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  });
};

export default bulkStudentUpload;
