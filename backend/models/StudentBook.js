// models/StudentBook.js
import mongoose from 'mongoose';

const studentBookSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Please provide student ID'],
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
    },
    bookName: {
      type: String,
    },
    itemType: {
      type: String,
      enum: ['book', 'diary'],
      default: 'book',
    },
    className: {
      type: String,
      required: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    returnDate: {
      type: Date,
    },
    dueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'issued', 'returned', 'partial', 'damaged', 'lost'],
      default: 'pending',
    },
    condition: {
      type: String,
      enum: ['good', 'damaged', 'lost'],
      default: 'good',
    },
    notes: {
      type: String,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryInvoice',
      default: null,
    },
    invoiceNo: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    fine: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

studentBookSchema.index({ studentId: 1, status: 1 });
studentBookSchema.index({ bookId: 1, status: 1 });
studentBookSchema.index({ className: 1, status: 1 });

const StudentBook = mongoose.models.StudentBook || mongoose.model('StudentBook', studentBookSchema);

export default StudentBook;
