import mongoose from "mongoose";

const paymentHistorySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    mode: {
      type: String,
      enum: ["cash", "upi", "card", "bank_transfer", "cheque", "advance"],
      required: true,
    },
    feeType: {
      type: String,
      enum: ["tuition", "transport", "exam", "books", "admission", "previous_year_balance", "general"],
      default: "general",
    },
    feeLabel: {
      type: String,
      default: "",
      trim: true,
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    note: {
      type: String,
      default: "",
    },
    familyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      default: null,
    },
    familyPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyPayment",
      default: null,
    },
    familyTransactionId: {
      type: String,
      default: "",
      trim: true,
    },
    studentPaymentTransactionId: {
      type: String,
      default: "",
      trim: true,
    },
    entryType: {
      type: String,
      enum: ["payment", "family_payment", "advance_application", "adjustment"],
      default: "payment",
    },
    allocationSource: {
      type: String,
      default: "",
      trim: true,
    },
    installments: [
      {
        feeType: {
          type: String,
          enum: ["tuition", "transport", "exam", "admission", "books", "previous_year_balance"],
          required: true,
        },
        feeLabel: {
          type: String,
          default: "",
          trim: true,
        },
        installmentKey: {
          type: String,
          default: "",
          uppercase: true,
          trim: true,
        },
        installmentLabel: {
          type: String,
          default: "",
          trim: true,
        },
        dueMonth: {
          type: String,
          default: "",
          uppercase: true,
          trim: true,
        },
        monthKey: {
          type: String,
          required: true,
          uppercase: true,
          trim: true,
        },
        monthLabel: {
          type: String,
          default: "",
          trim: true,
        },
        paidAmount: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
  },
  { _id: false }
);

const feeInstallmentSchema = new mongoose.Schema(
  {
    feeType: {
      type: String,
      enum: ["tuition", "transport", "exam"],
      required: true,
      index: true,
    },
    frequency: {
      type: String,
      enum: ["MONTHLY", "YEARLY", "SCHEDULED"],
      default: "MONTHLY",
    },
    installmentKey: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    installmentLabel: {
      type: String,
      default: "",
      trim: true,
    },
    dueMonth: {
      type: String,
      default: "",
      uppercase: true,
      trim: true,
    },
    monthKey: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    monthLabel: {
      type: String,
      required: true,
      trim: true,
    },
    monthIndex: {
      type: Number,
      required: true,
      min: 0,
      max: 11,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
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
      default: "",
      trim: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["PAID", "PENDING", "PARTIAL", "OVERDUE"],
      default: "PENDING",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    receiptId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const feesSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    enrollmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentEnrollment",
      // Sparse unique indexes still index explicit null values.
      set: (value) => value || undefined,
    },

    classSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClassSession",
      default: null,
      index: true,
    },

    academicYear: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    isCurrent: {
      type: Boolean,
      default: true,
      index: true,
    },

    class: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    totalFees: {
      type: Number,
      required: true,
    },

    paidAmount: {
      type: Number,
      default: 0,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["paid", "partial", "unpaid", "overdue"],
      default: "unpaid",
    },

    feeSettings: {
      transportOpted: {
        type: Boolean,
        default: true,
      },
      transportFee: {
        type: Number,
        default: 0,
        min: 0,
      },
      admissionFeeOverride: {
        type: Number,
        default: null,
        min: 0,
      },
      tuitionConcession: {
        type: {
          type: String,
          enum: ["none", "fixed", "percentage"],
          default: "none",
        },
        value: {
          type: Number,
          default: 0,
          min: 0,
        },
        reason: {
          type: String,
          default: "",
          trim: true,
        },
        isActive: {
          type: Boolean,
          default: false,
        },
      },
    },

    feeBreakdown: {
      tuition: {
        type: Number,
        default: 0,
        min: 0,
      },
      originalTuition: {
        type: Number,
        default: 0,
        min: 0,
      },
      tuitionConcession: {
        type: Number,
        default: 0,
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
      transport: {
        type: Number,
        default: 0,
        min: 0,
      },
      books: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    feeInstallments: [feeInstallmentSchema],

    paymentHistory: [paymentHistorySchema],
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
feesSchema.index(
  { student: 1, academicYear: 1 },
  {
    unique: true,
    partialFilterExpression: { academicYear: { $type: "string" } },
  }
);
feesSchema.index({ student: 1, isCurrent: 1 });
feesSchema.index({ enrollmentId: 1 }, { unique: true, sparse: true });
feesSchema.index({ classSessionId: 1, academicYear: 1 });
feesSchema.index({ class: 1 });
feesSchema.index({ status: 1 });

export default mongoose.model("Fees", feesSchema);
