import mongoose from "mongoose";

const studentResultSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      required: true,
    },
    classSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    resultStatus: {
      type: String,
      enum: ["pending", "pass", "fail", "detained", "absent", "withheld"],
      default: "pending",
      index: true,
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    grade: {
      type: String,
      trim: true,
      default: "",
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    declaredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    declaredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "student_results",
  }
);

studentResultSchema.index({ studentId: 1, academicYear: 1 }, { unique: true });
studentResultSchema.index({ enrollmentId: 1 }, { unique: true });
studentResultSchema.index({ classSessionId: 1, academicYear: 1, resultStatus: 1 });

const StudentResult =
  mongoose.models.StudentResult || mongoose.model("StudentResult", studentResultSchema);

export default StudentResult;
