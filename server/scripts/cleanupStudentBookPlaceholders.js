import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import StudentBook from "../models/StudentBook.js";

const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");

const placeholderQuery = {
  status: "pending",
  $and: [
    {
      $or: [
        { bookId: { $exists: false } },
        { bookId: null },
      ],
    },
    {
      $or: [
        { bookName: { $exists: false } },
        { bookName: null },
        { bookName: "" },
      ],
    },
  ],
};

const run = async () => {
  await connectDB();

  try {
    const placeholderCount = await StudentBook.countDocuments(placeholderQuery);
    const sample = await StudentBook.find(placeholderQuery)
      .select("_id studentId className status createdAt")
      .sort({ createdAt: 1 })
      .limit(5)
      .lean();

    const result = {
      mode: commit ? "COMMIT" : "DRY_RUN",
      placeholderCount,
      sample,
      deletedCount: 0,
    };

    if (commit && placeholderCount > 0) {
      const deleteResult = await StudentBook.deleteMany(placeholderQuery);
      result.deletedCount = deleteResult.deletedCount || 0;
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch(async (error) => {
  console.error("Failed to clean student book placeholders:", error);
  await mongoose.disconnect();
  process.exit(1);
});
