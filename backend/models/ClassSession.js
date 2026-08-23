import mongoose from "mongoose";

const feesSchema = new mongoose.Schema(
  {
    tuition: {
      type: Number,
      required: true,
      min: 0,
    },
    admission: {
      type: Number,
      default: 0,
      min: 0,
    },
    exam: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
  },
  { _id: false }
);

const classSessionSchema = new mongoose.Schema(
  {
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    section: {
      type: String,
      uppercase: true,
      trim: true,
      default: null,
    },
    capacity: {
      type: Number,
      min: 1,
      max: 100,
      default: 40,
    },
    classTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },
    fees: {
      type: feesSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    legacyClassId: {
      type: mongoose.Schema.Types.ObjectId,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "class_sessions",
  }
);

classSessionSchema.index({ classId: 1, academicYear: 1, section: 1 }, { unique: true });
classSessionSchema.index({ academicYear: 1, status: 1 });
classSessionSchema.index({ classTeacher: 1, academicYear: 1 });

const ClassSession =
  mongoose.models.ClassSession || mongoose.model("ClassSession", classSessionSchema);

export default ClassSession;
