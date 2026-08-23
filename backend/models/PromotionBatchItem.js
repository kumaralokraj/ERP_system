import mongoose from "mongoose";

const promotionBatchItemSchema = new mongoose.Schema(
  {
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromotionBatch",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
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
    recommendedToClassSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
    },
    finalToClassSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
    },
    resultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentResult",
      default: null,
    },
    resultStatus: {
      type: String,
      trim: true,
      default: "pending",
    },
    sourceResultStatus: {
      type: String,
      trim: true,
      default: "",
    },
    decision: {
      type: String,
      enum: ["promote", "repeat", "graduate", "transfer", "drop", "skip"],
      required: true,
    },
    decisionSource: {
      type: String,
      enum: ["result", "manual", "system", "execution"],
      default: "system",
      index: true,
    },
    manualOverride: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "ready", "processed", "skipped", "failed"],
      default: "pending",
      index: true,
    },
    validationMessages: [{ type: String, trim: true }],
    warningMessages: [{ type: String, trim: true }],
    errorMessages: [{ type: String, trim: true }],
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "promotion_batch_items",
  }
);

promotionBatchItemSchema.index({ batchId: 1, studentId: 1 }, { unique: true });
promotionBatchItemSchema.index({ fromClassSessionId: 1, status: 1 });
promotionBatchItemSchema.index({ studentId: 1, createdAt: -1 });

const PromotionBatchItem =
  mongoose.models.PromotionBatchItem ||
  mongoose.model("PromotionBatchItem", promotionBatchItemSchema);

export default PromotionBatchItem;
