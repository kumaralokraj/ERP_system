import mongoose from "mongoose";

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
      unique: true,
    },
  },
  {
    timestamps: true,
    collection: "master_classes",
  }
);

const Class = mongoose.models.Class || mongoose.model("Class", classSchema);

export default Class;
