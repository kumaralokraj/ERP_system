import mongoose from 'mongoose';

const sizeStockSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true,
  },
  stock: {
    type: Number,
    required: true,
    default: 0,
  },
  pricePerItem: {
    type: Number,
    min: [0, 'Price per size must be 0 or greater'],
  }
}, { _id: false });

const uniformItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  
  sizes: [sizeStockSchema],
  
  totalStock: {
    type: Number,
    required: true,
    default: 0,
  },
  
  issued: {
    type: Number,
    default: 0,
  },
  
  damaged: {
    type: Number,
    default: 0,
  },
  
  available: {
    type: Number,
    default: 0,
  },

  // Legacy fallback for existing records and older clients. New pricing lives on sizes.
  pricePerItem: {
    type: Number,
    default: 0,
    min: [0, 'Price per item must be 0 or greater'],
  },
  
  description: {
    type: String,
    required: false,
  },
  
  reorderLevel: {
    type: Number,
    default: 20,
  },
  
}, { timestamps: true });

// Calculate available stock
uniformItemSchema.virtual('availableStock').get(function() {
  return this.totalStock - this.issued - this.damaged;
});

export default mongoose.model('UniformItem', uniformItemSchema);
