// controllers/booksController.js
import mongoose from 'mongoose';
import Book from '../models/Book.js';
import StudentBook from '../models/StudentBook.js';
import InventoryInvoice from '../models/InventoryInvoice.js';
import Student from '../models/Student.js';
import MasterClass from '../models/Class.js';
import ClassSession from '../models/ClassSession.js';
import LegacyClass from '../models/LegacyClass.js';
import {
  getFriendlyMongooseError,
  isValidObjectId,
  normalizeDigits,
  sendValidationError,
  toNumber,
  trimString,
} from '../utils/requestValidation.js';
import {
  attachAcademicContextToStudents,
} from '../services/academicStructureService.js';
import {
  BOOK_ITEM_TYPES,
  GLOBAL_BOOK_CLASS_NAME,
  allowsRepeatIssue,
  isDiaryItem,
  isReturnableItem,
  normalizeBookItemType,
  resolveInventoryIssueClassName,
} from '../utils/bookInventory.js';

const STUDENT_SEARCH_LIMIT = 10;
const STUDENT_SEARCH_CANDIDATE_LIMIT = 60;
const STUDENT_SEARCH_MAX_LENGTH = 50;
const PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'];

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizeSearchQuery = (value) =>
  trimString(value)
    .replace(/\s+/g, ' ')
    .slice(0, STUDENT_SEARCH_MAX_LENGTH);

const toIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || value);
  return String(value);
};

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

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

const formatStudentName = (student = {}) =>
  trimString(student.name) || `${trimString(student.firstName)} ${trimString(student.lastName)}`.trim();

const getAdmissionNo = (student = {}) => trimString(student.admissionNo) || trimString(student.studentId);

const getFatherName = (student = {}) =>
  trimString(student.parent?.fatherName) || trimString(student.parentName);

const getMotherName = (student = {}) => trimString(student.parent?.motherName);

const getParentPhone = (student = {}) =>
  normalizeDigits(student.parent?.phone || student.parentPhone || student.phone);

const formatClassLabel = (classRecord) => {
  if (!classRecord) return 'N/A';
  if (classRecord.displayName) return classRecord.displayName;

  const className = trimString(classRecord.name || classRecord.classId?.name);
  const section = trimString(classRecord.section);
  const academicYear = trimString(classRecord.academicYear);
  const classWithSection = section ? `${className}-${section}` : className;
  return academicYear ? `${classWithSection} (${academicYear})` : classWithSection || 'N/A';
};

const getBookClassNameCandidates = (classRecord, fallback = '') => {
  const candidates = new Set();
  const add = (value) => {
    const normalizedValue = trimString(value);
    if (normalizedValue) candidates.add(normalizedValue);
  };

  add(fallback);
  add(classRecord?.name);
  add(classRecord?.displayName);

  if (classRecord?.name && classRecord?.section) {
    add(`${classRecord.name}-${classRecord.section}`);
    add(`${classRecord.name} ${classRecord.section}`);
  }

  return [...candidates];
};

const getPrimaryBookClassName = (classRecord, fallback = '') =>
  getBookClassNameCandidates(classRecord, fallback)[0] || 'N/A';

const buildClassNameQuery = (classNames = []) => ({
  $or: [
    { itemType: 'diary' },
    ...classNames.map((className) => ({
      className: { $regex: new RegExp(`^${escapeRegex(className)}$`, 'i') },
    })),
  ],
});

const findBooksForClass = async (classNames = []) => {
  const normalizedClassNames = [...new Set(classNames.map(trimString).filter(Boolean))];
  if (normalizedClassNames.length === 0) {
    return Book.find({ itemType: 'diary' }).sort({ subject: 1, name: 1 }).lean();
  }
  return Book.find(buildClassNameQuery(normalizedClassNames)).sort({ subject: 1, name: 1 }).lean();
};

const getBlockingExistingIssues = (existingIssues = [], bookById = new Map()) =>
  existingIssues.filter((issue) => !allowsRepeatIssue(bookById.get(toIdString(issue.bookId)) || issue));

const itemMatchesStudentClass = (book, classNameCandidates = []) => {
  if (isDiaryItem(book)) return true;

  const bookClassNames = getBookClassNameCandidates({ name: book.className }, book.className).map((value) =>
    value.toLowerCase()
  );
  const studentClassNames = classNameCandidates.map((value) => value.toLowerCase());
  return bookClassNames.some((className) => studentClassNames.includes(className));
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

  if (admissionNo && admissionNo === normalizedQuery) return 0;
  if (digitQuery && phoneValues.some((phone) => phone === digitQuery)) return 1;
  if (name.startsWith(normalizedQuery) || name.includes(normalizedQuery)) return 2;
  if (parentNames.some((parentName) => parentName.includes(normalizedQuery))) return 3;
  if (className.includes(normalizedQuery)) return 4;
  return 5;
};

const isPlaceholderPendingBookRecord = (record = {}) =>
  record.status === 'pending' && !record.bookId && !trimString(record.bookName);

const getDisplayBookLedgerRecords = (studentBooks = []) =>
  studentBooks.filter((record) => !isPlaceholderPendingBookRecord(record));

const summarizeBookLedger = (bookCatalog = [], studentBooks = []) => {
  const ledgerRecords = getDisplayBookLedgerRecords(studentBooks);
  const issuedBooks = ledgerRecords.filter((record) => record.status === 'issued');
  const issuedBookKeys = new Set(
    issuedBooks
      .map((record) => toIdString(record.bookId?._id || record.bookId) || trimString(record.bookName).toLowerCase())
      .filter(Boolean)
  );
  const lastIssueDate = ledgerRecords
    .map((record) => new Date(record.issueDate))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;
  const overdueBooks = issuedBooks.filter(
    (record) => record.dueDate && new Date(record.dueDate) < new Date()
  ).length;
  const pendingBooks = bookCatalog.length > 0 ? Math.max(bookCatalog.length - issuedBookKeys.size, 0) : 0;

  let bookStatus = 'Pending';
  if (bookCatalog.length > 0 && issuedBookKeys.size >= bookCatalog.length) {
    bookStatus = 'Complete';
  } else if (issuedBookKeys.size > 0) {
    bookStatus = 'Partial';
  }

  return {
    totalIssuedBooks: issuedBooks.length,
    issuedBookTitles: issuedBookKeys.size,
    pendingBooks,
    returnedBooks: ledgerRecords.filter((record) => record.status === 'returned').length,
    overdueBooks,
    lastIssueDate,
    bookStatus,
  };
};

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

// Get all books

export const getAllBooks = async (req, res) => {
  try {
    const books = await Book.find().sort({ className: 1, subject: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching books',
      error: error.message,
    });
  }
};

// Get all classes with book statistics
export const getClassBookStats = async (req, res) => {
  try {
    const stats = await Book.aggregate([
      {
        $match: {
          itemType: { $ne: 'diary' },
        },
      },
      {
        $group: {
          _id: '$className',
          totalBooks: { $sum: '$totalStock' },
          issuedBooks: { $sum: '$issuedCount' },
          damagedBooks: { $sum: '$damagedCount' },
          availableBooks: { $sum: '$availableStock' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching class statistics',
      error: error.message,
    });
  }
};

export const searchStudentsForBooks = async (req, res) => {
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
    const studentBooks = await StudentBook.find({ studentId: { $in: studentIds } })
      .select('studentId bookId bookName status issueDate dueDate')
      .lean();
    const booksByStudentId = new Map();

    studentBooks.forEach((bookRecord) => {
      if (isPlaceholderPendingBookRecord(bookRecord)) {
        return;
      }

      const studentId = toIdString(bookRecord.studentId);
      if (!booksByStudentId.has(studentId)) {
        booksByStudentId.set(studentId, []);
      }
      booksByStudentId.get(studentId).push(bookRecord);
    });

    const uniqueClassNames = [
      ...new Set(
        studentsWithAcademicContext
          .flatMap((student) =>
            getBookClassNameCandidates(student.classSession || student.class || null)
          )
          .filter(Boolean)
      ),
    ];
    const classBooks = await findBooksForClass(uniqueClassNames);
    const booksByClassName = new Map();
    classBooks.forEach((book) => {
      const key = trimString(book.className).toLowerCase();
      if (!booksByClassName.has(key)) {
        booksByClassName.set(key, []);
      }
      booksByClassName.get(key).push(book);
    });
    const globalBookCatalog = booksByClassName.get(GLOBAL_BOOK_CLASS_NAME.toLowerCase()) || [];

    const results = studentsWithAcademicContext
      .map((student) => {
        const classRecord = student.classSession || student.class || null;
        const classNameCandidates = getBookClassNameCandidates(classRecord);
        const bookCatalog = [
          ...classNameCandidates.flatMap(
            (className) => booksByClassName.get(className.toLowerCase()) || []
          ),
          ...globalBookCatalog,
        ];
        const uniqueBookCatalog = [...new Map(bookCatalog.map((book) => [toIdString(book._id), book])).values()];
        const summary = summarizeBookLedger(uniqueBookCatalog, booksByStudentId.get(toIdString(student._id)) || []);
        const result = {
          id: toIdString(student._id),
          name: formatStudentName(student),
          admissionNo: getAdmissionNo(student),
          className: formatClassLabel(classRecord),
          fatherName: getFatherName(student),
          motherName: getMotherName(student),
          phone: getParentPhone(student),
          studentPhone: normalizeDigits(student.phone),
          bookStatus: summary.bookStatus,
          pendingBooks: summary.pendingBooks,
          issuedBooks: summary.totalIssuedBooks,
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
    console.error('Error searching students for books:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to search students right now',
    });
  }
};

export const getStudentBookProfile = async (req, res) => {
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
        message: 'Student not found',
      });
    }

    const [studentWithAcademicContext] = await attachAcademicContextToStudents([student]);
    const classRecord = studentWithAcademicContext.classSession || studentWithAcademicContext.class || null;
    const classNameCandidates = getBookClassNameCandidates(classRecord);
    const [bookCatalog, rawStudentBooks, invoices] = await Promise.all([
      findBooksForClass(classNameCandidates),
      StudentBook.find({ studentId })
        .populate('bookId', 'name subject className itemType totalStock issuedCount damagedCount availableStock price')
        .populate('issuedBy', 'name email firstName lastName')
        .sort({ issueDate: -1 })
        .lean(),
      InventoryInvoice.find({ module: 'books', student: studentId })
        .populate('createdBy', 'name email firstName lastName')
        .populate('issuedBy', 'name email firstName lastName')
        .populate('payments.receivedBy', 'name email firstName lastName')
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    const studentBooks = getDisplayBookLedgerRecords(rawStudentBooks);
    const summary = {
      ...summarizeBookLedger(bookCatalog, studentBooks),
      ...getInvoicePaymentSummary(invoices),
    };

    return res.status(200).json({
      success: true,
      message: 'Student book profile retrieved successfully',
      data: {
        student: studentWithAcademicContext,
        class: classRecord,
        bookClassName: getPrimaryBookClassName(classRecord),
        classNameCandidates,
        availableBooks: bookCatalog,
        ledger: studentBooks,
        invoices,
        summary,
      },
    });
  } catch (error) {
    console.error('Error fetching student book profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching student book profile',
      error: error.message,
    });
  }
};

export const createBookInvoice = async (req, res) => {
  try {
    const studentId = trimString(req.body.studentId);
    const bookIds = Array.isArray(req.body.bookIds) ? req.body.bookIds.map(trimString).filter(Boolean) : [];
    const requestedClassName = trimString(req.body.className);
    const notes = trimString(req.body.notes);

    if (!isValidObjectId(studentId)) {
      return sendValidationError(res, 'Student ID is invalid');
    }

    if (bookIds.length === 0 || bookIds.some((bookId) => !isValidObjectId(bookId))) {
      return sendValidationError(res, 'Please select at least one valid book');
    }

    if (new Set(bookIds).size !== bookIds.length) {
      return sendValidationError(res, 'Each book can only be selected once');
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const [studentWithAcademicContext] = await attachAcademicContextToStudents([student.toObject()]);
    const classRecord = studentWithAcademicContext.classSession || studentWithAcademicContext.class || null;
    const classNameCandidates = getBookClassNameCandidates(classRecord, requestedClassName);
    const [books, existingIssues, activeInvoice] = await Promise.all([
      Book.find({ _id: { $in: bookIds } }).lean(),
      StudentBook.find({
        studentId,
        bookId: { $in: bookIds },
        status: 'issued',
      }).lean(),
      InventoryInvoice.findOne({
        module: 'books',
        student: studentId,
        issueStatus: 'pending',
        status: { $ne: 'cancelled' },
        'lineItems.inventoryItem': { $in: bookIds },
      }).lean(),
    ]);
    const bookById = new Map(books.map((book) => [toIdString(book._id), book]));

    if (books.length !== bookIds.length) {
      return sendValidationError(res, 'One or more selected books were not found');
    }

    const invoiceClassName = resolveInventoryIssueClassName({
      requestedClassName,
      fallbackClassName: getPrimaryBookClassName(classRecord),
      items: books,
    });
    if (!invoiceClassName) {
      return sendValidationError(res, 'Student class could not be resolved');
    }

    const blockingExistingIssues = getBlockingExistingIssues(existingIssues, bookById);
    if (blockingExistingIssues.length > 0) {
      const issuedBookNames = blockingExistingIssues.map((issue) => issue.bookName).filter(Boolean).join(', ');
      return sendValidationError(res, `${issuedBookNames || 'Selected book'} already issued to this student`);
    }

    const activeInvoiceHasBlockingItem = activeInvoice?.lineItems?.some((item) =>
      !allowsRepeatIssue(bookById.get(toIdString(item.inventoryItem)))
    );
    if (activeInvoiceHasBlockingItem) {
      return sendValidationError(res, `Selected book is already included in invoice ${activeInvoice.invoiceNo}`);
    }

    for (const bookId of bookIds) {
      const book = bookById.get(bookId);
      if (Number(book.availableStock || 0) <= 0) {
        return sendValidationError(res, `${book.name} is out of stock`);
      }

      const unitPrice = Number(book.price || 0);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return sendValidationError(res, `Set a price greater than 0 for ${book.name} before creating an invoice`);
      }

      if (!itemMatchesStudentClass(book, classNameCandidates)) {
        return sendValidationError(res, `${book.name} does not belong to ${formatClassLabel(classRecord)}`);
      }
    }

    const lineItems = bookIds.map((bookId) => {
      const book = bookById.get(bookId);
      const unitPrice = roundCurrency(book.price || 0);

      return {
        inventoryItem: book._id,
        inventoryModel: 'Book',
        itemName: book.name,
        itemType: normalizeBookItemType(book.itemType),
        subject: book.subject || '',
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
      };
    });
    const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));

    const invoice = await InventoryInvoice.create({
      invoiceNo: generateInvoiceNo('BOOK'),
      module: 'books',
      student: studentId,
      class: classRecord?._id || student.class || null,
      className: invoiceClassName,
      lineItems,
      subtotal,
      totalAmount: subtotal,
      paidAmount: 0,
      notes,
      createdBy: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: 'Book invoice created successfully',
      data: invoice,
    });
  } catch (error) {
    console.error('Error creating book invoice:', error);
    const friendlyMessage = getFriendlyMongooseError(error, 'Error creating book invoice');
    const statusCode = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const recordBookInvoicePayment = async (req, res) => {
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

    const invoice = await InventoryInvoice.findOne({ _id: invoiceId, module: 'books' });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Book invoice not found',
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
      message: 'Book payment recorded successfully',
      data: savedInvoice,
    });
  } catch (error) {
    console.error('Error recording book invoice payment:', error);
    const friendlyMessage = getFriendlyMongooseError(error, 'Error recording book invoice payment');
    return res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

export const issuePaidBookInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    if (!isValidObjectId(invoiceId)) {
      return sendValidationError(res, 'Invoice ID is invalid');
    }

    const invoice = await InventoryInvoice.findOne({ _id: invoiceId, module: 'books' });
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Book invoice not found',
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

    const bookIds = invoice.lineItems.map((item) => toIdString(item.inventoryItem));
    const [books, existingIssues] = await Promise.all([
      Book.find({ _id: { $in: bookIds } }).lean(),
      StudentBook.find({
        studentId: invoice.student,
        bookId: { $in: bookIds },
        status: 'issued',
      }).lean(),
    ]);
    const bookById = new Map(books.map((book) => [toIdString(book._id), book]));
    const blockingExistingIssues = getBlockingExistingIssues(existingIssues, bookById);

    if (blockingExistingIssues.length > 0) {
      const issuedBookNames = blockingExistingIssues.map((issue) => issue.bookName).filter(Boolean).join(', ');
      return sendValidationError(res, `${issuedBookNames || 'Selected book'} already issued to this student`);
    }

    const issuedAt = new Date();
    const issuedBy = req.user?.id || null;
    const issuedBooks = await runWithOptionalTransaction(async (session) => {
      const sessionOptions = session ? { session } : {};
      const nextIssuedBooks = [];

      for (const lineItem of invoice.lineItems) {
        const bookId = toIdString(lineItem.inventoryItem);
        const book = bookById.get(bookId);
        const updatedBook = await Book.findOneAndUpdate(
          {
            _id: bookId,
            availableStock: { $gt: 0 },
          },
          {
            $inc: {
              issuedCount: 1,
              availableStock: -1,
            },
          },
          { new: true, ...sessionOptions }
        );

        if (!updatedBook) {
          const stockError = new Error(`${lineItem.itemName} is out of stock`);
          stockError.statusCode = 400;
          throw stockError;
        }

        const [studentBook] = await StudentBook.create(
          [{
            studentId: invoice.student,
            bookId,
            bookName: lineItem.itemName,
            itemType: normalizeBookItemType(book?.itemType),
            className: invoice.className,
            issueDate: issuedAt,
            dueDate: isReturnableItem(book)
              ? new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
              : null,
            status: 'issued',
            notes: invoice.notes,
            issuedBy,
            invoice: invoice._id,
            invoiceNo: invoice.invoiceNo,
            price: lineItem.unitPrice,
            lineTotal: lineItem.lineTotal,
          }],
          sessionOptions
        );

        nextIssuedBooks.push({
          studentBookId: studentBook._id,
          bookId,
          bookName: lineItem.itemName,
          subject: lineItem.subject,
          issueDate: studentBook.issueDate,
          dueDate: studentBook.dueDate,
        });
      }

      invoice.issueStatus = 'issued';
      invoice.issuedAt = issuedAt;
      invoice.issuedBy = issuedBy;
      invoice.linkedBookRecords = nextIssuedBooks.map((book) => book.studentBookId);
      await invoice.save(sessionOptions);

      return nextIssuedBooks;
    });

    return res.status(201).json({
      success: true,
      message: 'Paid book invoice issued successfully',
      issuedCount: issuedBooks.length,
      data: issuedBooks,
    });
  } catch (error) {
    console.error('Error issuing paid book invoice:', error);
    const friendlyMessage = getFriendlyMongooseError(error, 'Error issuing paid book invoice');
    const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
    return res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

// Add new book to inventory
export const addBook = async (req, res) => {
  try {
    const requestedItemType = trimString(req.body.itemType).toLowerCase() || 'book';
    if (!BOOK_ITEM_TYPES.includes(requestedItemType)) {
      return sendValidationError(res, 'Please select a valid inventory item type');
    }

    const itemType = normalizeBookItemType(requestedItemType);
    const payload = {
      name: trimString(req.body.name),
      subject: trimString(req.body.subject) || (itemType === 'diary' ? 'Diary' : ''),
      className: itemType === 'diary' ? GLOBAL_BOOK_CLASS_NAME : trimString(req.body.className),
      itemType,
      totalStock: toNumber(req.body.totalStock),
      issuedCount: toNumber(req.body.issuedCount ?? 0),
      damagedCount: toNumber(req.body.damagedCount ?? 0),
      price: toNumber(req.body.price ?? 0),
    };

    if (!payload.name || !payload.subject || !payload.className) {
      return sendValidationError(res, 'Please provide book name, subject, and class');
    }

    if (!Number.isInteger(payload.totalStock) || payload.totalStock < 0) {
      return sendValidationError(res, 'Total stock must be a whole number 0 or greater');
    }

    if (!Number.isInteger(payload.issuedCount) || payload.issuedCount < 0) {
      return sendValidationError(res, 'Issued count must be a whole number 0 or greater');
    }

    if (!Number.isInteger(payload.damagedCount) || payload.damagedCount < 0) {
      return sendValidationError(res, 'Damaged count must be a whole number 0 or greater');
    }

    if (payload.issuedCount + payload.damagedCount > payload.totalStock) {
      return sendValidationError(res, 'Total stock must cover issued and damaged books');
    }

    if (!Number.isFinite(payload.price) || payload.price < 0) {
      return sendValidationError(res, 'Price must be 0 or greater');
    }

    // Check if book already exists
    const existingBook = await Book.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') },
      className: { $regex: new RegExp(`^${escapeRegex(payload.className)}$`, 'i') },
      itemType: payload.itemType === 'diary' ? 'diary' : { $ne: 'diary' },
    });
    if (existingBook) {
      return res.status(400).json({
        success: false,
        message: 'Book already exists for this class',
      });
    }


    // ✅ Don't set availableStock manually - let the pre-save hook handle it
    const book = await Book.create({
      ...payload,
    });

    res.status(201).json({
      success: true,
      message: 'Book added successfully',
      data: book,
    });
  } catch (error) {
    console.error('Add book error:', error);
    const friendlyMessage = getFriendlyMongooseError(error, 'Error adding book');
    const statusCode = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

// Update book inventory
export const updateBook = async (req, res) => {
  try {
    const { bookId } = req.params;

    if (!isValidObjectId(bookId)) {
      return sendValidationError(res, 'Book ID is invalid');
    }

    const currentBook = await Book.findById(bookId).lean();
    if (!currentBook) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const requestedItemType =
      trimString(req.body.itemType).toLowerCase() || normalizeBookItemType(currentBook.itemType);
    if (!BOOK_ITEM_TYPES.includes(requestedItemType)) {
      return sendValidationError(res, 'Please select a valid inventory item type');
    }

    const itemType = normalizeBookItemType(requestedItemType);
    if (itemType !== normalizeBookItemType(currentBook.itemType)) {
      const hasIssueHistory = await StudentBook.exists({ bookId });
      if (hasIssueHistory) {
        return sendValidationError(res, 'Inventory item type cannot be changed after it has been issued');
      }
    }

    const payload = {
      name: trimString(req.body.name),
      subject: trimString(req.body.subject) || (itemType === 'diary' ? 'Diary' : ''),
      className: itemType === 'diary' ? GLOBAL_BOOK_CLASS_NAME : trimString(req.body.className),
      itemType,
      totalStock: toNumber(req.body.totalStock),
      issuedCount: toNumber(req.body.issuedCount ?? 0),
      damagedCount: toNumber(req.body.damagedCount ?? 0),
      price: toNumber(req.body.price ?? 0),
    };

    if (!payload.name || !payload.subject || !payload.className) {
      return sendValidationError(res, 'Please provide book name, subject, and class');
    }

    if (!Number.isInteger(payload.totalStock) || payload.totalStock < 0) {
      return sendValidationError(res, 'Total stock must be a whole number 0 or greater');
    }

    if (!Number.isInteger(payload.issuedCount) || payload.issuedCount < 0) {
      return sendValidationError(res, 'Issued count must be a whole number 0 or greater');
    }

    if (!Number.isInteger(payload.damagedCount) || payload.damagedCount < 0) {
      return sendValidationError(res, 'Damaged count must be a whole number 0 or greater');
    }

    if (payload.issuedCount + payload.damagedCount > payload.totalStock) {
      return sendValidationError(res, 'Total stock must cover issued and damaged books');
    }

    if (!Number.isFinite(payload.price) || payload.price < 0) {
      return sendValidationError(res, 'Price must be 0 or greater');
    }

    const conflictingBook = await Book.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') },
      className: { $regex: new RegExp(`^${escapeRegex(payload.className)}$`, 'i') },
      itemType: payload.itemType === 'diary' ? 'diary' : { $ne: 'diary' },
      _id: { $ne: bookId },
    });

    if (conflictingBook) {
      return sendValidationError(res, 'Book already exists for this class');
    }

    const availableStock = payload.totalStock - payload.issuedCount - payload.damagedCount;

    const book = await Book.findByIdAndUpdate(
      bookId,
      { availableStock, ...payload },
      { new: true, runValidators: true }
    );

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Book updated successfully',
      data: book,
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, 'Error updating book');
    const statusCode = error.code === 11000 || error.name === 'ValidationError' ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

// Issue books to student
export const issueBooks = async (req, res) => {
  try {
    const studentId = trimString(req.body.studentId);
    const bookIds = Array.isArray(req.body.bookIds) ? req.body.bookIds.map(trimString).filter(Boolean) : [];
    const requestedClassName = trimString(req.body.className);
    const notes = trimString(req.body.notes);

    if (!isValidObjectId(studentId)) {
      return sendValidationError(res, 'Student ID is invalid');
    }

    if (bookIds.length === 0 || bookIds.some((bookId) => !isValidObjectId(bookId))) {
      return sendValidationError(res, 'Please select at least one valid book');
    }

    if (new Set(bookIds).size !== bookIds.length) {
      return sendValidationError(res, 'Each book can only be selected once');
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const [studentWithAcademicContext] = await attachAcademicContextToStudents([student.toObject()]);
    const classRecord = studentWithAcademicContext.classSession || studentWithAcademicContext.class || null;
    const classNameCandidates = getBookClassNameCandidates(classRecord, requestedClassName);
    const [books, existingIssues] = await Promise.all([
      Book.find({ _id: { $in: bookIds } }).lean(),
      StudentBook.find({
        studentId,
        bookId: { $in: bookIds },
        status: 'issued',
      }).lean(),
    ]);
    const bookById = new Map(books.map((book) => [toIdString(book._id), book]));

    if (books.length !== bookIds.length) {
      return sendValidationError(res, 'One or more selected books were not found');
    }

    const issueClassName = resolveInventoryIssueClassName({
      requestedClassName,
      fallbackClassName: getPrimaryBookClassName(classRecord),
      items: books,
    });
    if (!issueClassName) {
      return sendValidationError(res, 'Student class could not be resolved');
    }

    const blockingExistingIssues = getBlockingExistingIssues(existingIssues, bookById);
    if (blockingExistingIssues.length > 0) {
      const issuedBookNames = blockingExistingIssues.map((issue) => issue.bookName).filter(Boolean).join(', ');
      return sendValidationError(res, `${issuedBookNames || 'Selected book'} already issued to this student`);
    }

    for (const bookId of bookIds) {
      const book = bookById.get(bookId);
      if (Number(book.availableStock || 0) <= 0) {
        return sendValidationError(res, `${book.name} is out of stock`);
      }

      const unitPrice = Number(book.price || 0);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return sendValidationError(res, `Set a price greater than 0 for ${book.name} before issuing`);
      }

      if (!itemMatchesStudentClass(book, classNameCandidates)) {
        return sendValidationError(res, `${book.name} does not belong to ${formatClassLabel(classRecord)}`);
      }
    }

    const lineItems = bookIds.map((bookId) => {
      const book = bookById.get(bookId);
      const unitPrice = roundCurrency(book.price || 0);

      return {
        inventoryItem: book._id,
        inventoryModel: 'Book',
        itemName: book.name,
        itemType: normalizeBookItemType(book.itemType),
        subject: book.subject || '',
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
      };
    });
    const subtotal = roundCurrency(lineItems.reduce((sum, item) => sum + item.lineTotal, 0));
    const issuedAt = new Date();
    const issuedBy = req.user?.id || null;
    const result = await runWithOptionalTransaction(async (session) => {
      const sessionOptions = session ? { session } : {};
      const nextIssuedBooks = [];
      const [invoice] = await InventoryInvoice.create(
        [{
          invoiceNo: generateInvoiceNo('BOOK'),
          module: 'books',
          student: studentId,
          class: classRecord?._id || student.class || null,
          className: issueClassName,
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

      for (const lineItem of lineItems) {
        const bookId = toIdString(lineItem.inventoryItem);
        const book = bookById.get(bookId);
        const updatedBook = await Book.findOneAndUpdate(
          {
            _id: bookId,
            availableStock: { $gt: 0 },
          },
          {
            $inc: {
              issuedCount: 1,
              availableStock: -1,
            },
          },
          { new: true, ...sessionOptions }
        );

        if (!updatedBook) {
          const stockError = new Error(`${book.name} is out of stock`);
          stockError.statusCode = 400;
          throw stockError;
        }

        const [studentBook] = await StudentBook.create(
          [{
            studentId,
            bookId,
            bookName: book.name,
            itemType: normalizeBookItemType(book.itemType),
            className: issueClassName,
            issueDate: issuedAt,
            dueDate: isReturnableItem(book)
              ? new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
              : null,
            status: 'issued',
            notes,
            issuedBy,
            invoice: invoice._id,
            invoiceNo: invoice.invoiceNo,
            price: lineItem.unitPrice,
            lineTotal: lineItem.lineTotal,
          }],
          sessionOptions
        );

        nextIssuedBooks.push({
          studentBookId: studentBook._id,
          bookId,
          bookName: book.name,
          subject: book.subject,
          issueDate: studentBook.issueDate,
          dueDate: studentBook.dueDate,
        });
      }

      invoice.linkedBookRecords = nextIssuedBooks.map((book) => book.studentBookId);
      await invoice.save(sessionOptions);

      return {
        invoice,
        issuedBooks: nextIssuedBooks,
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Books issued successfully. Payment is marked due.',
      issuedCount: result.issuedBooks.length,
      data: result.invoice,
      invoice: result.invoice,
      issuedBooks: result.issuedBooks,
    });
  } catch (error) {
    const friendlyMessage = getFriendlyMongooseError(error, 'Error issuing books');
    const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
    return res.status(statusCode).json({
      success: false,
      message: friendlyMessage,
    });
  }
};

// Get student's issued books
export const getStudentBooks = async (req, res) => {
  try {
    const { studentId } = req.params;

    const rawStudentBooks = await StudentBook.find({ studentId })
      .populate('bookId', 'name subject itemType')
      .populate('issuedBy', 'name email firstName lastName')
      .sort({ issueDate: -1 })
      .lean();
    const studentBooks = getDisplayBookLedgerRecords(rawStudentBooks);

    if (!studentBooks || studentBooks.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      count: studentBooks.length,
      data: studentBooks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching student books',
      error: error.message,
    });
  }
};

// Return book
export const returnBook = async (req, res) => {
  try {
    const { studentBookId } = req.params;
    const condition = trimString(req.body.condition) || 'good';
    const notes = trimString(req.body.notes);

    if (!['good', 'damaged', 'lost'].includes(condition)) {
      return sendValidationError(res, 'Please select a valid return condition');
    }

    const studentBook = await StudentBook.findById(studentBookId);

    if (!studentBook) {
      return res.status(404).json({
        success: false,
        message: 'Book record not found',
      });
    }

    if (studentBook.status !== 'issued') {
      return res.status(400).json({
        success: false,
        message: 'Book is not currently issued',
      });
    }

    const book = await Book.findById(studentBook.bookId);
    if (!isReturnableItem(book || studentBook)) {
      return sendValidationError(res, 'Diary issues are final and cannot be returned');
    }

    // Update student book record
    studentBook.returnDate = new Date();
    studentBook.status = condition === 'damaged' || condition === 'lost' ? condition : 'returned';
    studentBook.condition = condition;
    studentBook.notes = notes;

    // Calculate fine if overdue
    if (studentBook.dueDate && new Date() > studentBook.dueDate) {
      const daysOverdue = Math.floor((new Date() - studentBook.dueDate) / (1000 * 60 * 60 * 24));
      studentBook.fine = daysOverdue * 10; // 10 per day
    }

    await studentBook.save();

    // Update book inventory
    if (book) {
      book.issuedCount = Math.max(0, book.issuedCount - 1);
      if (condition === 'damaged' || condition === 'lost') {
        book.damagedCount += 1;
      }
      await book.save();
    }

    res.status(200).json({
      success: true,
      message: 'Book returned successfully',
      data: studentBook,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error returning book',
      error: error.message,
    });
  }
};

// Get class distribution status
export const getClassDistribution = async (req, res) => {
  try {
    const className = trimString(req.params.className);

    if (!className) {
      return sendValidationError(res, 'Class name is required');
    }

    const requestedClassKey = className.toLowerCase();
    const studentsWithAcademicContext = await attachAcademicContextToStudents(await Student.find().lean());
    const students = studentsWithAcademicContext.filter((student) => {
      const classRecord = student.classSession || student.class || null;
      const classKeys = getBookClassNameCandidates(classRecord)
        .map((value) => value.toLowerCase())
        .filter(Boolean);

      return classKeys.some((key) => (
        key === requestedClassKey ||
        key.startsWith(`${requestedClassKey}-`) ||
        key.startsWith(`${requestedClassKey} (`)
      ));
    });

    const issuedBooks = await StudentBook.find({
      className: { $regex: new RegExp(`^${escapeRegex(className)}$`, 'i') },
      status: 'issued',
    });

    // Count students with and without books
    const studentsWithBooks = new Set(issuedBooks.map(sb => sb.studentId.toString())).size;
    const studentsWithoutBooks = students.length - studentsWithBooks;

    res.status(200).json({
      success: true,
      data: {
        className,
        totalStudents: students.length,
        studentsWithBooks,
        studentsWithoutBooks,
        totalBooksIssued: issuedBooks.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching distribution status',
      error: error.message,
    });
  }
};

// Get overdue books
export const getOverdueBooks = async (req, res) => {
  try {
    const overdueBooks = await StudentBook.find({
      status: 'issued',
      dueDate: { $lt: new Date() },
    })
      .populate('studentId', 'name firstName lastName studentId admissionNo')
      .populate('bookId', 'name subject')
      .sort({ dueDate: 1 });

    res.status(200).json({
      success: true,
      count: overdueBooks.length,
      data: overdueBooks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching overdue books',
      error: error.message,
    });
  }
};

// Generate book report
export const getBookReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const className = trimString(req.params.className || req.query.className);

    let query = {};
    if (className) query.className = className;

    const rawReport = await StudentBook.find(query)
      .populate('studentId', 'name firstName lastName studentId admissionNo class')
      .populate('bookId', 'name subject')
      .lean();
    const report = getDisplayBookLedgerRecords(rawReport);

    const summary = {
      totalIssued: report.filter(r => r.status === 'issued').length,
      totalReturned: report.filter(r => r.status === 'returned').length,
      totalDamaged: report.filter(r => r.status === 'damaged').length,
      totalLost: report.filter(r => r.status === 'lost').length,
      totalFine: report.reduce((sum, r) => sum + (r.fine || 0), 0),
    };

    res.status(200).json({
      success: true,
      summary,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating report',
      error: error.message,
    });
  }
};

// Delete book
export const deleteBook = async (req, res) => {
  try {
    const { bookId } = req.params;
    const book = await Book.findById(bookId);

    const issuedCount = isReturnableItem(book)
      ? await StudentBook.countDocuments({
          bookId,
          status: 'issued',
        })
      : 0;

    if (issuedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete book. ${issuedCount} copies are still issued.`,
      });
    }

    await book.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Book deleted successfully',
      data: book,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting book',
      error: error.message,
    });
  }
};
