import mongoose from 'mongoose';

const uniformIssueItemSchema = new mongoose.Schema(
  {
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UniformIssue',
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UniformItem',
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    pricePerItem: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineTotal: {
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
    condition: {
      type: String,
      enum: ['good', 'worn', 'damaged'],
      default: 'good',
    },
    status: {
      type: String,
      enum: ['issued', 'returned', 'exchanged', 'damaged'],
      default: 'issued',
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

uniformIssueItemSchema.index({ student: 1, issuedAt: -1 });
uniformIssueItemSchema.index({ inventoryItem: 1, size: 1 });

const UniformIssueItem =
  mongoose.models.UniformIssueItem ||
  mongoose.model('UniformIssueItem', uniformIssueItemSchema);

export default UniformIssueItem;
