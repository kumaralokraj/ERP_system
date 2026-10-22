import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Fees from "../models/Fees.js";

const buildFeesRecord = (enrollmentId) =>
  new Fees({
    student: new mongoose.Types.ObjectId(),
    enrollmentId,
    class: new mongoose.Types.ObjectId(),
    totalFees: 1000,
    dueDate: new Date("2027-03-31T00:00:00.000Z"),
  });

test("fee records omit missing enrollment IDs from the sparse unique index", () => {
  const siblings = [buildFeesRecord(null), buildFeesRecord(null), buildFeesRecord(null)];

  siblings.forEach((feesRecord) => {
    const persistedShape = feesRecord.toObject();
    assert.equal(feesRecord.enrollmentId, undefined);
    assert.equal(Object.hasOwn(persistedShape, "enrollmentId"), false);
  });
});
