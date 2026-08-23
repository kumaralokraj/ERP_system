import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../configs/mongodb.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import ClassSession from '../models/ClassSession.js';
import LegacyClass from '../models/LegacyClass.js';
import Book from '../models/Book.js';
import Fees from '../models/Fees.js';
import StudentBook from '../models/StudentBook.js';
import StudentUniform from '../models/StudentUniform.js';
import UniformItem from '../models/UniformItem.js';
import UniformInventory from '../models/UniformInventory.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

if (args.has('--help')) {
  console.log('Usage: npm run migrate:hard-delete:legacy -- [--dry-run]');
  console.log('Required env vars: MONGODB_URI');
  process.exit(0);
}

const buildCountMap = (records = []) => {
  const countMap = new Map();

  for (const record of records) {
    const key = record.bookId?.toString();
    if (!key) {
      continue;
    }

    countMap.set(key, (countMap.get(key) || 0) + 1);
  }

  return countMap;
};

const releaseIssuedBooksForStudent = async (studentId) => {
  const issuedBooks = await StudentBook.find({
    studentId,
    status: 'issued',
    bookId: { $ne: null },
  })
    .select('bookId')
    .lean();

  const countMap = buildCountMap(issuedBooks);

  for (const [bookId, issuedCount] of countMap.entries()) {
    const book = await Book.findById(bookId);
    if (!book) {
      continue;
    }

    const nextIssuedCount = Math.max(0, book.issuedCount - issuedCount);
    const nextAvailableStock = Math.max(0, book.totalStock - nextIssuedCount - book.damagedCount);

    if (!dryRun) {
      book.issuedCount = nextIssuedCount;
      book.availableStock = nextAvailableStock;
      await book.save();
    }
  }
};

const purgeLegacyStudents = async () => {
  const legacyStudents = await Student.collection
    .find({ isDeleted: true }, { projection: { _id: 1 } })
    .toArray();

  const studentIds = legacyStudents.map((student) => student._id);

  if (studentIds.length === 0) {
    return { found: 0, deleted: 0 };
  }

  for (const studentId of studentIds) {
    await releaseIssuedBooksForStudent(studentId);
  }

  if (!dryRun) {
    await Promise.all([
      StudentBook.deleteMany({ studentId: { $in: studentIds } }),
      StudentUniform.deleteMany({ student: { $in: studentIds } }),
      Fees.deleteMany({ student: { $in: studentIds } }),
      UniformInventory.deleteMany({ student: { $in: studentIds } }),
      Student.deleteMany({ _id: { $in: studentIds } }),
    ]);
  }

  return { found: studentIds.length, deleted: studentIds.length };
};

const purgeLegacyTeachers = async () => {
  const legacyTeachers = await Teacher.collection
    .find({ isActive: false }, { projection: { _id: 1 } })
    .toArray();

  if (legacyTeachers.length === 0) {
    return { found: 0, deleted: 0, skipped: 0 };
  }

  const deletableTeacherIds = [];
  let skipped = 0;

  for (const teacher of legacyTeachers) {
    const [assignedSessionCount, assignedLegacyClassCount] = await Promise.all([
      ClassSession.countDocuments({ classTeacher: teacher._id }),
      LegacyClass.countDocuments({ classTeacher: teacher._id }),
    ]);
    const assignedClassCount = assignedSessionCount + assignedLegacyClassCount;
    if (assignedClassCount > 0) {
      skipped += 1;
      continue;
    }

    deletableTeacherIds.push(teacher._id);
  }

  if (!dryRun && deletableTeacherIds.length > 0) {
    await Teacher.deleteMany({ _id: { $in: deletableTeacherIds } });
  }

  return {
    found: legacyTeachers.length,
    deleted: deletableTeacherIds.length,
    skipped,
  };
};

const purgeLegacyUniformItems = async () => {
  const legacyItems = await UniformItem.collection
    .find({ isActive: false }, { projection: { _id: 1, name: 1 } })
    .toArray();

  if (legacyItems.length === 0) {
    return { found: 0, deleted: 0, skipped: 0 };
  }

  let deleted = 0;
  let skipped = 0;

  for (const item of legacyItems) {
    const activeAssignments = await StudentUniform.countDocuments({
      status: { $in: ['issued', 'partial'] },
      uniforms: {
        $elemMatch: {
          itemName: item.name,
          quantity: { $gt: 0 },
        },
      },
    });

    if (activeAssignments > 0) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await UniformItem.deleteOne({ _id: item._id });
    }

    deleted += 1;
  }

  return {
    found: legacyItems.length,
    deleted,
    skipped,
  };
};

const purgeLegacyStudentUniforms = async () => {
  const legacyStudentUniforms = await StudentUniform.collection
    .find({ isActive: false }, { projection: { _id: 1 } })
    .toArray();

  const uniformRecordIds = legacyStudentUniforms.map((record) => record._id);

  if (uniformRecordIds.length === 0) {
    return { found: 0, deleted: 0 };
  }

  if (!dryRun) {
    await StudentUniform.deleteMany({ _id: { $in: uniformRecordIds } });
  }

  return {
    found: uniformRecordIds.length,
    deleted: uniformRecordIds.length,
  };
};

const run = async () => {
  await connectDB();

  console.log(`Running legacy soft-delete purge (${dryRun ? 'dry-run' : 'live'})...`);

  const studentSummary = await purgeLegacyStudents();
  const teacherSummary = await purgeLegacyTeachers();
  const uniformItemSummary = await purgeLegacyUniformItems();
  const studentUniformSummary = await purgeLegacyStudentUniforms();

  console.log('Purge summary:');
  console.log(
    `Students: found=${studentSummary.found}, deleted=${studentSummary.deleted}`
  );
  console.log(
    `Teachers: found=${teacherSummary.found}, deleted=${teacherSummary.deleted}, skippedAssigned=${teacherSummary.skipped}`
  );
  console.log(
    `UniformItems: found=${uniformItemSummary.found}, deleted=${uniformItemSummary.deleted}, skippedAssigned=${uniformItemSummary.skipped}`
  );
  console.log(
    `StudentUniform records: found=${studentUniformSummary.found}, deleted=${studentUniformSummary.deleted}`
  );

  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error('Legacy soft-delete purge failed:', error.message);
  try {
    await mongoose.connection.close();
  } catch {
    // noop
  }
  process.exit(1);
});
