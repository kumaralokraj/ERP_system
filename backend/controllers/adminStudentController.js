import Student from '../models/Student.js';
import ClassSession from '../models/ClassSession.js';
import { v2 as cloudinary } from "cloudinary";
import Fees from '../models/Fees.js';
import FamilyPayment from '../models/FamilyPayment.js';
import MasterClass from '../models/Class.js';
import LegacyClass from '../models/LegacyClass.js';
import StudentEnrollment from '../models/StudentEnrollment.js';
import StudentUniform from '../models/StudentUniform.js';
import StudentBook from '../models/StudentBook.js';
import Book from '../models/Book.js';
import UniformInventory from '../models/UniformInventory.js';
import Announcement from '../models/Announcement.js';
import {
    BLOOD_TYPES,
    STUDENT_SEX_OPTIONS,
    getFriendlyMongooseError,
    isFutureDate,
    isValidEmail,
    isValidObjectId,
    isValidPhone,
    normalizeAcademicYear,
    normalizeDigits,
    normalizeEmail,
    sendValidationError,
    trimString,
} from '../utils/requestValidation.js';
import {
    attachAcademicContextToFeesRecords,
    attachAcademicContextToStudents,
    calculateFeeBreakdownTotal,
    calculateStudentFeeBreakdown,
    getClassSessionById,
    normalizeStudentFeeSettings,
    syncStudentOperationalRecords,
    upsertCurrentEnrollment,
} from '../services/academicStructureService.js';
import { assignFamilyToStudentRecord } from '../services/familyIdentityService.js';
import { buildStudentStatement } from '../services/studentFeeLedgerService.js';
import { normalizeTuitionConcession } from '../utils/tuitionConcession.js';

const STUDENT_SEARCH_LIMIT = 10;
const STUDENT_SEARCH_CANDIDATE_LIMIT = 60;
const STUDENT_SEARCH_MAX_LENGTH = 50;

const escapeRegExp = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeSearchQuery = (value) =>
    trimString(value)
        .replace(/\s+/g, " ")
        .slice(0, STUDENT_SEARCH_MAX_LENGTH);

const formatStudentName = (student = {}) =>
    trimString(student.name) || `${trimString(student.firstName)} ${trimString(student.lastName)}`.trim();

const getAdmissionNo = (student = {}) => trimString(student.admissionNo) || trimString(student.studentId);

const getFatherName = (student = {}) =>
    trimString(student.parent?.fatherName) || trimString(student.parentName);

const getMotherName = (student = {}) => trimString(student.parent?.motherName);

const getParentPhone = (student = {}) =>
    normalizeDigits(student.parent?.phone || student.parentPhone || student.phone);

const getStudentAcademicYear = (student = {}) =>
    normalizeAcademicYear(student?.academicYear) ||
    trimString(student?.academicYear) ||
    normalizeAcademicYear(student?.currentEnrollment?.academicYear) ||
    trimString(student?.currentEnrollment?.academicYear) ||
    normalizeAcademicYear(student?.classSession?.academicYear) ||
    trimString(student?.classSession?.academicYear) ||
    normalizeAcademicYear(student?.class?.academicYear) ||
    trimString(student?.class?.academicYear);

const getEffectiveFeesTotal = (feesRecord = {}, classRecord = null) => {
    const recordedTotal = Number(feesRecord?.totalFees || 0);
    const recordedBreakdownTotal = calculateFeeBreakdownTotal(feesRecord?.feeBreakdown || {});
    if (Array.isArray(feesRecord?.feeInstallments) && feesRecord.feeInstallments.length > 0 && recordedBreakdownTotal > 0) {
        return recordedBreakdownTotal;
    }

    const settings = normalizeStudentFeeSettings({
        ...(feesRecord?.student?.feeSettings || {}),
        ...(feesRecord?.feeSettings || {}),
    });
    const classBreakdown = calculateStudentFeeBreakdown(classRecord || feesRecord?.class, settings);
    const classTotal = calculateFeeBreakdownTotal(classBreakdown);
    if (classTotal > 0) {
        return classTotal;
    }

    return recordedTotal;
};

const getLedgerStatus = ({ totalFees = 0, paidAmount = 0, remaining = 0 } = {}) => {
    const total = Math.max(Number(totalFees || 0), 0);
    const paid = Math.max(Number(paidAmount || 0), 0);
    const pending = Number.isFinite(Number(remaining))
        ? Math.max(Number(remaining || 0), 0)
        : Math.max(total - paid, 0);

    if (total <= 0 && paid <= 0) return "pending";
    if (pending <= 0) return "paid";
    if (paid > 0) return "partial";
    return "pending";
};

const toId = (value) => String(value?._id || value || "");
const toPaise = (amount = 0) => Math.round((Number(amount) || 0) * 100);
const fromPaise = (amountPaise = 0) => Math.round(Number(amountPaise || 0)) / 100;

const isFamilyPaymentEntry = (payment = {}) =>
    Boolean(payment.familyPaymentId || payment.familyId || payment.familyTransactionId) ||
    ["family_payment", "advance_application"].includes(trimString(payment.entryType));

const getStandaloneCollectedPaise = (feesRecord = {}) => {
    const history = Array.isArray(feesRecord.paymentHistory) ? feesRecord.paymentHistory : [];
    let historyTotalPaise = 0;
    let standalonePaise = 0;

    history.forEach((payment) => {
        const amountPaise = toPaise(payment?.amount || 0);
        if (amountPaise <= 0) return;

        historyTotalPaise += amountPaise;
        if (!isFamilyPaymentEntry(payment)) {
            standalonePaise += amountPaise;
        }
    });

    const missingHistoryPaise = Math.max(toPaise(feesRecord.paidAmount || 0) - historyTotalPaise, 0);
    return standalonePaise + missingHistoryPaise;
};

const compareFeeRowsForShare = (left = {}, right = {}) => {
    const leftStudent = left.student || {};
    const rightStudent = right.student || {};
    return (
        formatStudentName(leftStudent).localeCompare(formatStudentName(rightStudent)) ||
        getAdmissionNo(leftStudent).localeCompare(getAdmissionNo(rightStudent)) ||
        toId(leftStudent._id).localeCompare(toId(rightStudent._id))
    );
};

const splitPaiseEqually = (amountPaise = 0, rows = []) => {
    const orderedRows = [...rows].sort(compareFeeRowsForShare);
    const split = new Map();
    if (orderedRows.length === 0) return split;

    const baseShare = Math.floor(Math.max(Number(amountPaise || 0), 0) / orderedRows.length);
    let residue = Math.max(Number(amountPaise || 0), 0) - baseShare * orderedRows.length;

    orderedRows.forEach((row) => {
        const studentId = toId(row.student?._id);
        split.set(studentId, baseShare + (residue > 0 ? 1 : 0));
        if (residue > 0) residue -= 1;
    });

    return split;
};

const settleCollectedShares = (rows = [], initialShareIndex = new Map()) => {
    const orderedRows = [...rows].sort(compareFeeRowsForShare);
    const settledIndex = new Map(initialShareIndex);
    let excessPaise = 0;

    orderedRows.forEach((row) => {
        const studentId = toId(row.student?._id);
        const duePaise = toPaise(row.totalFees || 0);
        const sharePaise = settledIndex.get(studentId) || 0;
        if (sharePaise <= duePaise) return;

        excessPaise += sharePaise - duePaise;
        settledIndex.set(studentId, duePaise);
    });

    orderedRows.forEach((row) => {
        if (excessPaise <= 0) return;

        const studentId = toId(row.student?._id);
        const duePaise = toPaise(row.totalFees || 0);
        const currentSharePaise = settledIndex.get(studentId) || 0;
        const pendingPaise = Math.max(duePaise - currentSharePaise, 0);
        const settlementPaise = Math.min(pendingPaise, excessPaise);
        if (settlementPaise <= 0) return;

        settledIndex.set(studentId, currentSharePaise + settlementPaise);
        excessPaise -= settlementPaise;
    });

    return settledIndex;
};

const buildFeeRecordFromStudentStatement = (statement = {}) => {
    const student = statement.student || {};
    const totals = statement.totals || {};
    const totalFees = Math.max(Number(totals.totalDue || 0), 0);
    const paidAmount = Math.max(Number(totals.paidAmount || 0), 0);
    const remaining = Math.max(Number(totals.pendingAmount || 0), 0);

    return {
        _id: statement.feesRecordId || statement.studentId,
        student: {
            _id: statement.studentId,
            name: student.name,
            firstName: student.name,
            lastName: "",
            studentId: student.admissionNo,
            admissionNo: student.admissionNo,
            phone: student.parentPhone,
            parentName: student.parentName,
            parentPhone: student.parentPhone,
        },
        academicYear: statement.academicYear,
        totalFees,
        paidAmount,
        remaining,
        status: getLedgerStatus({ totalFees, paidAmount, remaining }),
        source: statement.source || "student_ledger",
        months: statement.months || [],
    };
};

const formatClassSessionLabel = (classSession) => {
    if (!classSession) {
        return "N/A";
    }

    if (classSession.displayName) {
        return classSession.displayName;
    }

    const className = classSession.name || classSession.classId?.name || "";
    const section = classSession.section ? `-${classSession.section}` : "";
    const academicYear = classSession.academicYear ? ` (${classSession.academicYear})` : "";
    return `${className}${section}${academicYear}`.trim() || "N/A";
};

const findMatchingClassIdsForSearch = async (searchRegex) => {
    const [masterClasses, classSessions, legacyClasses] = await Promise.all([
        MasterClass.find({ name: searchRegex }).select("_id name").lean(),
        ClassSession.find()
            .select("_id classId academicYear section")
            .populate({ path: "classId", select: "name" })
            .lean(),
        LegacyClass.find().select("_id name academicYear section").lean(),
    ]);

    const matchedClassIds = new Set();
    const matchedMasterClassIds = new Set(masterClasses.map((classRecord) => String(classRecord._id)));

    classSessions.forEach((classSession) => {
        const className = trimString(classSession.classId?.name);
        const section = trimString(classSession.section);
        const academicYear = trimString(classSession.academicYear);
        const labels = [
            className,
            section,
            academicYear,
            `${className}-${section}`,
            `${className} ${section}`,
            `${className}-${section} (${academicYear})`,
            `${className} ${section} ${academicYear}`,
        ].filter(Boolean);

        if (
            matchedMasterClassIds.has(String(classSession.classId?._id || classSession.classId)) ||
            labels.some((label) => searchRegex.test(label))
        ) {
            matchedClassIds.add(String(classSession._id));
        }
    });

    legacyClasses.forEach((legacyClass) => {
        const className = trimString(legacyClass.name);
        const section = trimString(legacyClass.section);
        const academicYear = trimString(legacyClass.academicYear);
        const labels = [
            className,
            section,
            academicYear,
            `${className}-${section}`,
            `${className} ${section}`,
            `${className}-${section} (${academicYear})`,
            `${className} ${section} ${academicYear}`,
        ].filter(Boolean);

        if (labels.some((label) => searchRegex.test(label))) {
            matchedClassIds.add(String(legacyClass._id));
        }
    });

    return [...matchedClassIds];
};

const getSearchPriority = ({ result, query, digitQuery }) => {
    const normalizedQuery = query.toLowerCase();
    const admissionNo = trimString(result.admissionNo).toLowerCase();
    const phoneValues = [result.phone, result.studentPhone].map(normalizeDigits).filter(Boolean);
    const name = trimString(result.name).toLowerCase();
    const parentNames = [result.fatherName, result.motherName]
        .map((value) => trimString(value).toLowerCase())
        .filter(Boolean);
    const className = trimString(result.className).toLowerCase();

    if (admissionNo && admissionNo === normalizedQuery) {
        return 0;
    }

    if (digitQuery && phoneValues.some((phone) => phone === digitQuery)) {
        return 1;
    }

    if (name.startsWith(normalizedQuery) || name.includes(normalizedQuery)) {
        return 2;
    }

    if (parentNames.some((parentName) => parentName.includes(normalizedQuery))) {
        return 3;
    }

    if (className.includes(normalizedQuery)) {
        return 4;
    }

    return 5;
};

const parseBooleanField = (value, defaultValue = true) => {
    if (value === undefined || value === null || value === "") {
        return defaultValue;
    }

    if (typeof value === "boolean") {
        return value;
    }

    const normalizedValue = trimString(value).toLowerCase();
    return ["true", "1", "yes", "on"].includes(normalizedValue);
};

const parseOptionalNonNegativeNumber = (value) => {
    if (value === undefined || value === null || trimString(value) === "") {
        return null;
    }

    return Number(value);
};

const haveFeeSettingsChanged = (currentSettings = {}, nextSettings = {}) => {
    const currentNormalized = normalizeStudentFeeSettings(currentSettings);
    const nextNormalized = normalizeStudentFeeSettings(nextSettings);

    return (
        currentNormalized.transportOpted !== nextNormalized.transportOpted ||
        currentNormalized.transportFee !== nextNormalized.transportFee ||
        currentNormalized.admissionFeeOverride !== nextNormalized.admissionFeeOverride ||
        JSON.stringify(currentNormalized.tuitionConcession) !==
            JSON.stringify(nextNormalized.tuitionConcession)
    );
};

const buildStudentPayload = (body = {}, { includePassword = true } = {}) => {
    const firstName = trimString(body.firstName);
    const lastName = trimString(body.lastName);
    const parentName = trimString(body.parentName) || undefined;
    const parentPhone = normalizeDigits(body.parent?.phone || body.parentPhone) || undefined;
    const admissionFeeOverride = parseOptionalNonNegativeNumber(
        body.feeSettings?.admissionFeeOverride ?? body.admissionFeeOverride
    );
    const transportOpted = parseBooleanField(
        body.feeSettings?.transportOpted ?? body.transportOpted,
        true
    );
    const transportFee = transportOpted
        ? Number(body.feeSettings?.transportFee ?? body.transportFee ?? 0)
        : 0;
    const tuitionConcession = normalizeTuitionConcession({
        type:
            body.feeSettings?.tuitionConcession?.type ??
            body.tuitionConcessionType ??
            body.concessionType,
        value:
            body.feeSettings?.tuitionConcession?.value ??
            body.tuitionConcessionValue ??
            body.concessionValue,
        reason:
            body.feeSettings?.tuitionConcession?.reason ??
            body.tuitionConcessionReason ??
            body.concessionReason,
        isActive: parseBooleanField(
            body.feeSettings?.tuitionConcession?.isActive ??
                body.tuitionConcessionActive ??
                body.concessionActive,
            true
        ),
    });

    const studentData = {
        username: trimString(body.username),
        email: normalizeEmail(body.email),
        password: body.password || "",
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        phone: normalizeDigits(body.phone),
        address: trimString(body.address) || undefined,
        bloodType: trimString(body.bloodType) || undefined,
        birthday: body.birthday || undefined,
        sex: trimString(body.sex) || "Male",
        studentId: trimString(body.studentId),
        admissionNo: trimString(body.admissionNo || body.studentId),
        class: trimString(body.classSessionId || body.class),
        section: trimString(body.section).toUpperCase() || undefined,
        parentName,
        parentPhone,
        parentEmail: normalizeEmail(body.parentEmail) || undefined,
        parent: {
            fatherName: trimString(body.parent?.fatherName || body.fatherName) || parentName,
            motherName: trimString(body.parent?.motherName || body.motherName) || undefined,
            phone: parentPhone,
        },
        feeSettings: {
            transportOpted,
            transportFee,
            admissionFeeOverride,
            tuitionConcession,
        },
    };

    if (!includePassword || !studentData.password) {
        delete studentData.password;
    }

    return studentData;
};

const validateStudentPayload = async (
    studentData,
    { requirePassword = true, excludeStudentId = null } = {}
) => {
    if (
        !studentData.username ||
        !studentData.email ||
        !studentData.firstName ||
        !studentData.lastName ||
        !studentData.phone ||
        !studentData.studentId ||
        !studentData.class
    ) {
        return { statusCode: 400, message: "Please fill in all required student fields" };
    }

    if (requirePassword && !studentData.password) {
        return { statusCode: 400, message: "Password is required" };
    }

    if (studentData.password && studentData.password.length < 6) {
        return { statusCode: 400, message: "Password must be at least 6 characters" };
    }

    if (!isValidEmail(studentData.email)) {
        return { statusCode: 400, message: "Please provide a valid email address" };
    }

    if (!isValidPhone(studentData.phone)) {
        return { statusCode: 400, message: "Phone number must be 10 to 15 digits" };
    }

    if (studentData.parentPhone && !isValidPhone(studentData.parentPhone)) {
        return { statusCode: 400, message: "Parent phone number must be 10 to 15 digits" };
    }

    if (studentData.parentEmail && !isValidEmail(studentData.parentEmail)) {
        return { statusCode: 400, message: "Please provide a valid parent email address" };
    }

    if (studentData.bloodType && !BLOOD_TYPES.includes(studentData.bloodType)) {
        return { statusCode: 400, message: "Please select a valid blood type" };
    }

    if (!STUDENT_SEX_OPTIONS.includes(studentData.sex)) {
        return { statusCode: 400, message: "Please select a valid sex" };
    }

    if (studentData.birthday && isFutureDate(studentData.birthday)) {
        return { statusCode: 400, message: "Birthday cannot be in the future" };
    }

    if (!isValidObjectId(studentData.class)) {
        return { statusCode: 400, message: "Selected class session is invalid" };
    }

    const classSession = await getClassSessionById(studentData.class);
    if (!classSession) {
        return { statusCode: 404, message: "Class session not found" };
    }

    const transportFee = Number(studentData.feeSettings?.transportFee || 0);
    if (!Number.isFinite(transportFee) || transportFee < 0) {
        return { statusCode: 400, message: "Transport fee must be 0 or greater" };
    }

    const admissionFeeOverride = studentData.feeSettings?.admissionFeeOverride;
    const hasAdmissionFeeOverride = admissionFeeOverride !== null && admissionFeeOverride !== undefined;
    const baseAdmissionFee = Number(classSession.fees?.admission || 0);

    if (
        hasAdmissionFeeOverride &&
        (!Number.isFinite(admissionFeeOverride) || admissionFeeOverride < 0)
    ) {
        return { statusCode: 400, message: "Admission fee concession must be 0 or greater" };
    }

    if (hasAdmissionFeeOverride && admissionFeeOverride > baseAdmissionFee) {
        return {
            statusCode: 400,
            message: `Admission fee concession cannot exceed the class admission fee of Rs. ${baseAdmissionFee}`,
        };
    }

    const tuitionConcession = studentData.feeSettings?.tuitionConcession || {};
    const baseAnnualTuition = Number(classSession.fees?.tuition || 0);
    const lowestMonthlyTuition = Math.floor((baseAnnualTuition / 12) * 100) / 100;

    if (tuitionConcession.value < 0 || !Number.isFinite(tuitionConcession.value)) {
        return { statusCode: 400, message: "Tuition concession value must be 0 or greater" };
    }

    if (tuitionConcession.type === "fixed" && tuitionConcession.value > lowestMonthlyTuition) {
        return {
            statusCode: 400,
            message: `Fixed tuition concession cannot exceed the monthly tuition fee of Rs. ${lowestMonthlyTuition}`,
        };
    }

    if (tuitionConcession.type === "percentage" && tuitionConcession.value > 100) {
        return { statusCode: 400, message: "Percentage tuition concession cannot exceed 100%" };
    }

    if (tuitionConcession.reason?.length > 200) {
        return { statusCode: 400, message: "Tuition concession reason must be 200 characters or fewer" };
    }

    const duplicateEmailQuery = { email: studentData.email };
    if (excludeStudentId) {
        duplicateEmailQuery._id = { $ne: excludeStudentId };
    }

    const existingStudentWithEmail = await Student.findOne(duplicateEmailQuery);
    if (existingStudentWithEmail) {
        return { statusCode: 400, message: "Student with this email already exists" };
    }

    const duplicateStudentIdQuery = { studentId: studentData.studentId };
    if (excludeStudentId) {
        duplicateStudentIdQuery._id = { $ne: excludeStudentId };
    }

    const existingStudentWithStudentId = await Student.findOne(duplicateStudentIdQuery);
    if (existingStudentWithStudentId) {
        return { statusCode: 400, message: "Student with this student ID already exists" };
    }

    return { statusCode: 200, classSession };
};

const releaseIssuedBooksForStudent = async (studentId) => {
    const issuedBooks = await StudentBook.find({
        studentId,
        status: 'issued',
        bookId: { $ne: null },
    }).select('bookId');

    if (issuedBooks.length === 0) {
        return;
    }

    const issuedCountByBook = issuedBooks.reduce((accumulator, record) => {
        const bookId = record.bookId?.toString();
        if (!bookId) {
            return accumulator;
        }

        accumulator[bookId] = (accumulator[bookId] || 0) + 1;
        return accumulator;
    }, {});

    await Promise.all(
        Object.entries(issuedCountByBook).map(async ([bookId, issuedCount]) => {
            const book = await Book.findById(bookId);
            if (!book) {
                return;
            }

            book.issuedCount = Math.max(0, book.issuedCount - issuedCount);
            book.availableStock = Math.max(
                0,
                book.totalStock - book.issuedCount - book.damagedCount
            );
            await book.save();
        })
    );
};

// Get all students
export const getAllStudents = async (req, res) => {
    try {
        const students = await attachAcademicContextToStudents(await Student.find());
        res.status(200).json({ message: 'Students fetched successfully', students });
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export const getStudentsByClassName = async (req, res) => {
    try {
        const requestedClassName = trimString(req.params.className);
        if (!requestedClassName) {
            return sendValidationError(res, 'Class name is required');
        }

        const requestedClassKey = requestedClassName.toLowerCase();
        const requestLooksLikeObjectId = isValidObjectId(requestedClassName);

        const students = await attachAcademicContextToStudents(await Student.find());
        const filteredStudents = students.filter((student) => {
            const classRecord = student.classSession || student.class || null;

            const rawKeys = [
                classRecord?._id,
                classRecord?.name,
                classRecord?.displayName,
                student.class?._id,
                student.class?.name,
                student.class?.displayName,
            ];

            const normalizedKeys = [...new Set(
                rawKeys
                    .map((value) => trimString(String(value ?? '')))
                    .filter(Boolean)
                    .map((value) => value.toLowerCase())
            )];

            if (requestLooksLikeObjectId) {
                return normalizedKeys.includes(requestedClassKey);
            }

            return normalizedKeys.some((key) => (
                key === requestedClassKey ||
                key.startsWith(`${requestedClassKey}-`) ||
                key.startsWith(`${requestedClassKey} (`)
            ));
        });

        res.status(200).json({
            success: true,
            count: filteredStudents.length,
            students: filteredStudents,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const searchStudentsForFees = async (req, res) => {
    try {
        const query = normalizeSearchQuery(req.query.q);

        if (!query || query.length < 2) {
            return res.status(200).json([]);
        }

        const escapedQuery = escapeRegExp(query);
        const searchRegex = new RegExp(escapedQuery, "i");
        const exactRegex = new RegExp(`^${escapedQuery}$`, "i");
        const digitQuery = normalizeDigits(query);
        const digitRegex = digitQuery ? new RegExp(escapeRegExp(digitQuery), "i") : null;
        const classIds = await findMatchingClassIdsForSearch(searchRegex);

        const orConditions = [
            { studentId: exactRegex },
            { admissionNo: exactRegex },
            { studentId: searchRegex },
            { admissionNo: searchRegex },
            { name: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex },
            {
                $expr: {
                    $regexMatch: {
                        input: {
                            $concat: [
                                { $ifNull: ["$firstName", ""] },
                                " ",
                                { $ifNull: ["$lastName", ""] },
                            ],
                        },
                        regex: escapedQuery,
                        options: "i",
                    },
                },
            },
            { username: searchRegex },
            { parentName: searchRegex },
            { "parent.fatherName": searchRegex },
            { "parent.motherName": searchRegex },
            { section: searchRegex },
        ];

        if (digitRegex) {
            orConditions.push(
                { phone: digitRegex },
                { parentPhone: digitRegex },
                { "parent.phone": digitRegex }
            );
        }

        if (classIds.length > 0) {
            orConditions.push({ class: { $in: classIds } });
        }

        const students = await Student.find({ $or: orConditions })
            .select(
                "name firstName lastName username studentId admissionNo email phone parentName parentPhone parentEmail parent class section status feeSettings"
            )
            .limit(STUDENT_SEARCH_CANDIDATE_LIMIT)
            .lean();

        if (students.length === 0) {
            return res.status(200).json([]);
        }

        const studentsWithAcademicContext = await attachAcademicContextToStudents(students);

        const rankedResults = studentsWithAcademicContext
            .map((student) => {
                const classRecord = student.classSession || student.class || null;
                const result = {
                    id: String(student._id),
                    name: formatStudentName(student),
                    admissionNo: getAdmissionNo(student),
                    className: formatClassSessionLabel(classRecord),
                    fatherName: getFatherName(student),
                    motherName: getMotherName(student),
                    phone: getParentPhone(student),
                    studentPhone: normalizeDigits(student.phone),
                    pendingFees: 0,
                    totalFees: 0,
                    paidAmount: 0,
                    status: "pending",
                };

                return {
                    ...result,
                    priority: getSearchPriority({ result, query, digitQuery }),
                };
            })
            .sort((firstResult, secondResult) => {
                if (firstResult.priority !== secondResult.priority) {
                    return firstResult.priority - secondResult.priority;
                }

                return firstResult.name.localeCompare(secondResult.name);
            })
            .slice(0, STUDENT_SEARCH_LIMIT);

        const requestedAcademicYear =
            normalizeAcademicYear(req.query.academicYear) || trimString(req.query.academicYear);
        const results = await Promise.all(
            rankedResults.map(async ({ priority, studentPhone, ...result }) => {
                try {
                    const statement = await buildStudentStatement({
                        studentId: result.id,
                        academicYear: requestedAcademicYear,
                    });

                    if (!statement.error) {
                        const totalFees = Number(statement.totals?.totalDue || 0);
                        const paidAmount = Number(statement.totals?.paidAmount || 0);
                        const pendingFees = Number(statement.totals?.pendingAmount || 0);

                        return {
                            ...result,
                            pendingFees,
                            totalFees,
                            paidAmount,
                            status: getLedgerStatus({
                                totalFees,
                                paidAmount,
                                remaining: pendingFees,
                            }),
                        };
                    }
                } catch (error) {
                    console.warn(`Unable to build fee ledger for search result ${result.id}:`, error.message);
                }

                return result;
            })
        );

        return res.status(200).json(results);
    } catch (error) {
        console.error("Error searching students for fees:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to search students right now",
        });
    }
};

// Create a new student
export const createStudent = async (req, res) => {
    try {
        const studentData = buildStudentPayload(req.body, { includePassword: true });
        const validationResult = await validateStudentPayload(studentData, {
            requirePassword: true,
        });

        if (validationResult.statusCode !== 200) {
            return res.status(validationResult.statusCode).json({
                success: false,
                message: validationResult.message,
            });
        }

        const { classSession } = validationResult;

        let profileImage = "";

        // Upload profile image (if provided)
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "student_profiles",
                resource_type: "image",
            });

            profileImage = result.secure_url;
        }

        if (profileImage) {
            studentData.photo = profileImage;
        }

        const newStudent = await Student.create(studentData);
        const family = await assignFamilyToStudentRecord(newStudent);

        await upsertCurrentEnrollment({
            studentId: newStudent._id,
            classSessionId: classSession._id,
            academicYear: classSession.academicYear,
            status: 'active',
        });

        await syncStudentOperationalRecords(newStudent._id, classSession, {
            studentStatus: 'active',
        });

        const [student] = await attachAcademicContextToStudents([
            await Student.findById(newStudent._id),
        ]);

        res.status(201).json({
            success: true,
            message: "Student created successfully",
            student,
            familyCode: family?.familyCode || null,
        });
    } catch (err) {
        console.error("Error creating student:", err);
        const friendlyMessage = getFriendlyMongooseError(err, "Internal server error");
        const statusCode = err.code === 11000 || err.name === "ValidationError" ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage,
        });
    }
};

// Update an existing student
export const updateStudent = async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!studentId || !isValidObjectId(studentId)) {
            return sendValidationError(res, "Valid student ID is required");
        }

        const existingStudent = await Student.findById(studentId);
        if (!existingStudent) {
            return res.status(404).json({
                success: false,
                message: "Student not found",
            });
        }

        const includePassword = Boolean(trimString(req.body.password));
        const studentData = buildStudentPayload(req.body, { includePassword });
        const validationResult = await validateStudentPayload(studentData, {
            requirePassword: false,
            excludeStudentId: studentId,
        });

        if (validationResult.statusCode !== 200) {
            return res.status(validationResult.statusCode).json({
                success: false,
                message: validationResult.message,
            });
        }

        const { classSession } = validationResult;

        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "student_profiles",
                resource_type: "image",
            });

            studentData.photo = result.secure_url;
        }

        const hasClassChanged = existingStudent.class?.toString() !== studentData.class;
        const feeSettingsChanged = haveFeeSettingsChanged(
            existingStudent.feeSettings,
            studentData.feeSettings
        );

        const updatedStudentRecord = await Student.findByIdAndUpdate(studentId, studentData, {
            new: true,
            runValidators: true,
        });
        const family = await assignFamilyToStudentRecord(updatedStudentRecord);

        await upsertCurrentEnrollment({
            studentId,
            classSessionId: classSession._id,
            academicYear: classSession.academicYear,
            status: existingStudent.status === 'graduated' ? 'graduated' : 'active',
        });

        if (hasClassChanged || feeSettingsChanged) {
            await syncStudentOperationalRecords(studentId, classSession, {
                studentStatus: existingStudent.status === 'graduated' ? 'graduated' : 'active',
            });
        }

        const [updatedStudent] = await attachAcademicContextToStudents([updatedStudentRecord]);

        res.status(200).json({
            success: true,
            message: "Student updated successfully",
            student: updatedStudent,
            familyCode: family?.familyCode || null,
        });
    } catch (err) {
        console.error("Error updating student:", err);
        const friendlyMessage = getFriendlyMongooseError(err, "Internal server error");
        const statusCode = err.code === 11000 || err.name === "ValidationError" ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage,
        });
    }
};


// Delete a student
export const deleteStudent = async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!studentId || !isValidObjectId(studentId)) {
            return sendValidationError(res, 'Valid student ID is required');
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found',
            });
        }

        await releaseIssuedBooksForStudent(studentId);

        await Promise.all([
            StudentBook.deleteMany({ studentId }),
            StudentUniform.deleteMany({ student: studentId }),
            StudentEnrollment.deleteMany({ studentId }),
            Fees.deleteMany({ student: studentId }),
            UniformInventory.deleteMany({ student: studentId }),
            Student.findByIdAndDelete(studentId),
        ]);

        console.log(`Student with ID ${studentId} hard deleted.`);
        res.status(200).json({ success: true, message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
}

// Get a single student by ID
export const getStudentById = async (req, res) => {
    try {
        const { studentId } = req.params;
        const studentRecord = await Student.findById(studentId);

        if (!studentRecord) {
            return res.status(404).json({
                success: false,
                message: "Student not found",
            });
        }

        const [student] = await attachAcademicContextToStudents([studentRecord]);

        res.status(200).json({
            success: true,
            student,
        });
    } catch (error) {
        console.error("Error fetching student:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getRequestAcademicYear = (req) =>
    normalizeAcademicYear(req.query?.academicYear || req.body?.academicYear) ||
    trimString(req.query?.academicYear || req.body?.academicYear);

export const getStudentFeeStatement = async (req, res) => {
    try {
        const studentId = trimString(req.params.studentId);
        if (!studentId || !isValidObjectId(studentId)) {
            return sendValidationError(res, "Valid student ID is required");
        }

        const result = await buildStudentStatement({
            studentId,
            academicYear: getRequestAcademicYear(req),
        });

        if (result.error) {
            return res.status(result.error.statusCode || 404).json({
                success: false,
                message: result.error.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || "Unable to fetch student statement",
        });
    }
};

//get all fees records
export const getAllFeesRecords = async (req, res) => {
    try {
        const academicYear =
            normalizeAcademicYear(req.query.academicYear) || trimString(req.query.academicYear);
        const scope = trimString(req.query.scope).toLowerCase();
        const students = await attachAcademicContextToStudents(await Student.find());
        const availableAcademicYears = [
            ...new Set(students.map(getStudentAcademicYear).filter(Boolean)),
        ];
        const resolvedAcademicYear =
            academicYear ||
            availableAcademicYears[0] ||
            "";
        const scopedStudents = students.filter((student) => {
            const studentAcademicYear = getStudentAcademicYear(student);
            return scope === "all" || !resolvedAcademicYear || studentAcademicYear === resolvedAcademicYear;
        });
        const studentIds = scopedStudents.map((student) => student._id);
        const feeQuery = { student: { $in: studentIds } };

        if (resolvedAcademicYear) {
            feeQuery.$or = [
                { academicYear: resolvedAcademicYear },
                { academicYear: { $exists: false } },
                { academicYear: "" },
            ];
        }

        if (scope !== "all") {
            feeQuery.$and = [
                {
                    $or: [
                        { isCurrent: true },
                        { isCurrent: { $exists: false } },
                    ],
                },
            ];
        }

        const feeRecords = await attachAcademicContextToFeesRecords(await Fees.find(feeQuery));
        const feesByStudentId = new Map(
            feeRecords.map((feesRecord) => [toId(feesRecord.student?._id || feesRecord.student), feesRecord])
        );
        const familyIds = [
            ...new Set(
                scopedStudents
                    .map((student) => toId(student.familyId))
                    .filter(Boolean)
            ),
        ];
        const familyPayments = familyIds.length > 0
            ? await FamilyPayment.find({
                familyId: { $in: familyIds },
                ...(resolvedAcademicYear ? { academicYear: resolvedAcademicYear } : {}),
                status: "posted",
            }).select("familyId amountCollected")
            : [];
        const familyPaidIndex = familyPayments.reduce((index, payment) => {
            const familyId = toId(payment.familyId);
            index.set(familyId, (index.get(familyId) || 0) + toPaise(payment.amountCollected || 0));
            return index;
        }, new Map());
        const rows = scopedStudents
            .map((student) => {
                const feesRecord = feesByStudentId.get(toId(student._id));
                const feesRecordObject = typeof feesRecord?.toObject === "function" ? feesRecord.toObject() : feesRecord || {};
                const classRecord = student.classSession || student.class || feesRecord?.class || null;
                const totalFees = Math.max(
                    getEffectiveFeesTotal(
                        {
                            ...feesRecordObject,
                            student,
                            class: classRecord,
                        },
                        classRecord
                    ),
                    0
                );

                return {
                    feesRecord: feesRecordObject,
                    student,
                    familyId: toId(student.familyId) || toId(student._id),
                    totalFees,
                    standalonePaidPaise: getStandaloneCollectedPaise(feesRecordObject),
                };
            });
        const rowsByFamily = rows.reduce((groups, row) => {
            groups.set(row.familyId, [...(groups.get(row.familyId) || []), row]);
            return groups;
        }, new Map());
        const paidByStudentId = new Map();

        rowsByFamily.forEach((familyRows, familyId) => {
            const shareIndex = new Map();
            familyRows.forEach((row) => {
                shareIndex.set(toId(row.student?._id), row.standalonePaidPaise);
            });

            splitPaiseEqually(familyPaidIndex.get(familyId) || 0, familyRows).forEach((sharePaise, studentId) => {
                shareIndex.set(studentId, (shareIndex.get(studentId) || 0) + sharePaise);
            });

            settleCollectedShares(familyRows, shareIndex).forEach((paidPaise, studentId) => {
                paidByStudentId.set(studentId, paidPaise);
            });
        });

        const fees = rows.map(({ feesRecord, student, totalFees }) => {
            const paidAmount = Math.min(totalFees, fromPaise(paidByStudentId.get(toId(student?._id)) || 0));
            const remaining = Math.max(totalFees - paidAmount, 0);

            return {
                ...feesRecord,
                _id: feesRecord._id || student._id,
                student,
                academicYear: feesRecord.academicYear || resolvedAcademicYear,
                totalFees,
                paidAmount,
                remaining,
                status: getLedgerStatus({ totalFees, paidAmount, remaining }),
                source: "family_ledger_summary",
            };
        });

        res.status(200).json({
            success: true,
            academicYear: resolvedAcademicYear || academicYear,
            source: "family_ledger_summary",
            skippedFamilies: [],
            fees
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching fees: ' + error.message
        });
    }
}


//Get fees by student ID
export const getFeesByStudentId = async (req, res) => {
    try {
        const studentId = trimString(req.params.studentId);

        if (!studentId || !isValidObjectId(studentId)) {
            return sendValidationError(res, 'Valid student ID is required');
        }

        const statement = await buildStudentStatement({
            studentId,
            academicYear:
                normalizeAcademicYear(req.query.academicYear) || trimString(req.query.academicYear),
        });

        if (statement.error) {
            return res.status(statement.error.statusCode || 404).json({
                success: false,
                message: statement.error.message || 'Fees record not found'
            });
        }

        res.status(200).json({
            success: true,
            data: buildFeeRecordFromStudentStatement(statement)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching fees: ' + error.message
        });
    }
}


//controller for announcements 

export const createAnnouncement = async (req, res) => {
    try {
        const title = trimString(req.body.title);
        const content = trimString(req.body.content);

        if (!title || !content) {
            return sendValidationError(res, "Title and content are required");
        }

        if (title.length > 100) {
            return sendValidationError(res, "Title must be 100 characters or fewer");
        }

        if (content.length > 1000) {
            return sendValidationError(res, "Content must be 1000 characters or fewer");
        }

        const newAnnouncement = await Announcement.create({
            title,
            content
        });
        res.json({
            success: true,
            message: "Announcement created successfully",
            announcement: newAnnouncement
        });
    } catch (err) {
        console.error('Error creating announcement:', err);
        const friendlyMessage = getFriendlyMongooseError(err, "Internal server error : error creating announcement");
        const statusCode = err.name === "ValidationError" ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage,
        });
    }
}


export const deleteAnnouncement = async (req, res) => {
    try {
        const { announcementId } = req.params;
        await Announcement.findByIdAndDelete(announcementId);
        res.status(200).json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({ message: 'Internal server error' });
    }   
}

export const getAllAnnouncements = async (req, res) => {
    try{
        const announcements = await Announcement.find().sort({ createdAt: -1 });
        res.status(200).json({ announcements });
    }catch(error){
        console.error('Error fetching announcements:',error);
        res.status(500).json({message:'Internal server error'});
    }
}
