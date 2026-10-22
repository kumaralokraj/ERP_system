import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  Printer,
  Shirt,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import { getUniformSizePrice } from '../../lib/uniformPricing';
import { getApiErrorMessage } from '../../lib/formValidation';

const initialIssueRows = [{ itemName: '', size: '', quantity: 1 }];

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
  const parentNames = [fatherName, motherName].filter(Boolean).join(' / ');
  return parentNames || 'N/A';
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
  if (normalizedStatus === 'issued') return 'Complete';
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const getLedgerStatusLabel = (status = '') => {
  const normalizedStatus = String(status || 'issued').toLowerCase();
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const getStatusClass = (status = '') => {
  switch (String(status || '').toLowerCase()) {
    case 'complete':
    case 'issued':
      return 'bg-green-100 text-green-700';
    case 'partial':
      return 'bg-blue-100 text-blue-700';
    case 'damaged':
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

const getConditionClass = (condition = '') => {
  switch (String(condition || '').toLowerCase()) {
    case 'damaged':
      return 'bg-red-100 text-red-700';
    case 'worn':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-green-100 text-green-700';
  }
};

const getAvailableStock = (item, size) => {
  if (!item || !size) return 0;
  const sizeRecord = item.sizes?.find((sizeItem) => sizeItem.size === size);
  return Number(sizeRecord?.stock || 0);
};

const normalizeIssueRows = (rows) =>
  rows.map((row) => ({
    itemName: String(row.itemName || '').trim(),
    size: String(row.size || '').trim(),
    quantity: Number(row.quantity || 0),
  }));

const StudentUniformProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { axios, token } = useAuth();
  const { notify } = useNotifier();

  const [profile, setProfile] = useState(null);
  const [uniformItems, setUniformItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueRows, setIssueRows] = useState(initialIssueRows);
  const [issueNotes, setIssueNotes] = useState('');
  const [issueErrors, setIssueErrors] = useState({});
  const [issueLoading, setIssueLoading] = useState(false);
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [invoiceActionLoading, setInvoiceActionLoading] = useState('');

  const student = profile?.student || {};
  const classRecord = profile?.class || student.classSession || student.class || null;
  const summary = profile?.summary || {};
  const ledger = Array.isArray(profile?.ledger) ? profile.ledger : [];
  const invoices = useMemo(
    () => (Array.isArray(profile?.invoices) ? profile.invoices : []),
    [profile]
  );

  const uniformItemByName = useMemo(
    () => new Map(uniformItems.map((item) => [item.name, item])),
    [uniformItems]
  );

  const activeInvoiceUniformKeys = useMemo(
    () =>
      new Set(
        invoices
          .filter((invoice) => invoice.issueStatus === 'pending' && invoice.status !== 'cancelled')
          .flatMap((invoice) => invoice.lineItems || [])
          .map((item) => `${item.itemName}::${item.size}`)
      ),
    [invoices]
  );

  const selectedInvoiceTotal = useMemo(
    () =>
      normalizeIssueRows(issueRows).reduce((sum, row) => {
        if (!row.size) return sum;
        const selectedItem = uniformItemByName.get(row.itemName);
        return sum + getUniformSizePrice(selectedItem, row.size) * Number(row.quantity || 0);
      }, 0),
    [issueRows, uniformItemByName]
  );

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axios.get(`/admin/uniforms/student/${studentId}`, {
        headers: { token },
      });
      setProfile(response.data?.data || null);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Failed to load student uniform profile'));
    } finally {
      setLoading(false);
    }
  }, [axios, studentId, token]);

  const fetchUniformItems = useCallback(async () => {
    try {
      setItemsLoading(true);
      const response = await axios.get('/admin/uniforms/items', {
        headers: { token },
      });
      setUniformItems(response.data?.data || []);
    } catch (requestError) {
      notify.error(getApiErrorMessage(requestError, 'Failed to load uniform inventory'));
    } finally {
      setItemsLoading(false);
    }
  }, [axios, notify, token]);

  useEffect(() => {
    if (token && studentId) {
      fetchProfile();
      fetchUniformItems();
    }
  }, [fetchProfile, fetchUniformItems, studentId, token]);

  const openIssueModal = useCallback(() => {
    setIssueRows(initialIssueRows);
    setIssueNotes('');
    setIssueErrors({});
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
    setIssueErrors({});
    clearIssueSearchParam();
  }, [clearIssueSearchParam]);

  useEffect(() => {
    if (!profile || searchParams.get('issue') !== '1') {
      return;
    }

    openIssueModal();
    clearIssueSearchParam();
  }, [clearIssueSearchParam, openIssueModal, profile, searchParams]);

  const validateIssueRows = () => {
    const errors = {};
    const normalizedRows = normalizeIssueRows(issueRows);
    const validRows = normalizedRows.filter((row) => row.itemName || row.size || row.quantity);
    const seenCombinations = new Set();

    if (validRows.length === 0) {
      errors.form = 'Add at least one uniform item';
    }

    validRows.forEach((row, index) => {
      if (!row.itemName) errors[`rows.${index}.itemName`] = 'Select an item';
      if (!row.size) errors[`rows.${index}.size`] = 'Select a size';
      if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
        errors[`rows.${index}.quantity`] = 'Quantity must be at least 1';
      }

      const combinationKey = `${row.itemName}::${row.size}`;
      if (row.itemName && row.size) {
        if (seenCombinations.has(combinationKey)) {
          errors[`rows.${index}.itemName`] = 'This item and size is already added';
        }
        if (activeInvoiceUniformKeys.has(combinationKey)) {
          errors[`rows.${index}.itemName`] = 'This item and size already has a pending invoice';
        }
        seenCombinations.add(combinationKey);
      }

      const selectedItem = uniformItemByName.get(row.itemName);
      const availableStock = getAvailableStock(selectedItem, row.size);
      if (row.itemName && row.size && !selectedItem?.sizes?.some((sizeItem) => sizeItem.size === row.size)) {
        errors[`rows.${index}.size`] = 'Selected size is not available';
      }
      if (row.itemName && row.size && row.quantity > availableStock) {
        errors[`rows.${index}.quantity`] = `Only ${availableStock} available`;
      }
    });

    return { errors, payload: validRows };
  };

  const handleIssueSubmit = async (event) => {
    event.preventDefault();
    const { errors, payload } = validateIssueRows();
    setIssueErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const classId = classRecord?._id || classRecord;
    if (!classId) {
      setIssueErrors({ form: 'Student class could not be resolved' });
      return;
    }

    try {
      setIssueLoading(true);
      await axios.post(
        '/admin/uniforms/issue',
        {
          studentId,
          classId,
          uniforms: payload,
          notes: issueNotes,
        },
        { headers: { token } }
      );

      notify.success('Uniform items issued successfully. Payment is due.');
      closeIssueModal();
      await Promise.all([fetchProfile(), fetchUniformItems()]);
    } catch (requestError) {
      setIssueErrors({
        form: getApiErrorMessage(requestError, 'Failed to issue uniform items'),
      });
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
        `/admin/uniforms/invoices/${invoice._id}/payments`,
        {
          amount: Number(draft.amount),
          mode: draft.mode,
          transactionId: draft.transactionId,
          note: draft.note,
        },
        { headers: { token } }
      );
      notify.success('Uniform payment recorded');
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
          <div class="muted">Size ${escapeHtml(item.size || 'N/A')}</div>
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
          <title>${escapeHtml(invoice.invoiceNo || 'Uniform Invoice')}</title>
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
              <h1>Uniform Invoice</h1>
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

  const updateIssueRow = (index, patch) => {
    setIssueRows((currentRows) =>
      currentRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
    setIssueErrors({});
  };

  const addIssueRow = () => {
    setIssueRows((currentRows) => [...currentRows, { itemName: '', size: '', quantity: 1 }]);
    setIssueErrors({});
  };

  const removeIssueRow = (index) => {
    setIssueRows((currentRows) => currentRows.filter((_, rowIndex) => rowIndex !== index));
    setIssueErrors({});
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
          onClick={() => navigate('/admin/uniforms')}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Uniforms
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
          onClick={() => navigate('/admin/uniforms')}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Uniforms
        </button>
        <button
          type="button"
          onClick={openIssueModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Shirt className="h-4 w-4" />
          Issue Uniforms
        </button>
      </div>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-600">Student Uniform Profile</p>
            <h1 className="mt-2 text-3xl font-bold text-gray-950">{getStudentName(student)}</h1>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(summary.uniformStatus || profile?.status)}`}>
            {summary.uniformStatus || getStatusLabel(profile?.status)}
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

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-blue-500 bg-white p-5 shadow-sm">
          <PackageCheck className="mb-3 h-5 w-5 text-blue-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Total Issued Items</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{summary.totalIssuedItems || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-amber-500 bg-white p-5 shadow-sm">
          <PackageOpen className="mb-3 h-5 w-5 text-amber-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Pending Items</p>
          <p className="mt-2 text-3xl font-bold text-gray-950">{summary.pendingItems || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-green-500 bg-white p-5 shadow-sm">
          <Clock className="mb-3 h-5 w-5 text-green-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Last Issue Date</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatDate(summary.lastIssueDate)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-indigo-500 bg-white p-5 shadow-sm">
          <PackageCheck className="mb-3 h-5 w-5 text-indigo-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Issued Value</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatCurrency(summary.totalIssuedValue)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-purple-500 bg-white p-5 shadow-sm">
          <CheckCircle2 className="mb-3 h-5 w-5 text-purple-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Uniform Status</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{summary.uniformStatus || 'Pending'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-sky-500 bg-white p-5 shadow-sm">
          <PackageCheck className="mb-3 h-5 w-5 text-sky-600" />
          <p className="text-xs font-semibold uppercase text-gray-500">Due Balance</p>
          <p className="mt-2 text-2xl font-bold text-gray-950">{formatCurrency(summary.invoiceBalance)}</p>
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-950">Uniform Payments</h2>
            <p className="text-sm text-gray-500">Issue uniforms first, then collect dues here</p>
          </div>
          <button
            type="button"
            onClick={openIssueModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Plus className="h-4 w-4" />
            Issue Uniforms
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
                        <div key={`${invoice._id}-${item.itemName}-${item.size}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                          <div>
                            <p className="font-semibold text-gray-900">{item.itemName}</p>
                            <p className="text-xs text-gray-500">Size {item.size} x {item.quantity}</p>
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
              No uniform payment dues yet.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-950">Issued Uniform Ledger</h2>
            <p className="text-sm text-gray-500">Permanent student-wise distribution history</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px]">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                <th className="px-5 py-3">Item Name</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Quantity</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Invoice</th>
                <th className="px-5 py-3">Issue Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Issued By</th>
                <th className="px-5 py-3">Notes</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length > 0 ? (
                ledger.map((item) => (
                  <tr key={item._id} className="border-t border-gray-100 text-sm">
                    <td className="px-5 py-4 font-semibold text-gray-950">{item.itemName}</td>
                    <td className="px-5 py-4 text-gray-700">{item.size}</td>
                    <td className="px-5 py-4 text-gray-700">{item.quantity}</td>
                    <td className="px-5 py-4 text-gray-700">{formatCurrency(item.pricePerItem)}</td>
                    <td className="px-5 py-4 text-gray-700">{formatCurrency(item.lineTotal)}</td>
                    <td className="px-5 py-4 text-gray-700">{item.invoiceNo || 'N/A'}</td>
                    <td className="px-5 py-4 text-gray-700">{formatDate(item.issueDate || item.issuedAt)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getConditionClass(item.condition || item.status)}`}>
                        {getLedgerStatusLabel(item.status || item.condition)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{item.issuedBy?.name || 'System Admin'}</td>
                    <td className="px-5 py-4 text-gray-700">{item.notes || 'N/A'}</td>
                    <td className="px-5 py-4 text-gray-500">Tracked</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="11" className="px-5 py-12 text-center text-sm font-medium text-gray-500">
                    No uniforms issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 p-5">
              <div>
                <h2 className="text-2xl font-bold text-gray-950">Issue Uniforms</h2>
                <p className="mt-1 text-sm text-gray-500">{getStudentName(student)} - {getAdmissionNo(student)}</p>
              </div>
              <button
                type="button"
                onClick={closeIssueModal}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close issue uniforms"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} className="overflow-y-auto p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase text-blue-700">Student</p>
                    <p className="mt-1 text-lg font-bold text-gray-950">{getStudentName(student)}</p>
                    <p className="text-sm text-gray-600">{getClassLabel(classRecord)}</p>
                  </div>

                  {issueErrors.form && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{issueErrors.form}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    {issueRows.map((row, index) => {
                      const selectedItem = uniformItemByName.get(row.itemName);
                      const availableStock = getAvailableStock(selectedItem, row.size);
                      const pricePerItem = getUniformSizePrice(selectedItem, row.size);
                      const estimatedLineTotal = pricePerItem * Number(row.quantity || 0);

                      return (
                        <div key={index} className="rounded-lg border border-gray-200 p-4">
                          <div className="grid gap-3 md:grid-cols-[1fr_180px_140px_44px]">
                            <div>
                              <label className="mb-1 block text-sm font-semibold text-gray-700">Uniform Item</label>
                              <select
                                value={row.itemName}
                                onChange={(event) => updateIssueRow(index, { itemName: event.target.value, size: '' })}
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                                  issueErrors[`rows.${index}.itemName`] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                }`}
                              >
                                <option value="">Select item</option>
                                {uniformItems.map((item) => (
                                  <option key={item._id} value={item.name}>
                                    {item.name}
                                  </option>
                                ))}
                              </select>
                              {issueErrors[`rows.${index}.itemName`] && (
                                <p className="mt-1 text-xs text-red-600">{issueErrors[`rows.${index}.itemName`]}</p>
                              )}
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-semibold text-gray-700">Size</label>
                              <select
                                value={row.size}
                                onChange={(event) => updateIssueRow(index, { size: event.target.value })}
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                                  issueErrors[`rows.${index}.size`] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                }`}
                              >
                                <option value="">Select size</option>
                                {selectedItem?.sizes?.map((sizeItem) => (
                                  <option key={sizeItem.size} value={sizeItem.size}>
                                    {sizeItem.size} ({sizeItem.stock} available) - {formatCurrency(getUniformSizePrice(selectedItem, sizeItem))}
                                  </option>
                                ))}
                              </select>
                              {issueErrors[`rows.${index}.size`] && (
                                <p className="mt-1 text-xs text-red-600">{issueErrors[`rows.${index}.size`]}</p>
                              )}
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-semibold text-gray-700">Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={row.quantity}
                                onChange={(event) =>
                                  updateIssueRow(index, { quantity: Number(event.target.value || 1) })
                                }
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                                  issueErrors[`rows.${index}.quantity`] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                }`}
                              />
                              {issueErrors[`rows.${index}.quantity`] && (
                                <p className="mt-1 text-xs text-red-600">{issueErrors[`rows.${index}.quantity`]}</p>
                              )}
                            </div>

                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={() => removeIssueRow(index)}
                                disabled={issueRows.length === 1}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Remove uniform row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {row.itemName && row.size && (
                            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                              {row.itemName} {row.size}: Available {availableStock} | Price {formatCurrency(pricePerItem)} | Total {formatCurrency(estimatedLineTotal)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addIssueRow}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Item
                  </button>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-bold uppercase text-gray-500">Inventory Status</p>
                    <p className="mt-2 text-sm text-gray-600">
                      Stock is checked live before issuing. Duplicate item and size rows are blocked.
                    </p>
                    {itemsLoading && (
                      <p className="mt-3 inline-flex items-center gap-2 text-sm text-gray-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading stock...
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-gray-700">Notes</label>
                    <textarea
                      value={issueNotes}
                      onChange={(event) => setIssueNotes(event.target.value)}
                      rows={6}
                      placeholder="Optional issue note"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-xs font-bold uppercase text-green-700">Amount Due</p>
                    <p className="mt-2 text-2xl font-bold text-green-700">
                      {formatCurrency(selectedInvoiceTotal)}
                    </p>
                    <p className="text-sm text-green-700">selected items</p>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase text-blue-700">Ready to Issue</p>
                    <p className="mt-2 text-2xl font-bold text-blue-700">
                      {normalizeIssueRows(issueRows).filter((row) => row.itemName && row.size).length}
                    </p>
                    <p className="text-sm text-blue-700">selected item rows</p>
                  </div>
                </aside>
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
                disabled={issueLoading || itemsLoading}
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

export default StudentUniformProfile;
