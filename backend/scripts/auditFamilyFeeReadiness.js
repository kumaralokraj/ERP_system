import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../configs/mongodb.js";
import Family from "../models/Family.js";
import Fees from "../models/Fees.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";

const main = async () => {
  await connectDB();

  const activeStudents = await Student.find({ status: "active" }).select(
    "firstName lastName studentId familyId"
  );
  const activeStudentIds = activeStudents.map((student) => student._id);
  const studentsWithoutFamily = activeStudents.filter((student) => !student.familyId);
  const currentEnrollments = await StudentEnrollment.find({
    studentId: { $in: activeStudentIds },
    isCurrent: true,
  }).select("studentId academicYear classSessionId");
  const currentEnrollmentStudentIds = new Set(currentEnrollments.map((enrollment) => String(enrollment.studentId)));
  const activeWithoutEnrollment = activeStudents.filter(
    (student) => !currentEnrollmentStudentIds.has(String(student._id))
  );
  const currentFees = await Fees.find({
    student: { $in: activeStudentIds },
    $or: [{ isCurrent: true }, { isCurrent: { $exists: false } }],
  }).select("student academicYear feeInstallments paymentHistory paidAmount totalFees");
  const feeStudentIds = new Set(currentFees.map((fees) => String(fees.student)));
  const activeWithoutFees = activeStudents.filter((student) => !feeStudentIds.has(String(student._id)));
  const feesMissingInstallments = currentFees.filter(
    (fees) => !Array.isArray(fees.feeInstallments) || fees.feeInstallments.length === 0
  );
  const families = await Family.find({ status: "active" }).select("familyKey displayName primaryPhone");
  const familyKeyCounts = families.reduce((counts, family) => {
    const key = family.familyKey || `no-key:${family._id}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const duplicateFamilyKeys = Object.entries(familyKeyCounts).filter(([, count]) => count > 1);

  console.log("Family Fee Readiness Audit");
  console.log("==========================");
  console.log(`Active students: ${activeStudents.length}`);
  console.log(`Active families: ${families.length}`);
  console.log(`Students without family: ${studentsWithoutFamily.length}`);
  console.log(`Students without current enrollment: ${activeWithoutEnrollment.length}`);
  console.log(`Students without current fees: ${activeWithoutFees.length}`);
  console.log(`Current fees missing installments: ${feesMissingInstallments.length}`);
  console.log(`Duplicate family keys: ${duplicateFamilyKeys.length}`);

  const preview = (label, records, formatter) => {
    if (!records.length) return;
    console.log(`\n${label}:`);
    records.slice(0, 20).forEach((record, index) => {
      console.log(`${index + 1}. ${formatter(record)}`);
    });
  };

  preview("Students without family", studentsWithoutFamily, (student) =>
    `${student.firstName} ${student.lastName} (${student.studentId})`
  );
  preview("Students without current enrollment", activeWithoutEnrollment, (student) =>
    `${student.firstName} ${student.lastName} (${student.studentId})`
  );
  preview("Students without current fees", activeWithoutFees, (student) =>
    `${student.firstName} ${student.lastName} (${student.studentId})`
  );
  preview("Duplicate family keys", duplicateFamilyKeys, ([key, count]) => `${key}: ${count}`);
};

main()
  .catch((error) => {
    console.error("Family fee readiness audit failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
