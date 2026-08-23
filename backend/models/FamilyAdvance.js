import mongoose from "mongoose";

const familyAdvanceLotSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      trim: true,
      default: "",
    },
    familyPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyPayment",
      default: null,
    },
    originalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const familyAdvanceHistorySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
    },
    transactionId: {
      type: String,
      trim: true,
      default: "",
    },
    familyPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyPayment",
      default: null,
    },
    type: {
      type: String,
      enum: ["created", "applied", "adjusted"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const familyAdvanceSchema = new mongoose.Schema(
  {
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    advanceBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    lots: [familyAdvanceLotSchema],
    history: [familyAdvanceHistorySchema],
  },
  { timestamps: true }
);

familyAdvanceSchema.index({ familyId: 1, academicYear: 1 }, { unique: true });

export default mongoose.models.FamilyAdvance ||
  mongoose.model("FamilyAdvance", familyAdvanceSchema);
