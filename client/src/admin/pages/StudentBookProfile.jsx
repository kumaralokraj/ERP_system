import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  PackageOpen,
  Plus,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import { getApiErrorMessage } from '../../lib/formValidation';
import {
  allowsRepeatIssue,
  isDiaryItem,
  isReturnableItem,
} from '../../lib/bookInventory';

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getStudentName = (student = {}) =>
  student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';

const getAdmissionNo = (student = {}) => student.admissionNo || student.studentId || 'N/A';

const escapeHtml = (value = '') =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));

const getParentNames = (student = {}) => {
  const fatherName = student.parent?.fatherName || student.parentName || '';
  const motherName = student.parent?.motherName || '';
  return [fatherName, motherName].filter(Boolean).join(' / ') || 'N/A';
};

const getParentPhone = (student = {}) =>
  student.parent?.phone || student.parentPhone || student.phone || 'N/A';

const getClassLabel = (classRecord) => {
  if (!classRecord) return 'N/A';
  if (classRecord.displayName) return classRecord.displayName;

  const className = classRecord.name || classRecord.classId?.name || '';
  const section = classRecord.section ? `-${classRecord.section}` : '';
  const academicYear = classRecord.academicYear ? ` (${classRecord.academicYear})` : '';
  return `${className}${section}${academicYear}`.trim() || 'N/A';
};

const getStatusLabel = (status = '') => {
  const normalizedStatus = String(status || 'pending').toLowerCase();
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const getStatusClass = (status = '') => {
  switch (String(status || '').toLowerCase()) {
    case 'complete':
    case 'issued':
    case 'returned':
      return 'bg-green-100 text-green-700';
    case 'partial':
      return 'bg-blue-100 text-blue-700';
    case 'damaged':
    case 'lost':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-amber-100 text-amber-700';
  }
};

const getPaymentStatusClass = (status = '') => {
  switch (String(status || '').toLowerCase()) {
    case 'paid':
      return 'bg-green-100 text-green-700';
    case 'partial':
      return 'bg-blue-100 text-blue-700';
    case 'refunded':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-amber-100 text-amber-700';
  }
};

const getIssuedByName = (record = {}) =>
  record.issuedBy?.name ||
  `${record.issuedBy?.firstName || ''} ${record.issuedBy?.lastName || ''}`.trim() ||
  'System Admin';

const isPlaceholderBookLedgerRecord = (record = {}) =>
  String(record.status || '').toLowerCase() === 'pending' &&
  !record.bookId &&
  !String(record.bookName || '').trim();

const StudentBookProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { axios, token } = useAuth();
  const { notify, confirm } = useNotifier();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState(new Set());
  const [issueNotes, setIssueNotes] = useState('');
  const [issueError, setIssueError] = useState('');
  const [issueLoading, setIssueLoading] = useState(false);
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [invoiceActionLoading, setInvoiceActionLoading] = useState('');
  const [returnLoadingId, setReturnLoadingId] = useState('');

  const student = profile?.student || {};
  const classRecord = profile?.class || student.classSession || student.class || null;
  const summary = profile?.summary || {};
  const ledger = useMemo(
    () => (Array.isArray(profile?.ledger) ? profile.ledger.filter((record) => !isPlaceholderBookLedgerRecord(record)) : []),
    [profile]
  );
  const availableBooks = useMemo(
    () => (Array.isArray(profile?.availableBooks) ? profile.availableBooks : []),
    [profile]
  );
  const invoices = useMemo(
    () => (Array.isArray(profile?.invoices) ? profile.invoices : []),
    [profile]
  );

  const activeInvoiceBookIds = useMemo(
    () =>
      new Set(
        invoices
          .filter((invoice) => invoice.issueStatus === 'pending' && invoice.status !== 'cancelled')
          .flatMap((invoice) => invoice.lineItems || [])
          .map((item) => String(item.inventoryItem || ''))
          .filter(Boolean)
      ),
    [invoices]
  );

  const issuedBookIds = useMemo(
    () =>
      new Set(
        ledger
          .filter((record) => record.status === 'issued')
          .map((record) => record.bookId?._id || record.bookId)
          .filter(Boolean)
          .map(String)
      ),
    [ledger]
  );

  const issuedBookNames = useMemo(
    () =>
      new Set(
        ledger
          .filter((record) => record.status === 'issued')
          .map((record) => String(record.bookName || record.bookId?.name || '').toLowerCase())
          .filter(Boolean)
      ),
    [ledger]
  );

  const issuableBooks = useMemo(
    () =>
      availableBooks.filter((book) => {
        const bookId = String(book._id);
        const bookName = String(book.name || '').toLowerCase();
        const repeatIssueAllowed = allowsRepeatIssue(book);
        return (
          (repeatIssueAllowed ||
            (!issuedBookIds.has(bookId) &&
              !issuedBookNames.has(bookName) &&
              !activeInvoiceBookIds.has(bookId))) &&
          Number(book.availableStock || 0) > 0
        );
      }),
    [availableBooks, issuedBookIds, issuedBookNames, activeInvoiceBookIds]
  );

  const selectedInvoiceTotal = useMemo(
    () =>
      availableBooks
        .filter((book) => selectedBookIds.has(book._id))
        .reduce((sum, book) => sum + Number(book.price || 0), 0),
    [availableBooks, selectedBookIds]
  );

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get(`/admin/books/student-profile/${studentId}`, {
        headers: { token },
      });
      setProfile(response.data?.data || null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Failed to load student book profile'));
    } finally {
      setLoading(false);
    }
  }, [axios, studentId, token]);

  useEffect(() => {
    if (token && studentId) {
      fetchProfile();
    }
  }, [fetchProfile, studentId, token]);

  const openIssueModal = useCallback(() => {
    setSelectedBookIds(new Set());
    setIssueNotes('');
    setIssueError('');
    setShowIssueModal(true);
  }, []);

  const clearIssueSearchParam = useCallback(() => {
    if (searchParams.get('issue') !== '1') {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('issue');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeIssueModal = useCallback(() => {
    setShowIssueModal(false);
    setIssueError('');
    clearIssueSearchParam();
  }, [clearIssueSearchParam]);

  useEffect(() => {
    if (!profile || searchParams.get('issue') !== '1') {
      return;
    }

    openIssueModal();
    clearIssueSearchParam();
  }, [clearIssueSearchParam, openIssueModal, profile, searchParams]);

  const toggleBook = (bookId) => {
    setIssueError('');
    setSelectedBookIds((currentBookIds) => {
      const nextBookIds = new Set(currentBookIds);
      if (nextBookIds.has(bookId)) {
        nextBookIds.delete(bookId);
      } else {
        nextBookIds.add(bookId);
      }
      return nextBookIds;
    });
  };

  const toggleAllBooks = () => {
    setIssueError('');
    setSelectedBookIds((currentBookIds) => {
      if (currentBookIds.size === issuableBooks.length) {
        return new Set();
      }
      return new Set(issuableBooks.map((book) => book._id));
    });
  };

  const handleIssueSubmit = async (event) => {
    event.preventDefault();
    const bookIds = [...selectedBookIds];

    if (bookIds.length === 0) {
      setIssueError('Select at least one item to issue');
      return;
    }

    try {
      setIssueLoading(true);
      setIssueError('');
      await axios.post(
        '/admin/books/issue',
        {
          studentId,
          bookIds,
          className: profile?.bookClassName,
          notes: issueNotes,
        },
        { headers: { token } }
      );

      notify.success('Items issued successfully. Payment is due.');
      closeIssueModal();
      await fetchProfile();
    } catch (requestError) {
      setIssueError(getApiErrorMessage(requestError, 'Failed to issue items'));
    } finally {
      setIssueLoading(false);
    }
  };

  const updatePaymentDraft = (invoiceId, patch) => {
    setPaymentDrafts((currentDrafts) => ({
      ...currentDrafts,
      [invoiceId]: {
        amount: '',
        mode: 'cash',
        transactionId: '',
        note: '',
        ...(currentDrafts[invoiceId] || {}),
        ...patch,
      },
    }));
  };

  const getPaymentDraft = (invoice) => {
    const remaining = Math.max(Number(invoice.balanceAmount ?? invoice.totalAmount - invoice.paidAmount) || 0, 0);
    return paymentDrafts[invoice._id] || {
      amount: remaining ? String(remaining) : '',
      mode: 'cash',
      transactionId: '',
      note: '',
    };
  };

  const handleCollectPayment = async (invoice) => {
    const draft = getPaymentDraft(invoice);

    try {
      setInvoiceActionLoading(`pay-${invoice._id}`);
      await axios.post(
        `/admin/books/invoices/${invoice._id}/payments`,
        {
          amount: Number(draft.amount),
          mode: draft.mode,
          transactionId: draft.transactionId,
          note: draft.note,
        },
        { headers: { token } }
      );
      notify.success('Book payment recorded');
      setPaymentDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[invoice._id];
        return nextDrafts;
      });
      await fetchProfile();
    } catch (requestError) {
      notify.error(getApiErrorMessage(requestError, 'Failed to record payment'));
    } finally {
      setInvoiceActionLoading('');
    }
  };

  const handlePrintInvoice = (invoice) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      notify.error('Allow pop-ups to print the invoice');
      return;
    }

    const balanceAmount = Math.max(
      Number(invoice.balanceAmount ?? invoice.totalAmount - invoice.paidAmount) || 0,
      0
    );
    const lineRows = (invoice.lineItems || []).map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>
          <strong>${escapeHtml(item.itemName)}</strong>
          <div class="muted">${escapeHtml(item.subject || 'Book')}</div>
        </td>
        <td class="right">${escapeHtml(item.quantity || 1)}</td>
        <td class="right">${escapeHtml(formatCurrency(item.unitPrice))}</td>
        <td class="right">${escapeHtml(formatCurrency(item.lineTotal))}</td>
      </tr>
    `).join('');
    const paymentRows = (invoice.payments || []).map((payment) => `
      <tr>
        <td>${escapeHtml(formatDate(payment.paymentDate))}</td>
        <td>${escapeHtml(String(payment.mode || '').replace('_', ' '))}</td>
        <td>${escapeHtml(payment.transactionId || '-')}</td>
        <td class="right">${escapeHtml(formatCurrency(payment.amount))}</td>
      </tr>
    `).join('');

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${escapeHtml(invoice.invoiceNo || 'Book Invoice')}</title>
          <style>
            body { color: #111827; font-family: Arial, sans-serif; margin: 28px; }
            .header { align-items: flex-start; border-bottom: 2px solid #111827; display: flex; justify-content: space-between; padding-bottom: 18px; }
            h1 { font-size: 24px; margin: 0 0 6px; }
            h2 { font-size: 16px; margin: 24px 0 10px; }
            .muted { color: #6b7280; font-size: 12px; margin-top: 4px; }
            .meta { display: grid; gap: 6px; margin-top: 18px; }
            table { border-collapse: collapse; margin-top: 10px; width: 100%; }
            th, td { border: 1px solid #d1d5db; font-size: 13px; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; }
            .right { text-align: right; }
            .totals { margin-left: auto; margin-top: 18px; width: 280px; }
            .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
            .grand { border-top: 1px solid #111827; font-weight: 700; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Book Invoice</h1>
              <div class="muted">Golden Public School</div>
            </div>
            <div class="right">
              <strong>${escapeHtml(invoice.invoiceNo)}</strong>
              <div class="muted">Created ${escapeHtml(formatDate(invoice.createdAt))}</div>
              <div class="muted">Payment: ${escapeHtml(getStatusLabel(invoice.paymentStatus))}</div>
            </div>
          </div>

          <div class="meta">
            <div><strong>Student:</strong> ${escapeHtml(getStudentName(student))}</div>
            <div><strong>Admission No:</strong> ${escapeHtml(getAdmissionNo(student))}</div>
            <div><strong>Class:</strong> ${escapeHtml(getClassLabel(classRecord))}</div>
          </div>

          <h2>Items</h2>
          <table>
            <thead>
              <tr><th>#</th><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr>
            </thead>
            <tbody>${lineRows}</tbody>
          </table>

          <div class="totals">
            <div><span>Subtotal</span><span>${escapeHtml(formatCurrency(invoice.subtotal || invoice.totalAmount))}</span></div>
            <div><span>Paid</span><span>${escapeHtml(formatCurrency(invoice.paidAmount))}</span></div>
            <div class="grand"><span>Balance</span><span>${escapeHtml(formatCurrency(balanceAmount))}</span></div>
          </div>

          ${(invoice.payments || []).length > 0 ? `
            <h2>Receipts</h2>
            <table>
              <thead>
                <tr><th>Date</th><th>Mode</th><th>Reference</th><th class="right">Amount</th></tr>
              </thead>
              <tbody>${paymentRows}</tbody>
            </table>
          ` : ''}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleReturnBook = async (record) => {
    if (!isReturnableItem({ itemType: record.itemType || record.bookId?.itemType })) {
      notify.error('Diary issues are final and cannot be returned');
      return;
    }

    const confirmed = await confirm({
      title: 'Return book',
      message: `Return ${record.bookName || record.bookId?.name || 'this book'} for ${getStudentName(student)}?`,
      confirmText: 'Return',
      tone: 'primary',
    });

    if (!confirmed) return;

    try {
      setReturnLoadingId(record._id);
      await axios.put(
        `/admin/books/return/${record._id}`,
        { condition: 'good', notes: 'Returned from student book profile' },
        { headers: { token } }
      );
      notify.success('Book returned successfully');
      await fetchProfile();
    } catch (requestError) {
      notify.error(getApiErrorMessage(requestError, 'Failed to return book'));
    } finally {
      setReturnLoadingId('');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <button
          type="button"
          onClick={() => navigate('/admin/books')}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Books
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => navigate('/admin/books')}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Books
        </button>
        <button
          type="button"
          onClick={openIssueModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <BookOpen className="h-4 w-4" />
          Issue Items
        </button>
      </div>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Student Book & Diary Profile</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-950">{getStudentName(student)}</h1>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(summary.bookStatus)}`}>
            {summary.bookStatus || 'Pending'}
          </span>
        </div>

        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-gray-500">Class</p>
            <p className="font-semibold text-gray-950">{getClassLabel(classRecord)}</p>
          </div>
          <div>
            <p className="text-gray-500">Admission No</p>
            <p className="font-semibold text-gray-950">{getAdmissionNo(student)}</p>
          </div>
          <div className="lg:col-span-2">
            <p className="text-gray-500">Parent Name</p>
            <p className="font-semibold text-gray-950">{getParentNames(student)}</p>
          </div>
          <div>
            <p className="text-gray-500">Phone</p>
            <p className="font-semibold text-gray-950">{getParentPhone(student)}</p>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-blue-500 bg-white p-5 shadow-sm">
          <BookOpen className="mb-3 h-5 w-5 text-blue-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Currently Issued</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{summary.totalIssuedBooks || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-amber-500 bg-white p-5 shadow-sm">
          <PackageOpen className="mb-3 h-5 w-5 text-amber-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Pending Items</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{summary.pendingBooks || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-red-500 bg-white p-5 shadow-sm">
          <Clock className="mb-3 h-5 w-5 text-red-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Overdue</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{summary.overdueBooks || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-green-500 bg-white p-5 shadow-sm">
          <CheckCircle2 className="mb-3 h-5 w-5 text-green-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Last Issue Date</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatDate(summary.lastIssueDate)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-indigo-500 bg-white p-5 shadow-sm">
          <CheckCircle2 className="mb-3 h-5 w-5 text-indigo-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Due Balance</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatCurrency(summary.invoiceBalance)}</p>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-950">Book & Diary Payments</h2>
            <p className="text-sm text-gray-500">Issue inventory items first, then collect dues here</p>
          </div>
          <button
            type="button"
            onClick={openIssueModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Plus className="h-4 w-4" />
            Issue Items
          </button>
        </div>

        <div className="space-y-4 p-5">
          {invoices.length > 0 ? (
            invoices.map((invoice) => {
              const remaining = Math.max(Number(invoice.balanceAmount ?? invoice.totalAmount - invoice.paidAmount) || 0, 0);
              const draft = getPaymentDraft(invoice);
              const canPay = invoice.issueStatus !== 'cancelled' && remaining > 0;
              const canPrint = Number(invoice.paidAmount || 0) > 0;

              return (
                <div key={invoice._id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-blue-600">{invoice.invoiceNo}</p>
                      <h3 className="mt-1 text-lg font-bold text-gray-950">{formatCurrency(invoice.totalAmount)}</h3>
                      <p className="text-sm text-gray-500">Created {formatDate(invoice.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPaymentStatusClass(invoice.paymentStatus)}`}>
                        {getStatusLabel(invoice.paymentStatus)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(invoice.issueStatus)}`}>
                        {getStatusLabel(invoice.issueStatus)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_280px]">
                    <div className="space-y-2">
                      {(invoice.lineItems || []).map((item) => (
                        <div key={`${invoice._id}-${item.inventoryItem}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                          <div>
                            <p className="font-semibold text-gray-900">{item.itemName}</p>
                            <p className="text-xs text-gray-500">{item.subject || 'Book'} x {item.quantity}</p>
                            {isDiaryItem(item) && (
                              <p className="mt-1 text-xs font-semibold text-purple-700">Diary - repeat issue allowed</p>
                            )}
                          </div>
                          <p className="font-semibold text-gray-900">{formatCurrency(item.lineTotal)}</p>
                        </div>
                      ))}
                      {(invoice.payments || []).length > 0 && (
                        <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-600">
                          <p className="mb-2 font-bold uppercase text-gray-500">Receipts</p>
                          {(invoice.payments || []).map((payment) => (
                            <div key={payment._id} className="flex justify-between border-t border-gray-100 py-2 first:border-t-0">
                              <span>{formatDate(payment.paymentDate)} - {String(payment.mode || '').replace('_', ' ')}</span>
                              <span className="font-semibold text-gray-900">{formatCurrency(payment.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <p className="text-gray-500">Paid</p>
                        <p className="text-right font-semibold">{formatCurrency(invoice.paidAmount)}</p>
                        <p className="text-gray-500">Balance</p>
                        <p className="text-right font-semibold">{formatCurrency(remaining)}</p>
                      </div>

                      {canPay && (
                        <div className="mt-4 space-y-2">
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={draft.amount}
                            onChange={(event) => updatePaymentDraft(invoice._id, { amount: event.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="Amount"
                          />
                          <select
                            value={draft.mode}
                            onChange={(event) => updatePaymentDraft(invoice._id, { mode: event.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="cheque">Cheque</option>
                          </select>
                          <input
                            type="text"
                            value={draft.transactionId}
                            onChange={(event) => updatePaymentDraft(invoice._id, { transactionId: event.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="Reference no. optional"
                          />
                          <input
                            type="text"
                            value={draft.note}
                            onChange={(event) => updatePaymentDraft(invoice._id, { note: event.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                            placeholder="Payment note optional"
                          />
                          <button
                            type="button"
                            onClick={() => handleCollectPayment(invoice)}
                            disabled={invoiceActionLoading === `pay-${invoice._id}`}
                            className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            {invoiceActionLoading === `pay-${invoice._id}` ? 'Recording...' : 'Collect Payment'}
                          </button>
                        </div>
                      )}

                      {canPrint && (
                        <button
                          type="button"
                          onClick={() => handlePrintInvoice(invoice)}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Printer className="h-4 w-4" />
                          Print Invoice
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              No book or diary payment dues yet.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-950">Book & Diary Issue Ledger</h2>
            <p className="text-sm text-gray-500">Student-wise issue history; diaries are final distributions</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px]">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">Item Name</th>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Issue Date</th>
                <th className="px-5 py-3">Due Date</th>
                <th className="px-5 py-3">Return Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Issued By</th>
                <th className="px-5 py-3">Notes</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length > 0 ? (
                ledger.map((record) => (
                  <tr key={record._id} className="border-t border-gray-100 text-sm">
                    <td className="px-5 py-4 font-semibold text-gray-950">
                      {record.bookName || record.bookId?.name}
                      {isDiaryItem({ itemType: record.itemType || record.bookId?.itemType }) && (
                        <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">Diary</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-700">{record.bookId?.subject || 'N/A'}</td>
                    <td className="px-5 py-4 text-gray-700">{formatDate(record.issueDate)}</td>
                    <td className="px-5 py-4 text-gray-700">{formatDate(record.dueDate)}</td>
                    <td className="px-5 py-4 text-gray-700">{formatDate(record.returnDate)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(record.status)}`}>
                        {getStatusLabel(record.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{record.invoiceNo || 'N/A'}</td>
                    <td className="px-5 py-4 text-gray-700">{formatCurrency(record.lineTotal || record.price)}</td>
                    <td className="px-5 py-4 text-gray-700">{getIssuedByName(record)}</td>
                    <td className="px-5 py-4 text-gray-700">{record.notes || 'N/A'}</td>
                    <td className="px-5 py-4">
                      {record.status === 'issued' && isReturnableItem({ itemType: record.itemType || record.bookId?.itemType }) ? (
                        <button
                          type="button"
                          onClick={() => handleReturnBook(record)}
                          disabled={returnLoadingId === record._id}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {returnLoadingId === record._id ? 'Returning...' : 'Return'}
                        </button>
                      ) : isDiaryItem({ itemType: record.itemType || record.bookId?.itemType }) ? (
                        <span className="font-medium text-purple-700">Final issue</span>
                      ) : (
                        <span className="text-gray-500">Closed</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="11" className="px-5 py-12 text-center text-sm font-medium text-gray-500">
                    No books or diaries issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 p-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-950">Issue Books & Diaries</h2>
                <p className="mt-1 text-sm text-gray-500">{getStudentName(student)} - {getAdmissionNo(student)}</p>
              </div>
              <button
                type="button"
                onClick={closeIssueModal}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close issue books"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} className="overflow-y-auto p-5">
              <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase text-blue-700">Student</p>
                <p className="mt-1 text-lg font-bold text-gray-950">{getStudentName(student)}</p>
                <p className="text-sm text-gray-600">{getClassLabel(classRecord)}</p>
              </div>

              {issueError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {issueError}
                </div>
              )}

              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-semibold text-gray-950">Available Items</h3>
                {issuableBooks.length > 0 && (
                  <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                    <input
                      type="checkbox"
                      checked={selectedBookIds.size === issuableBooks.length}
                      onChange={toggleAllBooks}
                      className="h-4 w-4 accent-blue-600"
                    />
                    Select all ({selectedBookIds.size}/{issuableBooks.length})
                  </label>
                )}
              </div>

              {availableBooks.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  No book or diary inventory is configured for this student.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableBooks.map((book) => {
                    const bookId = String(book._id);
                    const repeatIssueAllowed = allowsRepeatIssue(book);
                    const alreadyIssued =
                      !repeatIssueAllowed &&
                      (issuedBookIds.has(bookId) || issuedBookNames.has(String(book.name || '').toLowerCase()));
                    const alreadyInvoiced = !repeatIssueAllowed && activeInvoiceBookIds.has(bookId);
                    const outOfStock = Number(book.availableStock || 0) <= 0;
                    const disabled = alreadyIssued || alreadyInvoiced || outOfStock;
                    const selected = selectedBookIds.has(book._id);

                    return (
                      <label
                        key={book._id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition ${
                          selected
                            ? 'border-blue-500 bg-blue-50'
                            : disabled
                              ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
                              : 'border-gray-200 bg-white hover:border-blue-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={() => toggleBook(book._id)}
                          className="mt-1 h-4 w-4 accent-blue-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-gray-950">{book.name}</p>
                          <p className="text-sm text-gray-600">{book.subject}</p>
                          {isDiaryItem(book) && (
                            <p className="mt-1 text-xs font-semibold text-purple-700">
                              All students - repeat issue allowed - no return
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-500">
                            Available: {book.availableStock}/{book.totalStock}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-gray-700">{formatCurrency(book.price)}</p>
                        </div>
                        {alreadyIssued && <span className="text-xs font-semibold text-gray-500">Issued</span>}
                        {!alreadyIssued && alreadyInvoiced && <span className="text-xs font-semibold text-blue-600">Invoiced</span>}
                        {!alreadyIssued && outOfStock && <span className="text-xs font-semibold text-red-600">Out</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-5">
                <label className="mb-1 block text-sm font-semibold text-gray-700">Notes</label>
                <textarea
                  value={issueNotes}
                  onChange={(event) => setIssueNotes(event.target.value)}
                  rows={4}
                  placeholder="Optional issue note"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase text-blue-700">Amount Due</p>
                <p className="mt-1 text-2xl font-bold text-blue-800">{formatCurrency(selectedInvoiceTotal)}</p>
              </div>
            </form>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeIssueModal}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleIssueSubmit}
                disabled={issueLoading || selectedBookIds.size === 0}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {issueLoading ? 'Issuing...' : 'Issue Items'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentBookProfile;
