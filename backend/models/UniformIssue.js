import mongoose from 'mongoose';

const uniformIssueSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['issued', 'cancelled'],
      default: 'issued',
    },
    itemCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryInvoice',
      default: null,
      index: true,
    },
    invoiceNo: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

uniformIssueSchema.index({ student: 1, issuedAt: -1 });
uniformIssueSchema.index({ class: 1, issuedAt: -1 });

const UniformIssue =
  mongoose.models.UniformIssue || mongoose.model('UniformIssue', uniformIssueSchema);

export default UniformIssue;
