import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { PERMISSIONS, ROLES, sanitizePermissions } from "../constants/permissions.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      required: true,
      default: "staff",
      lowercase: true,
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (values = []) => values.every((permission) => PERMISSIONS.includes(permission)),
        message: "Invalid permission key detected",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    deactivatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Optional profile fields used by existing profile screens.
    phone: { type: String, default: "", trim: true },
    position: { type: String, default: "" },
    department: { type: String, default: "" },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zipCode: { type: String, default: "" },
    profileImage: { type: String, default: "" },

    lastLogin: { type: Date, default: Date.now },
    loginHistory: [
      {
        date: { type: Date, default: Date.now },
        device: { type: String, default: "" },
        ip: { type: String, default: "" },
        status: { type: String, enum: ["Active", "Logged out"], default: "Logged out" },
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre("save", async function userPreSave() {
  if (this.role === "admin") {
    this.permissions = [...PERMISSIONS];
  } else {
    this.permissions = sanitizePermissions(this.permissions);
  }

  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (this.password?.startsWith("$2")) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // Support older accounts that were stored before password hashing was enabled.
  return Promise.resolve(candidatePassword === this.password);
};

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

export default User;
