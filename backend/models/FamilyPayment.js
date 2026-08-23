import mongoose from "mongoose";

const familyPaymentAllocationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: {
      type: String,
      trim: true,
      default: "",
    },
    feesRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fees",
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    studentPaymentTransactionId: {
      type: String,
      trim: true,
      default: "",
    },
    monthKey: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
    },
    monthLabel: {
      type: String,
      trim: true,
      default: "",
    },
    feeType: {
      type: String,
      trim: true,
      default: "general",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    originalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    concessionType: {
      type: String,
      enum: ["none", "fixed", "percentage"],
      default: "none",
    },
    concessionValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    concessionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    concessionReason: {
      type: String,
      trim: true,
      default: "",
    },
    netFeeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    source: {
      type: String,
      enum: ["current_payment", "previous_year_balance", "advance_application"],
      default: "current_payment",
    },
    installmentKey: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
    },
    installmentLabel: {
      type: String,
      trim: true,
      default: "",
    },
    previousYearFeesRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fees",
      default: null,
    },
  },
  { _id: false }
);

const familyPaymentMonthSummarySchema = new mongoose.Schema(
  {
    monthKey: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
    },
    monthLabel: {
      type: String,
      trim: true,
      default: "",
    },
    dueBeforePayment: {
      type: Number,
      default: 0,
    },
    paidByCurrentPayment: {
      type: Number,
      default: 0,
    },
    paidByAdvance: {
      type: Number,
      default: 0,
    },
    endingBalance: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const familyPaymentSiblingSummarySchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: {
      type: String,
      trim: true,
      default: "",
    },
    classLabel: {
      type: String,
      trim: true,
      default: "",
    },
    allocatedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthsCovered: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { _id: false }
);

const familyPaymentSchema = new mongoose.Schema(
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
    transactionId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    amountCollected: {
      type: Number,
      required: true,
      min: 0,
    },
    excessAfterCurrentDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    advanceApplied: {
      type: Number,
      default: 0,
      min: 0,
    },
    usedAdvanceExplicitly: {
      type: Boolean,
      default: false,
    },
    futureAdvanceAllocated: {
      type: Number,
      default: 0,
      min: 0,
    },
    allocatedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    advanceCreated: {
      type: Number,
      default: 0,
      min: 0,
    },
    advanceBalanceAfter: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    mode: {
      type: String,
      enum: ["cash", "upi", "card", "bank_transfer", "cheque"],
      required: true,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    startFromMonth: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["posted", "voided"],
      default: "posted",
      index: true,
    },
    allocations: [familyPaymentAllocationSchema],
    monthSummary: [familyPaymentMonthSummarySchema],
    siblingSummary: [familyPaymentSiblingSummarySchema],
  },
  { timestamps: true }
);

familyPaymentSchema.index({ familyId: 1, academicYear: 1, paymentDate: -1 });

export default mongoose.models.FamilyPayment ||
  mongoose.model("FamilyPayment", familyPaymentSchema);
