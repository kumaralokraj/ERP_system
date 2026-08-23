import express from 'express';
import {
  getAllBooks,
  getClassBookStats,
  addBook,
  updateBook,
  recordBookInvoicePayment,
  issueBooks,
  getStudentBooks,
  getStudentBookProfile,
  returnBook,
  getClassDistribution,
  getOverdueBooks,
  getBookReport,
  deleteBook,
} from '../../controllers/booksController.js';
import adminAuth from '../../middlewares/adminAuth.js';
import { authorizePermissions } from '../../middleware/permissions.js';

const adminBooksRouter = express.Router();

// Books management
adminBooksRouter.get('/all', adminAuth, authorizePermissions('books.view'), getAllBooks);
adminBooksRouter.get('/stats', adminAuth, authorizePermissions('books.view'), getClassBookStats);
adminBooksRouter.post('/add', adminAuth, authorizePermissions('books.view'), addBook);
adminBooksRouter.put('/update/:bookId', adminAuth, authorizePermissions('books.view'), updateBook);
adminBooksRouter.delete('/delete/:bookId', adminAuth, authorizePermissions('books.view'), deleteBook);

// Book distribution
adminBooksRouter.post('/invoices', adminAuth, authorizePermissions('books.view'), issueBooks);
adminBooksRouter.post('/invoices/:invoiceId/payments', adminAuth, authorizePermissions('books.view'), recordBookInvoicePayment);
adminBooksRouter.post('/issue', adminAuth, authorizePermissions('books.view'), issueBooks);
adminBooksRouter.get('/student/:studentId', adminAuth, authorizePermissions('books.view'), getStudentBooks);
adminBooksRouter.get('/student-profile/:studentId', adminAuth, authorizePermissions('books.view'), getStudentBookProfile);
adminBooksRouter.put('/return/:studentBookId', adminAuth, authorizePermissions('books.view'), returnBook);

// Statistics and reports
adminBooksRouter.get('/distribution/:className', adminAuth, authorizePermissions('books.view'), getClassDistribution);
adminBooksRouter.get('/overdue', adminAuth, authorizePermissions('books.view'), getOverdueBooks);
adminBooksRouter.get('/report/:className', adminAuth, authorizePermissions('books.view'), getBookReport);

export default adminBooksRouter;
