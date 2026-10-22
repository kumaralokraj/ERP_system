import mongoose from 'mongoose';
import UniformItem from '../models/UniformItem.js';
import MasterClass from '../models/Class.js';
import ClassSession from '../models/ClassSession.js';
import LegacyClass from '../models/LegacyClass.js';
import StudentUniform from '../models/StudentUniform.js';
import UniformInventory from '../models/UniformInventory.js';
import UniformIssue from '../models/UniformIssue.js';
import UniformIssueItem from '../models/UniformIssueItem.js';
import InventoryInvoice from '../models/InventoryInvoice.js';
import Student from '../models/Student.js';
import StudentEnrollment from '../models/StudentEnrollment.js';
import {
    UNIFORM_CONDITIONS,
    getFriendlyMongooseError,
    isValidObjectId,
    normalizeDigits,
    sendValidationError,
    toNumber,
    trimString,
} from '../utils/requestValidation.js';
import {
    attachAcademicContextToStudentUniforms,
    attachAcademicContextToStudents,
    resolveClassRecordById,
    serializeClassRecord,
} from '../services/academicStructureService.js';
import {
    calculateUniformStockValue,
    getUniformPriceSummary,
    getUniformSizesWithPrices,
    resolveUniformSizePrice,
} from '../utils/uniformPricing.js';

const STUDENT_SEARCH_LIMIT = 10;
const STUDENT_SEARCH_CANDIDATE_LIMIT = 60;
const STUDENT_SEARCH_MAX_LENGTH = 50;
const PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

const normalizeSizes = (sizes = [], fallbackPrice) =>
    sizes.map((sizeItem) => ({
        size: trimString(sizeItem.size),
        stock: toNumber(sizeItem.stock),
        pricePerItem: normalizePricePerItem(sizeItem.pricePerItem ?? fallbackPrice),
    }));

const normalizePricePerItem = (value) => {
    const pricePerItem = toNumber(value ?? 0);
    return Number.isFinite(pricePerItem) ? pricePerItem : Number.NaN;
};

const calculateLineTotal = (pricePerItem, quantity) => {
    const price = Number(pricePerItem || 0);
    const itemQuantity = Number(quantity || 0);
    return Number.isFinite(price) && Number.isFinite(itemQuantity)
        ? price * itemQuantity
        : 0;
};

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getCommonSizePrice = (sizes = []) => {
    if (sizes.length === 0) {
        return 0;
    }

    const firstPrice = Number(sizes[0].pricePerItem || 0);
    return sizes.every((sizeItem) => Number(sizeItem.pricePerItem || 0) === firstPrice)
        ? firstPrice
        : 0;
};

const generateInvoiceNo = (modulePrefix = 'INV') => {
    const now = new Date();
    const datePart = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('');
    const timePart = String(now.getTime()).slice(-6);
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${modulePrefix}-${datePart}-${timePart}-${randomPart}`;
};

const normalizePaymentMode = (mode) => {
    const normalizedMode = trimString(mode) || 'cash';
    return PAYMENT_MODES.includes(normalizedMode) ? normalizedMode : '';
};

const getInvoicePaymentSummary = (invoices = []) =>
    invoices.reduce(
        (summary, invoice) => {
            const totalAmount = Number(invoice.totalAmount || 0);
            const paidAmount = Number(invoice.paidAmount || 0);
            const balanceAmount = Math.max(totalAmount - paidAmount, 0);

            return {
                invoiceCount: summary.invoiceCount + 1,
                pendingInvoiceCount:
                    summary.pendingInvoiceCount + (invoice.issueStatus === 'pending' ? 1 : 0),
                paidInvoiceCount:
                    summary.paidInvoiceCount + (invoice.paymentStatus === 'paid' ? 1 : 0),
                issuedInvoiceCount:
                    summary.issuedInvoiceCount + (invoice.issueStatus === 'issued' ? 1 : 0),
                invoiceTotal: summary.invoiceTotal + totalAmount,
                invoicePaid: summary.invoicePaid + paidAmount,
                invoiceBalance: summary.invoiceBalance + balanceAmount,
            };
        },
        {
            invoiceCount: 0,
            pendingInvoiceCount: 0,
            paidInvoiceCount: 0,
            issuedInvoiceCount: 0,
            invoiceTotal: 0,
            invoicePaid: 0,
            invoiceBalance: 0,
        }
    );

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSearchQuery = (value) =>
    trimString(value)
        .replace(/\s+/g, ' ')
        .slice(0, STUDENT_SEARCH_MAX_LENGTH);

const toIdString = (value) => {
    if (!value) {
        return '';
    }

    if (typeof value === 'object') {
        return String(value._id || value.id || value);
    }

    return String(value);
};

const getClassIdCandidates = (classRecord, fallbackClassId = '') => {
    const classIdCandidates = new Set();

    if (fallbackClassId) {
        classIdCandidates.add(toIdString(fallbackClassId));
    }

    if (classRecord?._id) {
        classIdCandidates.add(toIdString(classRecord._id));
    }

    if (classRecord?.legacyClassId) {
        classIdCandidates.add(toIdString(classRecord.legacyClassId));
    }

    return [...classIdCandidates].filter(Boolean);
};

const getStudentIdsForClassRecord = async (classRecord, fallbackClassId = '') => {
    const classIdCandidates = getClassIdCandidates(classRecord, fallbackClassId);

    if (classIdCandidates.length === 0) {
        return [];
    }

    const directStudentIdsPromise = Student.find({
        class: { $in: classIdCandidates },
    }).distinct('_id');

    const enrollmentStudentIdsPromise =
        classRecord?.source === 'session' && classRecord?._id
            ? StudentEnrollment.find({
                classSessionId: classRecord._id,
                isCurrent: true,
            }).distinct('studentId')
            : Promise.resolve([]);

    const [directStudentIds, enrollmentStudentIds] = await Promise.all([
        directStudentIdsPromise,
        enrollmentStudentIdsPromise,
    ]);

    return [
        ...new Set(
            [...directStudentIds, ...enrollmentStudentIds]
                .map((studentId) => toIdString(studentId))
                .filter(Boolean)
        ),
    ];
};

const buildPendingUniformRecord = (student, classRecord) => ({
    _id: `pending-${toIdString(student?._id)}`,
    student,
    class: classRecord || student?.class || null,
    uniforms: [],
    status: 'pending',
    totalUniformsIssued: 0,
    notes: 'Uniform not issued yet',
    createdAt: student?.createdAt || null,
    updatedAt: student?.updatedAt || null,
});

const formatStudentName = (student = {}) =>
    trimString(student.name) || `${trimString(student.firstName)} ${trimString(student.lastName)}`.trim();

const getAdmissionNo = (student = {}) => trimString(student.admissionNo) || trimString(student.studentId);

const getFatherName = (student = {}) =>
    trimString(student.parent?.fatherName) || trimString(student.parentName);

const getMotherName = (student = {}) => trimString(student.parent?.motherName);

const getParentPhone = (student = {}) =>
    normalizeDigits(student.parent?.phone || student.parentPhone || student.phone);

const formatClassLabel = (classRecord) => {
    if (!classRecord) {
        return 'N/A';
    }

    if (classRecord.displayName) {
        return classRecord.displayName;
    }

    const className = trimString(classRecord.name || classRecord.classId?.name);
    const section = trimString(classRecord.section);
    const academicYear = trimString(classRecord.academicYear);
    const classWithSection = section ? `${className}-${section}` : className;
    return academicYear ? `${classWithSection} (${academicYear})` : classWithSection || 'N/A';
};

const findMatchingClassIdsForSearch = async (searchRegex) => {
    const [masterClasses, classSessions, legacyClasses] = await Promise.all([
        MasterClass.find({ name: searchRegex }).select('_id name').lean(),
        ClassSession.find()
            .select('_id classId academicYear section')
            .populate({ path: 'classId', select: 'name' })
            .lean(),
        LegacyClass.find().select('_id name academicYear section').lean(),
    ]);

    const matchedClassIds = new Set();
    const matchedMasterClassIds = new Set(masterClasses.map((classRecord) => toIdString(classRecord._id)));

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
            matchedMasterClassIds.has(toIdString(classSession.classId?._id || classSession.classId)) ||
            labels.some((label) => searchRegex.test(label))
        ) {
            matchedClassIds.add(toIdString(classSession._id));
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
            matchedClassIds.add(toIdString(legacyClass._id));
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

const summarizeUniformRecord = (studentUniform, catalogItemCount = 0) => {
    const uniforms = Array.isArray(studentUniform?.uniforms) ? studentUniform.uniforms : [];
    const totalIssuedItems = uniforms.reduce(
        (sum, uniform) => sum + Math.max(Number(uniform.quantity || 0), 0),
        0
    );
    const totalIssuedValue = uniforms.reduce((sum, uniform) => {
        const quantity = Math.max(Number(uniform.quantity || 0), 0);
        const storedLineTotal = Number(uniform.lineTotal);
        if (Number.isFinite(storedLineTotal) && storedLineTotal > 0) {
            return sum + storedLineTotal;
        }

        return sum + calculateLineTotal(uniform.pricePerItem, quantity);
    }, 0);
    const issuedItemNames = new Set(
        uniforms
            .filter((uniform) => Number(uniform.quantity || 0) > 0)
            .map((uniform) => trimString(uniform.itemName).toLowerCase())
            .filter(Boolean)
    );
    const pendingItems = catalogItemCount > 0 ? Math.max(catalogItemCount - issuedItemNames.size, 0) : 0;
    const lastIssueDate = uniforms
        .map((uniform) => new Date(uniform.issueDate))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((left, right) => right.getTime() - left.getTime())[0] || null;

    let uniformStatus = 'Pending';
    if (catalogItemCount > 0 && issuedItemNames.size >= catalogItemCount) {
        uniformStatus = 'Complete';
    } else if (totalIssuedItems > 0) {
        uniformStatus = 'Partial';
    }

    return {
        totalIssuedItems,
        totalIssuedValue,
        pendingItems,
        lastIssueDate,
        uniformStatus,
        status: uniformStatus.toLowerCase() === 'complete' ? 'issued' : uniformStatus.toLowerCase(),
    };
};

const buildLegacyLedgerRows = (studentUniform) =>
    (studentUniform?.uniforms || []).map((uniform, index) => ({
        _id: `${studentUniform?._id || 'legacy'}-${index}`,
        itemName: uniform.itemName,
        size: uniform.size,
        quantity: uniform.quantity,
        issueDate: uniform.issueDate,
        issuedAt: uniform.issueDate,
        status: uniform.condition === 'damaged' ? 'damaged' : 'issued',
        condition: uniform.condition || 'good',
        pricePerItem: Number(uniform.pricePerItem || 0),
        lineTotal: Number(uniform.lineTotal || calculateLineTotal(uniform.pricePerItem, uniform.quantity)),
        invoiceNo: uniform.invoiceNo || '',
        invoice: uniform.invoice || null,
        issuedBy: null,
        notes: studentUniform?.notes || '',
        source: 'legacy',
    }));

const isTransactionUnsupportedError = (error) => {
    const message = `${error?.message || ''}`.toLowerCase();
    return (
        message.includes('transaction numbers are only allowed') ||
        message.includes('replica set member or mongos') ||
        message.includes('transactions are not supported')
    );
};

const runWithOptionalTransaction = async (operation) => {
    const session = await mongoose.startSession();

    try {
        let result;
        await session.withTransaction(async () => {
            result = await operation(session);
        });
        return result;
    } catch (error) {
        if (isTransactionUnsupportedError(error)) {
            return operation(null);
        }

        throw error;
    } finally {
        session.endSession();
    }
};

const applySession = (query, session) => (session ? query.session(session) : query);

//UNIFORM ITEMS MANAGEMENT 

export const getAllUniformItems = async (req, res) => {
    try {
        const uniformItems = await UniformItem.find().sort({ name: 1 });

        const itemsWithAvailable = uniformItems.map((item) => {
            const itemObject = item.toObject();
            const sizes = getUniformSizesWithPrices(itemObject);
            const priceSummary = getUniformPriceSummary({ ...itemObject, sizes });
            const available = item.totalStock - item.issued - item.damaged;
            const availableValue = calculateUniformStockValue({ ...itemObject, sizes });

            return {
                ...itemObject,
                sizes,
                ...priceSummary,
                available,
                inventoryValue: availableValue,
                availableValue,
            };
        });

        res.status(200).json({
            success: true,
            message: 'Uniform items retrieved successfully',
            data: itemsWithAvailable,
            total: itemsWithAvailable.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching uniform items',
            error: error.message
        });
    }
};

export const createUniformItem = async (req, res) => {
    try {
        let { name, sizes, description, reorderLevel } = req.body;
        name = trimString(name);
        description = trimString(description);
        reorderLevel = reorderLevel === undefined ? 20 : toNumber(reorderLevel);
        const fallbackPrice = req.body.pricePerItem ?? req.body.price;

        // ✅ VALIDATE AND PARSE SIZES
        if (typeof sizes === 'string') {
            try {
                sizes = JSON.parse(sizes);
            } catch (e) {
                return sendValidationError(res, 'Invalid sizes format. Must be an array of objects with size and stock properties');
            }
        }

        // Validate sizes is an array
        if (!Array.isArray(sizes)) {
            return sendValidationError(res, 'Sizes must be an array');
        }

        const normalizedSizes = normalizeSizes(sizes, fallbackPrice).filter((sizeItem) => sizeItem.size);
        if (normalizedSizes.length === 0) {
            return sendValidationError(res, 'Add at least one size');
        }

        const seenSizes = new Set();
        for (const sizeObj of normalizedSizes) {
            if (!Number.isInteger(sizeObj.stock) || sizeObj.stock <= 0) {
                return sendValidationError(res, 'Stock must be a whole number greater than 0');
            }
            if (!Number.isFinite(sizeObj.pricePerItem) || sizeObj.pricePerItem < 0) {
                return sendValidationError(res, `Price for size ${sizeObj.size} must be 0 or greater`);
            }
            if (seenSizes.has(sizeObj.size)) {
                return sendValidationError(res, 'Each size can only be added once');
            }
            seenSizes.add(sizeObj.size);
        }

        if (!name) {
            return sendValidationError(res, 'Uniform item name is required');
        }

        if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
            return sendValidationError(res, 'Reorder level must be 0 or greater');
        }

        // Check if uniform item already exists
        const existingItem = await UniformItem.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        });
        if (existingItem) {
            return res.status(400).json({
                success: false,
                message: 'Uniform item already exists'
            });
        }

        // Calculate total stock
        const calculatedTotalStock = normalizedSizes.reduce((sum, s) => sum + s.stock, 0);

        const uniformItem = new UniformItem({
            name,
            sizes: normalizedSizes,
            totalStock: calculatedTotalStock,
            issued: 0,
            damaged: 0,
            pricePerItem: getCommonSizePrice(normalizedSizes),
            description: description || '',
            reorderLevel
        });

        await uniformItem.save();

        res.status(201).json({
            success: true,
            message: 'Uniform item created successfully',
            data: uniformItem
        });
    } catch (error) {
        console.error('Error creating uniform item:', error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Error creating uniform item');
        const statusCode = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage
        });
    }
};

export const updateUniformItem = async (req, res) => {
    try {
        const { id } = req.params;
        let { name, sizes, description, reorderLevel } = req.body;
        name = trimString(name);
        description = trimString(description);
        reorderLevel = reorderLevel === undefined ? 20 : toNumber(reorderLevel);
        const fallbackPrice = req.body.pricePerItem ?? req.body.price;

        if (!isValidObjectId(id)) {
            return sendValidationError(res, 'Uniform item ID is invalid');
        }

        // ✅ VALIDATE AND PARSE SIZES
        if (typeof sizes === 'string') {
            try {
                sizes = JSON.parse(sizes);
            } catch (e) {
                return sendValidationError(res, 'Invalid sizes format. Must be an array of objects');
            }
        }

        if (!Array.isArray(sizes)) {
            return sendValidationError(res, 'Sizes must be an array');
        }

        if (!name) {
            return sendValidationError(res, 'Uniform item name is required');
        }

        const normalizedSizes = normalizeSizes(sizes, fallbackPrice).filter((sizeItem) => sizeItem.size);
        if (normalizedSizes.length === 0) {
            return sendValidationError(res, 'Add at least one size');
        }

        const seenSizes = new Set();
        for (const sizeObj of normalizedSizes) {
            if (!Number.isInteger(sizeObj.stock) || sizeObj.stock <= 0) {
                return sendValidationError(res, 'Stock must be a whole number greater than 0');
            }
            if (!Number.isFinite(sizeObj.pricePerItem) || sizeObj.pricePerItem < 0) {
                return sendValidationError(res, `Price for size ${sizeObj.size} must be 0 or greater`);
            }
            if (seenSizes.has(sizeObj.size)) {
                return sendValidationError(res, 'Each size can only be added once');
            }
            seenSizes.add(sizeObj.size);
        }

        if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
            return sendValidationError(res, 'Reorder level must be 0 or greater');
        }

        // Get existing item first
        const existingItem = await UniformItem.findById(id);
        if (!existingItem) {
            return res.status(404).json({
                success: false,
                message: 'Uniform item not found'
            });
        }

        const conflictingItem = await UniformItem.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
            _id: { $ne: id }
        });

        if (conflictingItem) {
            return sendValidationError(res, 'Uniform item already exists');
        }

        // Calculate total stock from sizes
        const calculatedTotalStock =
            normalizedSizes.reduce((sum, s) => sum + s.stock, 0) +
            Number(existingItem.issued || 0) +
            Number(existingItem.damaged || 0);

        const uniformItem = await UniformItem.findByIdAndUpdate(
            id,
            {
                name,
                sizes: normalizedSizes,
                totalStock: calculatedTotalStock,
                pricePerItem: getCommonSizePrice(normalizedSizes),
                description: description || '',
                reorderLevel
            },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Uniform item updated successfully',
            data: uniformItem
        });
    } catch (error) {
        console.error('Error updating uniform item:', error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Error updating uniform item');
        const statusCode = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage
        });
    }
};

export const deleteUniformItem = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            return sendValidationError(res, 'Uniform item ID is invalid');
        }

        const uniformItem = await UniformItem.findById(id);
        if (!uniformItem) {
            return res.status(404).json({
                success: false,
                message: 'Uniform item not found'
            });
        }

        const [activeAssignments, ledgerAssignments] = await Promise.all([
            StudentUniform.countDocuments({
                status: { $in: ['issued', 'partial'] },
                uniforms: {
                    $elemMatch: {
                        itemName: uniformItem.name,
                        quantity: { $gt: 0 },
                    },
                },
            }),
            UniformIssueItem.countDocuments({
                inventoryItem: uniformItem._id,
                status: { $in: ['issued', 'damaged'] },
            }),
        ]);
        const totalAssignments = activeAssignments + ledgerAssignments;

        if (totalAssignments > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete this item while assigned to ${totalAssignments} student ledger record(s).`,
            });
        }

        await UniformItem.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Uniform item deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting uniform item',
            error: error.message
        });
    }
};

// ============ STUDENT UNIFORM MANAGEMENT ============

export const searchStudentsForUniforms = async (req, res) => {
    try {
        const query = normalizeSearchQuery(req.query.q);

        if (!query || query.length < 2) {
            return res.status(200).json([]);
        }

        const escapedQuery = escapeRegex(query);
        const searchRegex = new RegExp(escapedQuery, 'i');
        const exactRegex = new RegExp(`^${escapedQuery}$`, 'i');
        const digitQuery = normalizeDigits(query);
        const digitRegex = digitQuery ? new RegExp(escapeRegex(digitQuery), 'i') : null;
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
                                { $ifNull: ['$firstName', ''] },
                                ' ',
                                { $ifNull: ['$lastName', ''] },
                            ],
                        },
                        regex: escapedQuery,
                        options: 'i',
                    },
                },
            },
            { username: searchRegex },
            { parentName: searchRegex },
            { 'parent.fatherName': searchRegex },
            { 'parent.motherName': searchRegex },
            { section: searchRegex },
        ];

        if (digitRegex) {
            orConditions.push(
                { phone: digitRegex },
                { parentPhone: digitRegex },
                { 'parent.phone': digitRegex }
            );
        }

        if (classIds.length > 0) {
            orConditions.push({ class: { $in: classIds } });
        }

        const students = await Student.find({ $or: orConditions })
            .select(
                'name firstName lastName username studentId admissionNo email phone parentName parentPhone parentEmail parent class section status'
            )
            .limit(STUDENT_SEARCH_CANDIDATE_LIMIT)
            .lean();

        if (students.length === 0) {
            return res.status(200).json([]);
        }

        const studentsWithAcademicContext = await attachAcademicContextToStudents(students);
        const studentIds = studentsWithAcademicContext.map((student) => student._id);
        const [uniformRecords, catalogItemCount] = await Promise.all([
            StudentUniform.find({ student: { $in: studentIds } }).select('student uniforms status').lean(),
            UniformItem.countDocuments(),
        ]);
        const uniformsByStudentId = new Map(
            uniformRecords.map((uniformRecord) => [toIdString(uniformRecord.student), uniformRecord])
        );

        const results = studentsWithAcademicContext
            .map((student) => {
                const uniformRecord = uniformsByStudentId.get(toIdString(student._id));
                const classRecord = student.classSession || student.class || null;
                const summary = summarizeUniformRecord(uniformRecord, catalogItemCount);
                const result = {
                    id: toIdString(student._id),
                    name: formatStudentName(student),
                    admissionNo: getAdmissionNo(student),
                    className: formatClassLabel(classRecord),
                    fatherName: getFatherName(student),
                    motherName: getMotherName(student),
                    phone: getParentPhone(student),
                    studentPhone: normalizeDigits(student.phone),
                    uniformStatus: summary.uniformStatus,
                    pendingItems: summary.pendingItems,
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
            .slice(0, STUDENT_SEARCH_LIMIT)
            .map(({ priority, studentPhone, ...result }) => result);

        return res.status(200).json(results);
    } catch (error) {
        console.error('Error searching students for uniforms:', error);
        return res.status(500).json({
            success: false,
            message: 'Unable to search students right now',
        });
    }
};

export const getStudentUniformsByClass = async (req, res) => {
    try {
        const { classId } = req.params;

        if (!isValidObjectId(classId)) {
            return sendValidationError(res, 'Class ID is invalid');
        }

        const classData = await resolveClassRecordById(classId);
        if (!classData) {
            return res.status(404).json({
                success: false,
                message: 'Class not found',
            });
        }

        const studentIds = await getStudentIdsForClassRecord(classData, classId);

        if (studentIds.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Student uniforms retrieved successfully',
                data: [],
                total: 0,
            });
        }

        const students = await Student.find({ _id: { $in: studentIds } })
            .select('firstName lastName studentId class section status createdAt updatedAt')
            .sort({ firstName: 1, lastName: 1, studentId: 1 });

        const existingUniformRecords = await StudentUniform.find({
            student: { $in: studentIds },
        })
            .populate('student', 'firstName lastName studentId')
            .sort({ updatedAt: -1 });

        const uniformRecordsWithContext = await attachAcademicContextToStudentUniforms(existingUniformRecords);
        const uniformRecordByStudentId = new Map();

        uniformRecordsWithContext.forEach((uniformRecord) => {
            const studentRecordId = toIdString(uniformRecord.student?._id || uniformRecord.student);
            if (studentRecordId && !uniformRecordByStudentId.has(studentRecordId)) {
                uniformRecordByStudentId.set(studentRecordId, uniformRecord);
            }
        });

        const mergedUniformRecords = students.map((student) => {
            const studentId = toIdString(student._id);
            return uniformRecordByStudentId.get(studentId) || buildPendingUniformRecord(student.toObject(), classData);
        });

        res.status(200).json({
            success: true,
            message: 'Student uniforms retrieved successfully',
            data: mergedUniformRecords,
            total: mergedUniformRecords.length,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching student uniforms',
            error: error.message
        });
    }
};

export const getStudentUniformDetails = async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!isValidObjectId(studentId)) {
            return sendValidationError(res, 'Student ID is invalid');
        }

        const student = await Student.findById(studentId)
            .select('name firstName lastName studentId admissionNo phone parentName parentPhone parentEmail parent class section status createdAt updatedAt')
            .lean();

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const [studentWithAcademicContext] = await attachAcademicContextToStudents([student]);
        const classRecord = studentWithAcademicContext.classSession || studentWithAcademicContext.class || null;
        const rawStudentUniform = await StudentUniform.findOne({ student: studentId }).lean();
        const [studentUniformWithClass] = await attachAcademicContextToStudentUniforms(
            [rawStudentUniform || buildPendingUniformRecord(studentWithAcademicContext, classRecord)].filter(Boolean)
        );
        const [issueRecords, issueItems, catalogItemCount, invoices] = await Promise.all([
            UniformIssue.find({ student: studentId })
                .populate('issuedBy', 'name email')
                .sort({ issuedAt: -1 })
                .lean(),
            UniformIssueItem.find({ student: studentId })
                .populate({
                    path: 'issue',
                    select: 'notes issuedBy issuedAt invoice invoiceNo',
                    populate: { path: 'issuedBy', select: 'name email' },
                })
                .sort({ issuedAt: -1 })
                .lean(),
            UniformItem.countDocuments(),
            InventoryInvoice.find({ module: 'uniforms', student: studentId })
                .populate('createdBy', 'name email firstName lastName')
                .populate('issuedBy', 'name email firstName lastName')
                .populate('payments.receivedBy', 'name email firstName lastName')
                .sort({ createdAt: -1 })
                .lean(),
        ]);
        const ledger = issueItems.length > 0
            ? issueItems.map((issueItem) => ({
                _id: issueItem._id,
                itemName: issueItem.itemName,
                size: issueItem.size,
                quantity: issueItem.quantity,
                issueDate: issueItem.issuedAt,
                issuedAt: issueItem.issuedAt,
                status: issueItem.status,
                condition: issueItem.condition,
                pricePerItem: Number(issueItem.pricePerItem || 0),
                lineTotal: Number(issueItem.lineTotal || calculateLineTotal(issueItem.pricePerItem, issueItem.quantity)),
                invoiceNo: issueItem.invoiceNo || issueItem.issue?.invoiceNo || '',
                invoice: issueItem.invoice || issueItem.issue?.invoice || null,
                issuedBy: issueItem.issue?.issuedBy || null,
                notes: issueItem.notes || issueItem.issue?.notes || '',
                issueId: issueItem.issue?._id || issueItem.issue,
                source: 'issue',
            }))
            : buildLegacyLedgerRows(studentUniformWithClass);
        const summary = {
            ...summarizeUniformRecord(studentUniformWithClass, catalogItemCount),
            ...getInvoicePaymentSummary(invoices),
        };

        res.status(200).json({
            success: true,
            message: 'Student uniform details retrieved successfully',
            data: {
                ...studentUniformWithClass,
                student: studentWithAcademicContext,
                class: classRecord || studentUniformWithClass?.class || null,
                ledger,
                invoices,
                issueHistory: issueRecords,
                summary,
                status: summary.status,
                totalUniformsIssued: summary.totalIssuedItems,
            }
        });
    } catch (error) {
        console.error('Error fetching student uniform details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching student uniform details',
            error: error.message
        });
    }
};

export const createUniformInvoice = async (req, res) => {
    try {
        const studentId = trimString(req.body.studentId);
        const requestedClassId = trimString(req.body.classId);
        const uniforms = Array.isArray(req.body.uniforms) ? req.body.uniforms : [];
        const notes = trimString(req.body.notes);

        if (!isValidObjectId(studentId)) {
            return sendValidationError(res, 'Student ID is invalid');
        }

        if (requestedClassId && !isValidObjectId(requestedClassId)) {
            return sendValidationError(res, 'Class ID is invalid');
        }

        if (uniforms.length === 0) {
            return sendValidationError(res, 'Add at least one uniform item');
        }

        const normalizedUniforms = uniforms.map((uniform) => ({
            itemName: trimString(uniform.itemName),
            size: trimString(uniform.size),
            quantity: toNumber(uniform.quantity),
        }));

        const seenCombinations = new Set();
        for (const uniform of normalizedUniforms) {
            if (!uniform.itemName || !uniform.size || !Number.isInteger(uniform.quantity) || uniform.quantity <= 0) {
                return sendValidationError(res, 'Each uniform entry must include item name, size, and a quantity greater than 0');
            }

            const combinationKey = `${uniform.itemName}::${uniform.size}`;
            if (seenCombinations.has(combinationKey)) {
                return sendValidationError(res, 'Each item and size combination can only be invoiced once per request');
            }
            seenCombinations.add(combinationKey);
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const [studentWithAcademicContext] = await attachAcademicContextToStudents([student.toObject()]);
        const currentClassRecord = studentWithAcademicContext.classSession || studentWithAcademicContext.class || null;
        const classId = requestedClassId || toIdString(currentClassRecord?._id || student.class);

        if (!isValidObjectId(classId)) {
            return sendValidationError(res, 'Student class could not be resolved');
        }

        const classData = await resolveClassRecordById(classId);
        if (!classData) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        const classIdCandidates = new Set(getClassIdCandidates(classData, classId));
        let studentBelongsToClass = classIdCandidates.has(toIdString(student.class));

        if (!studentBelongsToClass && classData?.source === 'session') {
            const activeEnrollment = await StudentEnrollment.findOne({
                studentId,
                classSessionId: classData._id,
                isCurrent: true,
            }).select('_id');

            studentBelongsToClass = Boolean(activeEnrollment);
        }

        if (!studentBelongsToClass) {
            return sendValidationError(res, 'Selected student does not belong to this class');
        }

        const activeInvoice = await InventoryInvoice.findOne({
            module: 'uniforms',
            student: studentId,
            issueStatus: 'pending',
            status: { $ne: 'cancelled' },
            $or: normalizedUniforms.map((uniform) => ({
                lineItems: {
                    $elemMatch: {
                        itemName: uniform.itemName,
                        size: uniform.size,
                    },
                },
            })),
        }).lean();

        if (activeInvoice) {
            return sendValidationError(res, `Selected uniform is already included in invoice ${activeInvoice.invoiceNo}`);
        }

        const requestedItemNames = [...new Set(normalizedUniforms.map((uniform) => uniform.itemName))];
        const stockItems = await UniformItem.find({ name: { $in: requestedItemNames } })
            .select('name sizes pricePerItem')
            .lean();
        const stockItemByName = new Map(stockItems.map((item) => [item.name, item]));

        for (const uniform of normalizedUniforms) {
            const stockItem = stockItemByName.get(uniform.itemName);
            if (!stockItem) {
                return res.status(404).json({
                    success: false,
                    message: `Uniform item '${uniform.itemName}' not found`,
                });
            }

            const sizeStock = stockItem.sizes?.find((sizeItem) => sizeItem.size === uniform.size);
            if (!sizeStock) {
                return sendValidationError(res, `Size ${uniform.size} is not available for ${uniform.itemName}`);
            }

            if (Number(sizeStock.stock || 0) < uniform.quantity) {
                return sendValidationError(res, `Insufficient stock for ${uniform.itemName} size ${uniform.size}`);
            }

            const sizePrice = resolveUniformSizePrice(stockItem, sizeStock);
            if (sizePrice <= 0) {
                return sendValidationError(res, `Set a price greater than 0 for ${uniform.itemName} size ${uniform.size} before creating an invoice`);
            }
        }

        const lineItems = normalizedUniforms.map((uniform) => {
            const stockItem = stockItemByName.get(uniform.itemName);
            const unitPrice = roundCurrency(resolveUniformSizePrice(stockItem, uniform.size));

            return {
                inventoryItem: stockItem._id,
                inventoryModel: 'UniformItem',
                itemName: uniform.itemName,
                size: uniform.size,
                quantity: uniform.quantity,
                unitPrice,
                lineTotal: roundCurrency(unitPrice * uniform.quantity),
            };
        });
        const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));

        const invoice = await InventoryInvoice.create({
            invoiceNo: generateInvoiceNo('UNIFORM'),
            module: 'uniforms',
            student: studentId,
            class: classId,
            className: formatClassLabel(classData),
            lineItems,
            subtotal,
            totalAmount: subtotal,
            paidAmount: 0,
            notes,
            createdBy: req.user?.id || null,
        });

        return res.status(201).json({
            success: true,
            message: 'Uniform invoice created successfully',
            data: invoice,
        });
    } catch (error) {
        console.error('Error creating uniform invoice:', error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Error creating uniform invoice');
        const statusCode = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
        return res.status(statusCode).json({
            success: false,
            message: friendlyMessage,
        });
    }
};

export const recordUniformInvoicePayment = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const amount = roundCurrency(toNumber(req.body.amount));
        const mode = normalizePaymentMode(req.body.mode);
        const note = trimString(req.body.note);
        const transactionId = trimString(req.body.transactionId);
        const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();

        if (!isValidObjectId(invoiceId)) {
            return sendValidationError(res, 'Invoice ID is invalid');
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return sendValidationError(res, 'Payment amount must be greater than 0');
        }

        if (!mode) {
            return sendValidationError(res, 'Please select a valid payment mode');
        }

        if (Number.isNaN(paymentDate.getTime())) {
            return sendValidationError(res, 'Payment date is invalid');
        }

        const invoice = await InventoryInvoice.findOne({ _id: invoiceId, module: 'uniforms' });
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Uniform invoice not found',
            });
        }

        if (invoice.issueStatus === 'cancelled' || invoice.status === 'cancelled') {
            return sendValidationError(res, 'Payments cannot be recorded for a cancelled invoice');
        }

        const remainingAmount = roundCurrency(invoice.totalAmount - invoice.paidAmount);
        if (remainingAmount <= 0) {
            return sendValidationError(res, 'This invoice is already fully paid');
        }

        if (amount > remainingAmount) {
            return sendValidationError(res, `Payment exceeds remaining balance of Rs. ${remainingAmount}`);
        }

        invoice.payments.push({
            amount,
            paymentDate,
            mode,
            transactionId,
            note,
            receivedBy: req.user?.id || null,
        });
        invoice.paidAmount = roundCurrency(Number(invoice.paidAmount || 0) + amount);
        await invoice.save();

        const savedInvoice = await InventoryInvoice.findById(invoice._id)
            .populate('payments.receivedBy', 'name email firstName lastName')
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Uniform payment recorded successfully',
            data: savedInvoice,
        });
    } catch (error) {
        console.error('Error recording uniform invoice payment:', error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Error recording uniform invoice payment');
        return res.status(error.name === 'ValidationError' ? 400 : 500).json({
            success: false,
            message: friendlyMessage,
        });
    }
};

export const issuePaidUniformInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;

        if (!isValidObjectId(invoiceId)) {
            return sendValidationError(res, 'Invoice ID is invalid');
        }

        const invoice = await InventoryInvoice.findOne({ _id: invoiceId, module: 'uniforms' });
        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Uniform invoice not found',
            });
        }

        if (invoice.issueStatus === 'issued') {
            return sendValidationError(res, 'This invoice has already been issued');
        }

        if (invoice.issueStatus !== 'pending') {
            return sendValidationError(res, 'This invoice cannot be issued');
        }

        if (invoice.paymentStatus !== 'paid' || Number(invoice.balanceAmount || 0) > 0) {
            return sendValidationError(res, `Collect the remaining Rs. ${roundCurrency(invoice.balanceAmount)} before issuing`);
        }

        const studentId = toIdString(invoice.student);
        const classId = toIdString(invoice.class);

        if (!isValidObjectId(studentId) || !isValidObjectId(classId)) {
            return sendValidationError(res, 'Invoice student or class is invalid');
        }

        const requestedItemNames = [...new Set(invoice.lineItems.map((item) => item.itemName))];
        const stockItems = await UniformItem.find({ name: { $in: requestedItemNames } })
            .select('name sizes pricePerItem')
            .lean();
        const stockItemByName = new Map(stockItems.map((item) => [item.name, item]));

        for (const lineItem of invoice.lineItems) {
            const stockItem = stockItemByName.get(lineItem.itemName);
            if (!stockItem) {
                return res.status(404).json({
                    success: false,
                    message: `Uniform item '${lineItem.itemName}' not found`,
                });
            }

            const sizeStock = stockItem.sizes?.find((sizeItem) => sizeItem.size === lineItem.size);
            if (!sizeStock) {
                return sendValidationError(res, `Size ${lineItem.size} is not available for ${lineItem.itemName}`);
            }

            if (Number(sizeStock.stock || 0) < Number(lineItem.quantity || 0)) {
                return sendValidationError(res, `Insufficient stock for ${lineItem.itemName} size ${lineItem.size}`);
            }
        }

        const issuedAt = new Date();
        const issuedBy = req.user?.id || null;
        const result = await runWithOptionalTransaction(async (session) => {
            const sessionOptions = session ? { session } : {};
            let studentUniform = await applySession(StudentUniform.findOne({ student: studentId }), session);
            if (!studentUniform) {
                studentUniform = new StudentUniform({
                    student: studentId,
                    class: classId,
                    uniforms: [],
                    totalUniformsIssued: 0,
                });
            }

            studentUniform.class = classId;

            const totalQuantity = invoice.lineItems.reduce(
                (sum, item) => sum + Number(item.quantity || 0),
                0
            );
            const [issueRecord] = await UniformIssue.create(
                [{
                    student: studentId,
                    class: classId,
                    issuedBy,
                    issuedAt,
                    notes: invoice.notes,
                    itemCount: invoice.lineItems.length,
                    totalQuantity,
                    totalAmount: invoice.totalAmount,
                    invoice: invoice._id,
                    invoiceNo: invoice.invoiceNo,
                }],
                sessionOptions
            );

            for (const lineItem of invoice.lineItems) {
                const uniformItem = await applySession(UniformItem.findOne({
                    name: lineItem.itemName,
                    sizes: { $elemMatch: { size: lineItem.size } },
                }), session);

                if (!uniformItem) {
                    const notFoundError = new Error(`Uniform item '${lineItem.itemName}' not found`);
                    notFoundError.statusCode = 404;
                    throw notFoundError;
                }

                const stockBefore = Number(
                    uniformItem.sizes.find((sizeItem) => sizeItem.size === lineItem.size)?.stock || 0
                );

                if (stockBefore < Number(lineItem.quantity || 0)) {
                    const stockError = new Error(`Insufficient stock for ${lineItem.itemName} size ${lineItem.size}`);
                    stockError.statusCode = 400;
                    throw stockError;
                }

                const updatedUniformItem = await UniformItem.findOneAndUpdate(
                    {
                        _id: uniformItem._id,
                        sizes: {
                            $elemMatch: {
                                size: lineItem.size,
                                stock: { $gte: lineItem.quantity },
                            },
                        },
                    },
                    {
                        $inc: {
                            'sizes.$.stock': -lineItem.quantity,
                            issued: lineItem.quantity,
                        },
                    },
                    { new: true, ...sessionOptions }
                );

                if (!updatedUniformItem) {
                    const stockError = new Error(`Insufficient stock for ${lineItem.itemName} size ${lineItem.size}`);
                    stockError.statusCode = 400;
                    throw stockError;
                }

                const stockAfter = Number(
                    updatedUniformItem.sizes.find((sizeItem) => sizeItem.size === lineItem.size)?.stock || 0
                );
                const pricePerItem = Number(lineItem.unitPrice || 0);
                const lineTotal = Number(lineItem.lineTotal || calculateLineTotal(pricePerItem, lineItem.quantity));

                await UniformIssueItem.create(
                    [{
                        issue: issueRecord._id,
                        student: studentId,
                        inventoryItem: updatedUniformItem._id,
                        itemName: lineItem.itemName,
                        size: lineItem.size,
                        quantity: lineItem.quantity,
                        pricePerItem,
                        lineTotal,
                        invoice: invoice._id,
                        invoiceNo: invoice.invoiceNo,
                        condition: 'good',
                        notes: invoice.notes,
                        issuedAt,
                    }],
                    sessionOptions
                );

                await UniformInventory.create(
                    [{
                        uniformItem: updatedUniformItem._id,
                        transactionType: 'issue',
                        size: lineItem.size,
                        quantity: lineItem.quantity,
                        student: studentId,
                        reason: invoice.notes || `Uniform issued from invoice ${invoice.invoiceNo}`,
                        previousStock: stockBefore,
                        newStock: stockAfter,
                        recordedBy: issuedBy,
                    }],
                    sessionOptions
                );

                const existingUniform = studentUniform.uniforms.findIndex(
                    (uniform) => uniform.itemName === lineItem.itemName && uniform.size === lineItem.size
                );

                if (existingUniform !== -1) {
                    const existingUniformRecord = studentUniform.uniforms[existingUniform];
                    const previousQuantity = Number(existingUniformRecord.quantity || 0);
                    const previousLineTotal = Number(
                        existingUniformRecord.lineTotal ||
                        calculateLineTotal(existingUniformRecord.pricePerItem, previousQuantity)
                    );
                    const nextQuantity = previousQuantity + Number(lineItem.quantity || 0);
                    const nextLineTotal = previousLineTotal + lineTotal;

                    existingUniformRecord.quantity = nextQuantity;
                    existingUniformRecord.pricePerItem = nextQuantity > 0 ? nextLineTotal / nextQuantity : pricePerItem;
                    existingUniformRecord.lineTotal = nextLineTotal;
                    existingUniformRecord.condition = 'good';
                    existingUniformRecord.issueDate = issuedAt;
                    existingUniformRecord.invoice = invoice._id;
                    existingUniformRecord.invoiceNo = invoice.invoiceNo;
                } else {
                    studentUniform.uniforms.push({
                        itemName: lineItem.itemName,
                        size: lineItem.size,
                        quantity: lineItem.quantity,
                        condition: 'good',
                        pricePerItem,
                        lineTotal,
                        invoice: invoice._id,
                        invoiceNo: invoice.invoiceNo,
                        issueDate: issuedAt,
                    });
                }
            }

            studentUniform.totalUniformsIssued = studentUniform.uniforms.reduce(
                (sum, uniform) => sum + (uniform.quantity || 0),
                0
            );
            const catalogItemCount = await applySession(UniformItem.countDocuments(), session);
            const summary = summarizeUniformRecord(studentUniform, catalogItemCount);
            studentUniform.status = summary.status;
            studentUniform.notes = invoice.notes || studentUniform.notes;
            await studentUniform.save(sessionOptions);

            invoice.issueStatus = 'issued';
            invoice.issuedAt = issuedAt;
            invoice.issuedBy = issuedBy;
            invoice.linkedUniformIssue = issueRecord._id;
            await invoice.save(sessionOptions);

            return studentUniform;
        });

        const [populatedRecord] = await attachAcademicContextToStudentUniforms([
            await StudentUniform.findById(result._id)
                .populate('student', 'firstName lastName studentId'),
        ]);

        return res.status(200).json({
            success: true,
            message: 'Paid uniform invoice issued successfully',
            data: populatedRecord
        });
    } catch (error) {
        console.error('Error issuing paid uniform invoice:', error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Error issuing paid uniform invoice');
        const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
        return res.status(statusCode).json({
            success: false,
            message: friendlyMessage
        });
    }
};

export const issueUniformToStudent = async (req, res) => {
    try {
        const studentId = trimString(req.body.studentId);
        const requestedClassId = trimString(req.body.classId);
        const uniforms = Array.isArray(req.body.uniforms) ? req.body.uniforms : [];
        const notes = trimString(req.body.notes);

        if (!isValidObjectId(studentId)) {
            return sendValidationError(res, 'Student ID is invalid');
        }

        if (requestedClassId && !isValidObjectId(requestedClassId)) {
            return sendValidationError(res, 'Class ID is invalid');
        }

        if (uniforms.length === 0) {
            return sendValidationError(res, 'Add at least one uniform item');
        }

        const normalizedUniforms = uniforms.map((uniform) => ({
            itemName: trimString(uniform.itemName),
            size: trimString(uniform.size),
            quantity: toNumber(uniform.quantity),
            condition: trimString(uniform.condition) || 'good',
        }));

        const seenCombinations = new Set();
        for (const uniform of normalizedUniforms) {
            if (!uniform.itemName || !uniform.size || !Number.isInteger(uniform.quantity) || uniform.quantity <= 0) {
                return sendValidationError(res, 'Each uniform entry must include item name, size, and a quantity greater than 0');
            }

            const combinationKey = `${uniform.itemName}::${uniform.size}`;
            if (seenCombinations.has(combinationKey)) {
                return sendValidationError(res, 'Each item and size combination can only be issued once per request');
            }
            seenCombinations.add(combinationKey);
        }

        // Validate student and class
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const [studentWithAcademicContext] = await attachAcademicContextToStudents([student.toObject()]);
        const currentClassRecord = studentWithAcademicContext.classSession || studentWithAcademicContext.class || null;
        const classId = requestedClassId || toIdString(currentClassRecord?._id || student.class);

        if (!isValidObjectId(classId)) {
            return sendValidationError(res, 'Student class could not be resolved');
        }

        const classData = await resolveClassRecordById(classId);
        if (!classData) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        const classIdCandidates = new Set(getClassIdCandidates(classData, classId));
        let studentBelongsToClass = classIdCandidates.has(toIdString(student.class));

        if (!studentBelongsToClass && classData?.source === 'session') {
            const activeEnrollment = await StudentEnrollment.findOne({
                studentId,
                classSessionId: classData._id,
                isCurrent: true,
            }).select('_id');

            studentBelongsToClass = Boolean(activeEnrollment);
        }

        if (!studentBelongsToClass) {
            return sendValidationError(res, 'Selected student does not belong to this class');
        }

        const requestedItemNames = [...new Set(normalizedUniforms.map((uniform) => uniform.itemName))];
        const stockItems = await UniformItem.find({ name: { $in: requestedItemNames } })
            .select('name sizes pricePerItem')
            .lean();
        const stockItemByName = new Map(stockItems.map((item) => [item.name, item]));

        for (const uniform of normalizedUniforms) {
            const stockItem = stockItemByName.get(uniform.itemName);
            if (!stockItem) {
                return res.status(404).json({
                    success: false,
                    message: `Uniform item '${uniform.itemName}' not found`,
                });
            }

            const sizeStock = stockItem.sizes?.find((sizeItem) => sizeItem.size === uniform.size);
            if (!sizeStock) {
                return sendValidationError(res, `Size ${uniform.size} is not available for ${uniform.itemName}`);
            }

            if (Number(sizeStock.stock || 0) < uniform.quantity) {
                return sendValidationError(res, `Insufficient stock for ${uniform.itemName} size ${uniform.size}`);
            }

            uniform.pricePerItem = resolveUniformSizePrice(stockItem, sizeStock);
            if (!Number.isFinite(uniform.pricePerItem) || uniform.pricePerItem <= 0) {
                return sendValidationError(res, `Set a price greater than 0 for ${uniform.itemName} size ${uniform.size} before issuing`);
            }
            uniform.lineTotal = calculateLineTotal(uniform.pricePerItem, uniform.quantity);
        }

        const lineItems = normalizedUniforms.map((uniform) => {
            const stockItem = stockItemByName.get(uniform.itemName);
            const unitPrice = roundCurrency(uniform.pricePerItem || 0);

            return {
                inventoryItem: stockItem._id,
                inventoryModel: 'UniformItem',
                itemName: uniform.itemName,
                size: uniform.size,
                quantity: uniform.quantity,
                unitPrice,
                lineTotal: roundCurrency(unitPrice * uniform.quantity),
            };
        });
        const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
        const issuedAt = new Date();
        const issuedBy = req.user?.id || null;
        const result = await runWithOptionalTransaction(async (session) => {
            const sessionOptions = session ? { session } : {};
            let studentUniform = await applySession(StudentUniform.findOne({ student: studentId }), session);
            if (!studentUniform) {
                studentUniform = new StudentUniform({
                    student: studentId,
                    class: classId,
                    uniforms: [],
                    totalUniformsIssued: 0,
                });
            }

            studentUniform.class = classId;

            const totalQuantity = normalizedUniforms.reduce((sum, uniform) => sum + uniform.quantity, 0);
            const [invoice] = await InventoryInvoice.create(
                [{
                    invoiceNo: generateInvoiceNo('UNIFORM'),
                    module: 'uniforms',
                    student: studentId,
                    class: classId,
                    className: formatClassLabel(classData),
                    lineItems,
                    subtotal,
                    totalAmount: subtotal,
                    paidAmount: 0,
                    notes,
                    createdBy: issuedBy,
                    issuedBy,
                    issuedAt,
                    issueStatus: 'issued',
                }],
                sessionOptions
            );
            const [issueRecord] = await UniformIssue.create(
                [{
                    student: studentId,
                    class: classId,
                    issuedBy,
                    issuedAt,
                    notes,
                    itemCount: normalizedUniforms.length,
                    totalQuantity,
                    totalAmount: subtotal,
                    invoice: invoice._id,
                    invoiceNo: invoice.invoiceNo,
                }],
                sessionOptions
            );

            let actualTotalAmount = 0;
            for (const uniform of normalizedUniforms) {
                const beforeUpdateItem = await applySession(UniformItem.findOne({
                    name: uniform.itemName,
                    sizes: { $elemMatch: { size: uniform.size } },
                }), session);

                if (!beforeUpdateItem) {
                    const missingItem = await applySession(UniformItem.findOne({ name: uniform.itemName }), session);
                    if (!missingItem) {
                        const notFoundError = new Error(`Uniform item '${uniform.itemName}' not found`);
                        notFoundError.statusCode = 404;
                        throw notFoundError;
                    }

                    const missingSizeError = new Error(`Size ${uniform.size} is not available for ${uniform.itemName}`);
                    missingSizeError.statusCode = 400;
                    throw missingSizeError;
                }

                const stockBefore = Number(
                    beforeUpdateItem.sizes.find((sizeItem) => sizeItem.size === uniform.size)?.stock || 0
                );

                if (stockBefore < uniform.quantity) {
                    const stockError = new Error(`Insufficient stock for ${uniform.itemName} size ${uniform.size}`);
                    stockError.statusCode = 400;
                    throw stockError;
                }

                const updatedUniformItem = await UniformItem.findOneAndUpdate(
                    {
                        _id: beforeUpdateItem._id,
                        sizes: {
                            $elemMatch: {
                                size: uniform.size,
                                stock: { $gte: uniform.quantity },
                            },
                        },
                    },
                    {
                        $inc: {
                            'sizes.$.stock': -uniform.quantity,
                            issued: uniform.quantity,
                        },
                    },
                    { new: true, ...sessionOptions }
                );

                if (!updatedUniformItem) {
                    const stockError = new Error(`Insufficient stock for ${uniform.itemName} size ${uniform.size}`);
                    stockError.statusCode = 400;
                    throw stockError;
                }

                const stockAfter = Number(
                    updatedUniformItem.sizes.find((sizeItem) => sizeItem.size === uniform.size)?.stock || 0
                );
                const pricePerItem = Number(uniform.pricePerItem || 0);
                const lineTotal = calculateLineTotal(pricePerItem, uniform.quantity);
                actualTotalAmount += lineTotal;

                await UniformIssueItem.create(
                    [{
                        issue: issueRecord._id,
                        student: studentId,
                        inventoryItem: updatedUniformItem._id,
                        itemName: uniform.itemName,
                        size: uniform.size,
                        quantity: uniform.quantity,
                        pricePerItem,
                        lineTotal,
                        invoice: invoice._id,
                        invoiceNo: invoice.invoiceNo,
                        condition: uniform.condition,
                        notes,
                        issuedAt,
                    }],
                    sessionOptions
                );

                await UniformInventory.create(
                    [{
                        uniformItem: updatedUniformItem._id,
                        transactionType: 'issue',
                        size: uniform.size,
                        quantity: uniform.quantity,
                        student: studentId,
                        reason: notes || `Uniform issued with due invoice ${invoice.invoiceNo}`,
                        previousStock: stockBefore,
                        newStock: stockAfter,
                        recordedBy: issuedBy,
                    }],
                    sessionOptions
                );

                const existingUniform = studentUniform.uniforms.findIndex(
                    u => u.itemName === uniform.itemName && u.size === uniform.size
                );

                if (existingUniform !== -1) {
                    const existingUniformRecord = studentUniform.uniforms[existingUniform];
                    const previousQuantity = Number(existingUniformRecord.quantity || 0);
                    const previousLineTotal = Number(
                        existingUniformRecord.lineTotal ||
                        calculateLineTotal(existingUniformRecord.pricePerItem, previousQuantity)
                    );
                    const nextQuantity = previousQuantity + uniform.quantity;
                    const nextLineTotal = previousLineTotal + lineTotal;

                    existingUniformRecord.quantity = nextQuantity;
                    existingUniformRecord.pricePerItem = nextQuantity > 0 ? nextLineTotal / nextQuantity : pricePerItem;
                    existingUniformRecord.lineTotal = nextLineTotal;
                    existingUniformRecord.condition = uniform.condition;
                    existingUniformRecord.issueDate = issuedAt;
                    existingUniformRecord.invoice = invoice._id;
                    existingUniformRecord.invoiceNo = invoice.invoiceNo;
                } else {
                    studentUniform.uniforms.push({
                        ...uniform,
                        pricePerItem,
                        lineTotal,
                        invoice: invoice._id,
                        invoiceNo: invoice.invoiceNo,
                        issueDate: issuedAt
                    });
                }
            }

            issueRecord.totalAmount = actualTotalAmount;
            await issueRecord.save(sessionOptions);

            studentUniform.totalUniformsIssued = studentUniform.uniforms.reduce(
                (sum, uniform) => sum + (uniform.quantity || 0),
                0
            );
            const catalogItemCount = await applySession(UniformItem.countDocuments(), session);
            const summary = summarizeUniformRecord(studentUniform, catalogItemCount);
            studentUniform.status = summary.status;
            studentUniform.notes = notes || studentUniform.notes;
            await studentUniform.save(sessionOptions);

            invoice.linkedUniformIssue = issueRecord._id;
            await invoice.save(sessionOptions);

            return { studentUniform, invoice };
        });

        const [populatedRecord] = await attachAcademicContextToStudentUniforms([
            await StudentUniform.findById(result.studentUniform._id)
                .populate('student', 'firstName lastName studentId'),
        ]);

        res.status(200).json({
            success: true,
            message: 'Uniforms issued successfully. Payment is marked due.',
            data: populatedRecord,
            invoice: result.invoice,
        });
    } catch (error) {
        console.error('Error issuing uniforms:', error);
        const friendlyMessage = getFriendlyMongooseError(error, 'Error issuing uniforms');
        const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage
        });
    }
};

export const updateUniformCondition = async (req, res) => {
    try {
        const studentId = trimString(req.body.studentId);
        const itemName = trimString(req.body.itemName);
        const size = trimString(req.body.size);
        const condition = trimString(req.body.condition) || 'good';

        if (!isValidObjectId(studentId)) {
            return sendValidationError(res, 'Student ID is invalid');
        }

        if (!itemName || !size) {
            return sendValidationError(res, 'Uniform item and size are required');
        }

        if (!UNIFORM_CONDITIONS.includes(condition)) {
            return sendValidationError(res, 'Please select a valid condition');
        }

        const studentUniform = await StudentUniform.findOne({ student: studentId });

        if (!studentUniform) {
            return res.status(404).json({
                success: false,
                message: 'Student uniform record not found'
            });
        }

        // Find and update the uniform condition
        const uniformIndex = studentUniform.uniforms.findIndex(
            u => u.itemName === itemName && u.size === size
        );

        if (uniformIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Uniform not found in student record'
            });
        }

        const previousCondition = studentUniform.uniforms[uniformIndex].condition;
        studentUniform.uniforms[uniformIndex].condition = condition;

        const quantityAffected = Math.max(1, Number(studentUniform.uniforms[uniformIndex].quantity) || 1);

        if (previousCondition !== condition) {
            const uniformItem = await UniformItem.findOne({ name: itemName });
            if (!uniformItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Uniform item not found'
                });
            }

            const previousDamagedCount = uniformItem.damaged;

            if (previousCondition !== 'damaged' && condition === 'damaged') {
                uniformItem.damaged += quantityAffected;
                uniformItem.issued = Math.max(0, uniformItem.issued - quantityAffected);
                await uniformItem.save();

                await UniformInventory.create({
                    uniformItem: uniformItem._id,
                    transactionType: 'damage',
                    size: studentUniform.uniforms[uniformIndex].size,
                    quantity: quantityAffected,
                    student: studentId,
                    reason: 'Uniform condition changed to damaged',
                    previousStock: previousDamagedCount,
                    newStock: uniformItem.damaged,
                    recordedBy: req.user?.id || null,
                });
            }

            if (previousCondition === 'damaged' && condition !== 'damaged') {
                uniformItem.damaged = Math.max(0, uniformItem.damaged - quantityAffected);
                uniformItem.issued += quantityAffected;
                await uniformItem.save();

                await UniformInventory.create({
                    uniformItem: uniformItem._id,
                    transactionType: 'adjustment',
                    size: studentUniform.uniforms[uniformIndex].size,
                    quantity: quantityAffected,
                    student: studentId,
                    reason: `Uniform condition changed from damaged to ${condition}`,
                    previousStock: previousDamagedCount,
                    newStock: uniformItem.damaged,
                    recordedBy: req.user?.id || null,
                });
            }
        }

        await studentUniform.save();

        const [populatedRecord] = await attachAcademicContextToStudentUniforms([
            await StudentUniform.findById(studentUniform._id)
                .populate('student', 'firstName lastName studentId'),
        ]);

        res.status(200).json({
            success: true,
            message: 'Uniform condition updated successfully',
            data: populatedRecord
        });
    } catch (error) {
        const friendlyMessage = getFriendlyMongooseError(error, 'Error updating uniform condition');
        const statusCode = error.name === 'ValidationError' ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: friendlyMessage
        });
    }
};

// ============ CLASS UNIFORM STATISTICS ============

export const getClassUniformStats = async (req, res) => {
    try {
        const { classId } = req.params;

        const classData = await resolveClassRecordById(classId);
        if (!classData) {
            return res.status(404).json({
                success: false,
                message: 'Class not found'
            });
        }

        const studentIds = await getStudentIdsForClassRecord(classData, classId);
        const totalStudents = studentIds.length;

        const [uniformsFullyIssued, uniformsPartial] = totalStudents > 0
            ? await Promise.all([
                StudentUniform.countDocuments({
                    student: { $in: studentIds },
                    status: 'issued',
                }),
                StudentUniform.countDocuments({
                    student: { $in: studentIds },
                    status: 'partial',
                }),
            ])
            : [0, 0];

        const uniformsIssued = uniformsFullyIssued + uniformsPartial;
        const uniformsPending = Math.max(totalStudents - uniformsIssued, 0);

        const issuedPercentage = totalStudents > 0
            ? ((uniformsIssued / totalStudents) * 100).toFixed(1)
            : '0.0';

        const pendingPercentage = totalStudents > 0
            ? (100 - Number(issuedPercentage)).toFixed(1)
            : '0.0';

        res.status(200).json({
            success: true,
            message: 'Class uniform statistics retrieved successfully',
            data: {
                className: classData.name,
                academicYear: classData.academicYear,
                section: classData.section,
                totalStudents,
                uniformsIssued,
                uniformsFullyIssued,
                uniformsPartial,
                uniformsPending,
                issuedPercentage,
                pendingPercentage,
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching class uniform statistics',
            error: error.message
        });
    }
};



export const getAllClassesUniformSummary = async (req, res) => {
    try {
        const classSessions = await ClassSession.find().populate('classId', 'name order');
        const classes = classSessions.length > 0
            ? classSessions.map(serializeClassRecord)
            : (await LegacyClass.find()).map(serializeClassRecord);

        const settled = await Promise.allSettled(
            classes.map(async (classItem) => {
                const classId = classItem._id;

                const studentIds = await getStudentIdsForClassRecord(classItem, classId);
                const totalStudents = studentIds.length;

                const [uniformsFullyIssued, uniformsPartial] = totalStudents > 0
                    ? await Promise.all([
                        StudentUniform.countDocuments({
                            student: { $in: studentIds },
                            status: 'issued',
                        }),
                        StudentUniform.countDocuments({
                            student: { $in: studentIds },
                            status: 'partial',
                        }),
                    ])
                    : [0, 0];

                const uniformsIssued = uniformsFullyIssued + uniformsPartial;
                const uniformsPending = Math.max(totalStudents - uniformsIssued, 0);
                const issuedPercentage =
                    totalStudents > 0 ? ((uniformsIssued / totalStudents) * 100).toFixed(1) : '0.0';

                return {
                    _id: classId,
                    name: classItem.name,
                    academicYear: classItem.academicYear,
                    section: classItem.section,
                    displayName: classItem.displayName,
                    students: totalStudents,
                    uniformsIssued,
                    uniformsFullyIssued,
                    uniformsPending,
                    uniformsPartial,
                    issuedPercentage,
                };
            })
        );

        const summary = settled.map((r, idx) =>
            r.status === 'fulfilled'
                ? r.value
                : {
                    _id: classes[idx]?._id,
                    name: classes[idx]?.name,
                    academicYear: classes[idx]?.academicYear,
                    section: classes[idx]?.section,
                    displayName: classes[idx]?.displayName,
                    students: 0,
                    uniformsIssued: 0,
                    uniformsFullyIssued: 0,
                    uniformsPending: 0,
                    uniformsPartial: 0,
                    issuedPercentage: '0.0',
                    error: r.reason?.message || String(r.reason),
                }
        );

        return res.status(200).json({
            success: true,
            message: 'All classes uniform summary retrieved successfully',
            data: summary,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching classes uniform summary',
            error: error.message,
        });
    }
};

// ============ INVENTORY MANAGEMENT ============

export const getInventoryHistory = async (req, res) => {
    try {
        const { uniformItemId, limit = 50, skip = 0 } = req.query;

        let query = {};
        if (uniformItemId) {
            query.uniformItem = uniformItemId;
        }

        const history = await UniformInventory.find(query)
            .populate('uniformItem', 'name')
            .populate('student', 'firstName lastName studentId')
            .populate('recordedBy', 'name email firstName lastName')
            .sort({ date: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await UniformInventory.countDocuments(query);

        res.status(200).json({
            success: true,
            message: 'Inventory history retrieved successfully',
            data: history,
            total,
            limit: parseInt(limit),
            skip: parseInt(skip)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching inventory history',
            error: error.message
        });
    }
};

export const addInventory = async (req, res) => {
    try {
        const { uniformItemId, size, quantity, reason } = req.body;
        const hasPricePerItem = req.body.pricePerItem !== undefined && req.body.pricePerItem !== null;
        const pricePerItem = hasPricePerItem
            ? normalizePricePerItem(req.body.pricePerItem)
            : Number.NaN;

        const uniformItem = await UniformItem.findById(uniformItemId);
        if (!uniformItem) {
            return res.status(404).json({
                success: false,
                message: 'Uniform item not found'
            });
        }

        if (hasPricePerItem && (!Number.isFinite(pricePerItem) || pricePerItem < 0)) {
            return sendValidationError(res, 'Price per size must be 0 or greater');
        }

        // Find or create size entry
        const sizeIndex = uniformItem.sizes.findIndex(s => s.size === size);

        if (sizeIndex === -1) {
            const newSizePrice = hasPricePerItem
                ? pricePerItem
                : resolveUniformSizePrice(uniformItem);
            if (!Number.isFinite(newSizePrice) || newSizePrice < 0) {
                return sendValidationError(res, 'Price per size must be 0 or greater when adding a new size');
            }
            uniformItem.sizes.push({ size, stock: quantity, pricePerItem: newSizePrice });
        } else {
            uniformItem.sizes[sizeIndex].stock += quantity;
            if (hasPricePerItem && Number.isFinite(pricePerItem) && pricePerItem >= 0) {
                uniformItem.sizes[sizeIndex].pricePerItem = pricePerItem;
            }
        }

        uniformItem.totalStock += quantity;
        uniformItem.pricePerItem = getCommonSizePrice(getUniformSizesWithPrices(uniformItem));
        const previousStock = uniformItem.totalStock - quantity;

        await uniformItem.save();

        // Record transaction
        await UniformInventory.create({
            uniformItem: uniformItemId,
            transactionType: 'purchase',
            size,
            quantity,
            reason: reason || 'Stock addition',
            previousStock,
            newStock: uniformItem.totalStock,
            recordedBy: req.user?.id || null,
        });

        res.status(200).json({
            success: true,
            message: 'Inventory added successfully',
            data: uniformItem
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding inventory',
            error: error.message
        });
    }
};

export const getLowStockItems = async (req, res) => {
    try {
        const items = await UniformItem.find();

        const lowStockItems = items.filter(item => {
            const available = item.totalStock - item.issued - item.damaged;
            return available < item.reorderLevel;
        }).map((item) => {
            const itemObject = item.toObject();
            return {
                ...itemObject,
                sizes: getUniformSizesWithPrices(itemObject),
                ...getUniformPriceSummary(itemObject),
            };
        });

        res.status(200).json({
            success: true,
            message: 'Low stock items retrieved successfully',
            data: lowStockItems,
            total: lowStockItems.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching low stock items',
            error: error.message
        });
    }
};

// ============ REPORTS ============

export const getUniformReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let dateQuery = {};
        if (startDate && endDate) {
            dateQuery = {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        const totalTransactions = await UniformInventory.countDocuments(dateQuery);
        const issuedCount = await UniformInventory.countDocuments({
            ...dateQuery,
            transactionType: 'issue'
        });
        const damagedCount = await UniformInventory.countDocuments({
            ...dateQuery,
            transactionType: 'damage'
        });
        const purchaseCount = await UniformInventory.countDocuments({
            ...dateQuery,
            transactionType: 'purchase'
        });

        const uniformItems = await UniformItem.find();
        const totalIssued = uniformItems.reduce((sum, item) => sum + item.issued, 0);
        const totalDamaged = uniformItems.reduce((sum, item) => sum + item.damaged, 0);
        const totalStocked = uniformItems.reduce((sum, item) => sum + item.totalStock, 0);
        const totalInventoryValue = uniformItems.reduce(
            (sum, item) => sum + calculateUniformStockValue(item),
            0
        );
        const availableInventoryValue = totalInventoryValue;

        res.status(200).json({
            success: true,
            message: 'Uniform report retrieved successfully',
            data: {
                summary: {
                    totalTransactions,
                    issuedCount,
                    damagedCount,
                    purchaseCount
                },
                inventory: {
                    totalStocked,
                    totalIssued,
                    totalDamaged,
                    available: totalStocked - totalIssued - totalDamaged,
                    totalInventoryValue,
                    availableInventoryValue,
                },
                uniformItems: uniformItems.map(item => {
                    const stockValue = calculateUniformStockValue(item);
                    return {
                        name: item.name,
                        sizes: getUniformSizesWithPrices(item),
                        ...getUniformPriceSummary(item),
                        totalStock: item.totalStock,
                        issued: item.issued,
                        damaged: item.damaged,
                        available: item.totalStock - item.issued - item.damaged,
                        inventoryValue: stockValue,
                        availableValue: stockValue,
                    };
                })
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating uniform report',
            error: error.message
        });
    }
};

