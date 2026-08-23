import mongoose from "mongoose";

const promotionBatchSchema = new mongoose.Schema(
  {
    batchNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    currentYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    nextYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    scope: {
      type: {
        type: String,
        enum: ["year", "classSession"],
        required: true,
      },
      classSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassSession",
        default: null,
      },
    },
    status: {
      type: String,
      enum: ["draft", "validated", "processing", "completed", "failed", "cancelled"],
      default: "draft",
      index: true,
    },
    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      default: "",
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    counts: {
      total: { type: Number, default: 0 },
      ready: { type: Number, default: 0 },
      promoted: { type: Number, default: 0 },
      repeated: { type: Number, default: 0 },
      graduated: { type: Number, default: 0 },
      transferred: { type: Number, default: 0 },
      dropped: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "promotion_batches",
  }
);

promotionBatchSchema.index({ currentYear: 1, nextYear: 1, status: 1 });
promotionBatchSchema.index({ "scope.classSessionId": 1, currentYear: 1, nextYear: 1 });

const PromotionBatch =
  mongoose.models.PromotionBatch || mongoose.model("PromotionBatch", promotionBatchSchema);

export default PromotionBatch;
