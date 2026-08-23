import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    mode: {
      type: String,
      enum: ['cash', 'upi', 'card', 'bank_transfer', 'cheque'],
      required: true,
    },
    transactionId: {
      type: String,
      default: '',
      trim: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { _id: true }
);

const invoiceLineItemSchema = new mongoose.Schema(
  {
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    inventoryModel: {
      type: String,
      enum: ['Book', 'UniformItem'],
      required: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
    },
    itemType: {
      type: String,
      enum: ['book', 'diary'],
      default: 'book',
    },
    subject: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: String,
      default: '',
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const inventoryInvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    module: {
      type: String,
      enum: ['books', 'uniforms'],
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    className: {
      type: String,
      default: '',
      trim: true,
    },
    lineItems: [invoiceLineItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    balanceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'refunded'],
      default: 'unpaid',
      index: true,
    },
    issueStatus: {
      type: String,
      enum: ['pending', 'issued', 'cancelled'],
      default: 'pending',
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'partial', 'paid', 'issued', 'cancelled'],
      default: 'open',
      index: true,
    },
    payments: [paymentSchema],
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    issuedAt: {
      type: Date,
      default: null,
    },
    linkedBookRecords: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StudentBook',
      },
    ],
    linkedUniformIssue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UniformIssue',
      default: null,
    },
  },
  { timestamps: true }
);

inventoryInvoiceSchema.index({ module: 1, student: 1, createdAt: -1 });
inventoryInvoiceSchema.index({ module: 1, issueStatus: 1, paymentStatus: 1 });

inventoryInvoiceSchema.pre('validate', function updateInvoiceStatus() {
  const totalAmount = Math.max(Number(this.totalAmount || 0), 0);
  const paidAmount = Math.max(Number(this.paidAmount || 0), 0);

  this.balanceAmount = Math.max(totalAmount - paidAmount, 0);

  if (this.balanceAmount <= 0) {
    this.paymentStatus = 'paid';
  } else if (paidAmount > 0) {
    this.paymentStatus = 'partial';
  } else {
    this.paymentStatus = 'unpaid';
  }

  if (this.issueStatus === 'cancelled') {
    this.status = 'cancelled';
  } else if (this.issueStatus === 'issued') {
    this.status = 'issued';
  } else if (this.paymentStatus === 'paid') {
    this.status = 'paid';
  } else if (this.paymentStatus === 'partial') {
    this.status = 'partial';
  } else {
    this.status = 'open';
  }
});

const InventoryInvoice =
  mongoose.models.InventoryInvoice ||
  mongoose.model('InventoryInvoice', inventoryInvoiceSchema);

export default InventoryInvoice;
