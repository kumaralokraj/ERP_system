import mongoose from "mongoose";

const promotionLogSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionBatch",
      default: null,
      index: true,
    },
    resultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentResult",
      default: null,
    },
    fromEnrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      required: true,
    },
    toEnrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      default: null,
    },
    fromClassSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      required: true,
    },
    toClassSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
    },
    currentYear: {
      type: String,
      required: true,
    },
    nextYear: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      enum: ["promoted", "repeated", "graduated", "transferred", "dropped", "skipped"],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "promotion_logs",
  }
);

promotionLogSchema.index({ currentYear: 1, nextYear: 1 });
promotionLogSchema.index({ studentId: 1, createdAt: -1 });

const PromotionLog =
  mongoose.models.PromotionLog || mongoose.model("PromotionLog", promotionLogSchema);

export default PromotionLog;
