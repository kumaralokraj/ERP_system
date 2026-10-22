import mongoose from 'mongoose';

const inventoryHistorySchema = new mongoose.Schema({
  uniformItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UniformItem',
    required: true,
  },
  
  transactionType: {
    type: String,
    enum: ['purchase', 'issue', 'return', 'damage', 'adjustment'],
    required: true,
  },
  
  size: {
    type: String,
    required: true,
  },
  
  quantity: {
    type: Number,
    required: true,
  },
  
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false,
  },
  
  reason: {
    type: String,
    required: false,
  },
  
  previousStock: {
    type: Number,
    required: true,
  },
  
  newStock: {
    type: Number,
    required: true,
  },
  
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  
  date: {
    type: Date,
    default: Date.now,
  },
  
}, { timestamps: true });

// Index for better query performance
inventoryHistorySchema.index({ uniformItem: 1 });
inventoryHistorySchema.index({ transactionType: 1 });
inventoryHistorySchema.index({ date: -1 });

export default mongoose.model('UniformInventory', inventoryHistorySchema);