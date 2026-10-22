import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '', trim: true },
  position: { type: String, default: 'Principal', trim: true },
  department: { type: String, default: 'School Administration', trim: true },
  address: { type: String, default: '', trim: true },
  city: { type: String, default: '', trim: true },
  state: { type: String, default: '', trim: true },
  zipCode: { type: String, default: '', trim: true },
  profileImage: { type: String, default: '' },
  joinDate: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  loginHistory: [{
    date: { type: Date, default: Date.now },
    device: { type: String, default: '' },
    ip: { type: String, default: '' },
    status: { type: String, enum: ['Active', 'Logged out'], default: 'Logged out' },
  }],
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
