import mongoose from "mongoose";

const studentEnrollmentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
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
    status: {
      type: String,
      enum: ["active", "promoted", "graduated", "repeated", "transferred", "dropped", "inactive"],
      default: "active",
    },
    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },
    feeActiveFrom: {
      type: Date,
      default: null,
    },
    feeActiveUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "student_enrollments",
  }
);

studentEnrollmentSchema.index({ studentId: 1, academicYear: 1 }, { unique: true });
studentEnrollmentSchema.index({ studentId: 1, isCurrent: 1 });
studentEnrollmentSchema.index({ classSessionId: 1, academicYear: 1 });

const StudentEnrollment =
  mongoose.models.StudentEnrollment ||
  mongoose.model("StudentEnrollment", studentEnrollmentSchema);

export default StudentEnrollment;
