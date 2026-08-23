// models/Book.js
import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide book name'],
      trim: true,
    },
    subject: {
      type: String,
      required: [true, 'Please provide subject'],
      trim: true,
    },
    className: {
      type: String,
      required: [true, 'Please provide class name'],
    },
    itemType: {
      type: String,
      enum: ['book', 'diary'],
      default: 'book',
      index: true,
    },
    totalStock: {
      type: Number,
      required: [true, 'Please provide total stock'],
      default: 0,
    },
    issuedCount: {
      type: Number,
      default: 0,
    },
    damagedCount: {
      type: Number,
      default: 0,
    },
    availableStock: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
    },
    
  },
  { timestamps: true } 
);

// ✅ FIXED: Calculate available stock before saving
bookSchema.pre('save', function () {
  this.availableStock = this.totalStock - this.issuedCount - this.damagedCount;
});

const Book = mongoose.model('Book', bookSchema);
export default Book;
