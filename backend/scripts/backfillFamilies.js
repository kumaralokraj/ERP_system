import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Student from "../models/Student.js";
import {
  assignFamilyToStudentRecord,
  buildFamilyKey,
  getStudentFamilyFields,
  getParentFirstName,
} from "../services/familyIdentityService.js";

const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");
const dryRun = !commit;

const getDryRunKey = (student) => buildFamilyKey(student) || `single::${student._id || student.studentId}`;

const main = async () => {
  await connectDB();

  const students = await Student.find().sort({ firstName: 1, lastName: 1 });
  const groups = new Map();
  const missingParentData = [];

  for (const student of students) {
    const fields = getStudentFamilyFields(student);
    const key = getDryRunKey(student);
    const fatherFirstName = getParentFirstName(fields.fatherName);
    const motherFirstName = getParentFirstName(fields.motherName);

    groups.set(key, [...(groups.get(key) || []), student]);
    if (!fatherFirstName || !motherFirstName) {
      missingParentData.push(student);
    }

    if (commit) {
      await assignFamilyToStudentRecord(student);
    }
  }

  const siblingGroups = [...groups.values()].filter((group) => group.length > 1);

  console.log(`Mode: ${dryRun ? "dry-run" : "commit"}`);
  console.log(`Students scanned: ${students.length}`);
  console.log(`Family groups detected: ${groups.size}`);
  console.log(`Sibling groups detected: ${siblingGroups.length}`);
  console.log(`Students missing father or mother first name: ${missingParentData.length}`);

  if (siblingGroups.length > 0) {
    console.log("\nSibling groups preview:");
    siblingGroups.slice(0, 20).forEach((group, index) => {
      const names = group.map((student) => `${student.firstName} ${student.lastName}`.trim()).join(", ");
      const fields = getStudentFamilyFields(group[0]);
      console.log(`${index + 1}. ${fields.fatherName || "Unknown father"} / ${fields.motherName || "Unknown mother"}: ${names}`);
    });
  }

  if (missingParentData.length > 0) {
    console.log("\nMissing parent data preview:");
    missingParentData.slice(0, 20).forEach((student, index) => {
      console.log(`${index + 1}. ${student.firstName} ${student.lastName} (${student.studentId})`);
    });
  }

  if (dryRun) {
    console.log("\nNo changes were written. Run with --commit to assign family records.");
  }
};

main()
  .catch((error) => {
    console.error("Family backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
