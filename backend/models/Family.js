import mongoose from "mongoose";

const familySchema = new mongoose.Schema(
  {
    familyCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      select: false,
      default: "",
    },
    familyKey: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    familyKeys: [
      {
        type: String,
        trim: true,
        index: true,
      },
    ],
    displayName: {
      type: String,
      trim: true,
      default: "Family",
    },
    fatherName: {
      type: String,
      trim: true,
      default: "",
    },
    motherName: {
      type: String,
      trim: true,
      default: "",
    },
    primaryPhone: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    secondaryPhones: [
      {
        type: String,
        trim: true,
      },
    ],
    address: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "merged"],
      default: "active",
      index: true,
    },
    manualLock: {
      type: Boolean,
      default: false,
    },
    mergedIntoFamilyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

familySchema.index({ familyKey: 1, status: 1 });
familySchema.index({ fatherName: 1, primaryPhone: 1 });

export default mongoose.models.Family || mongoose.model("Family", familySchema);
