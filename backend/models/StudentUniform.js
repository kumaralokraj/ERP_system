import mongoose from 'mongoose';

const uniformDetailsSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    default: 1,
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
  },
  invoiceNo: {
    type: String,
    default: '',
    trim: true,
  },
  issueDate: {
    type: Date,
    required: true,
  },
  expectedReturnDate: {
    type: Date,
    required: false,
  },
  condition: {
    type: String,
    enum: ['good', 'worn', 'damaged'],
    default: 'good',
  },
}, { _id: false });

const studentUniformSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },

  class: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  
  uniforms: [uniformDetailsSchema],
  
  status: {
    type: String,
    enum: ['pending', 'issued', 'returned', 'partial'],
    default: 'pending',
  },
  
  totalUniformsIssued: {
    type: Number,
    default: 0,
  },
  
  notes: {
    type: String,
    required: false,
  },
  
}, { timestamps: true });

// Index for better query performance
studentUniformSchema.index({ student: 1 });
studentUniformSchema.index({ class: 1 });
studentUniformSchema.index({ status: 1 });

export default mongoose.model('StudentUniform', studentUniformSchema);
