import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Download,
  History,
  IndianRupee,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCw,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/authContext/AuthContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatDateInput = (date = new Date()) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const sanitizeFileName = (value = "") =>
  String(value || "receipt")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "receipt";

const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const getStatusClass = (status = "") => {
  switch (String(status).toLowerCase()) {
    case "paid":
      return "bg-green-100 text-green-700";
    case "partial":
      return "bg-blue-100 text-blue-700";
    case "overdue":
      return "bg-red-100 text-red-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
};

const getMonthSurfaceClass = (status = "") => {
  switch (String(status).toLowerCase()) {
    case "paid":
      return "border-green-200 bg-green-50/70";
    case "partial":
      return "border-blue-200 bg-blue-50/70";
    case "overdue":
      return "border-red-200 bg-red-50/70";
    default:
      return "border-gray-200 bg-white";
  }
};

const getLineLabelClass = (line = {}) => {
  if (line.type === "carried_balance") return "font-semibold text-amber-700";
  if (Number(line.amount) < 0) return "font-semibold text-green-700";
  return "text-gray-600";
};

const getLineAmountClass = (line = {}) => {
  if (Number(line.amount) < 0) return "font-bold text-green-700";
  if (line.type === "carried_balance") return "font-bold text-amber-700";
  return "font-semibold text-gray-950";
};

const statTileToneClass = {
  blue: "border-blue-100 bg-blue-50 text-blue-700",
  green: "border-green-100 bg-green-50 text-green-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

const StatStripRow = ({ label, value, helper = "", tone = "slate" }) => (
  <div className={`flex min-h-9 items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 ${statTileToneClass[tone] || statTileToneClass.slate}`}>
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide">{label}</p>
      {helper && <p className="truncate text-[11px] font-medium opacity-80">{helper}</p>}
    </div>
    <p className="shrink-0 text-lg font-bold text-gray-950">{value}</p>
  </div>
);

const buildReceiptHtml = ({ statement, payment }) => {
  const family = statement?.family || {};
  const siblings = payment?.siblingsUpdated || payment?.siblingSummary || [];
  const monthRows = (payment?.monthsCovered || payment?.monthSummary || [])
    .map(
      (month) => `
        <tr>
          <td>${escapeHtml(month.monthLabel || month.monthKey || "")}</td>
          <td class="amount">${escapeHtml(formatCurrency(month.dueBeforePayment || 0))}</td>
          <td class="amount">${escapeHtml(formatCurrency(month.paidByCurrentPayment || 0))}</td>
          <td class="amount">${escapeHtml(formatCurrency(month.endingBalance || 0))}</td>
        </tr>
      `
    )
    .join("");
  const siblingRows = siblings
    .map(
      (sibling, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(sibling.studentName || sibling.name || "Student")}</td>
          <td>${escapeHtml(sibling.classLabel || "N/A")}</td>
          <td>${escapeHtml((sibling.monthsCovered || []).join(", ") || "-")}</td>
          <td class="amount">${escapeHtml(formatCurrency(sibling.allocatedAmount || 0))}</td>
        </tr>
      `
    )
    .join("");
  const tuitionConcessionRows = [
    ...new Map(
      (payment?.allocations || [])
        .filter((allocation) => allocation.feeType === "tuition" && Number(allocation.concessionAmount || 0) > 0)
        .map((allocation) => [
          `${allocation.student || allocation.studentName}-${allocation.monthKey}`,
          allocation,
        ])
    ).values(),
  ]
    .map(
      (allocation) => `
        <tr>
          <td>${escapeHtml(allocation.studentName || allocation.monthLabel || "Student")}</td>
          <td>${escapeHtml(allocation.monthLabel || allocation.monthKey || "")}</td>
          <td class="amount">${escapeHtml(formatCurrency(allocation.originalAmount || 0))}</td>
          <td class="amount">-${escapeHtml(formatCurrency(allocation.concessionAmount || 0))}</td>
          <td class="amount">${escapeHtml(formatCurrency(allocation.netFeeAmount || 0))}</td>
        </tr>
      `
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Family Fee Receipt ${escapeHtml(payment?.transactionId || "")}</title>
    <style>
      body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 18mm; }
      .receipt { border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
      .header { display: flex; justify-content: space-between; gap: 24px; padding: 22px 24px; border-bottom: 2px solid #2563eb; }
      h1, h2, p { margin: 0; }
      .muted { color: #6b7280; font-size: 12px; margin-top: 4px; }
      .title { background: #eff6ff; padding: 14px 24px; color: #1d4ed8; font-weight: 700; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 28px; padding: 18px 24px; border-bottom: 1px solid #e5e7eb; }
      .field span { display: block; color: #6b7280; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .field strong { display: block; margin-top: 4px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 11px 12px; text-align: left; font-size: 13px; }
      th { background: #f9fafb; color: #4b5563; font-size: 11px; text-transform: uppercase; }
      .amount { text-align: right; font-weight: 700; }
      .summary { display: grid; grid-template-columns: 1fr 260px; gap: 16px; padding: 18px 24px; }
      .total { border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 8px; padding: 12px; text-align: right; }
      .total span { color: #166534; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .total strong { display: block; color: #14532d; font-size: 24px; margin-top: 4px; }
      .footer { padding: 24px; color: #4b5563; font-size: 12px; }
      @media print { body { background: white; } .page { width: auto; min-height: auto; padding: 0; } }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="receipt">
        <div class="header">
          <div>
            <h1>School Fee Receipt</h1>
            <p class="muted">Family fee collection receipt</p>
            <p class="muted">Academic Session: ${escapeHtml(statement?.academicYear || "N/A")}</p>
          </div>
          <div style="text-align:right">
            <strong>Receipt No.</strong>
            <p class="muted">${escapeHtml(payment?.transactionId || "N/A")}</p>
            <strong style="display:block;margin-top:10px">Payment Date</strong>
            <p class="muted">${escapeHtml(formatDate(payment?.paymentDate || new Date()))}</p>
          </div>
        </div>
        <div class="title">Family Payment Receipt</div>
        <div class="grid">
          <div class="field"><span>Family</span><strong>${escapeHtml(family.displayName || "Family")}</strong></div>
          <div class="field"><span>Phone</span><strong>${escapeHtml(family.primaryPhone || "N/A")}</strong></div>
          <div class="field"><span>Father</span><strong>${escapeHtml(family.fatherName || "N/A")}</strong></div>
          <div class="field"><span>Mother</span><strong>${escapeHtml(family.motherName || "N/A")}</strong></div>
          <div class="field"><span>Payment Mode</span><strong>${escapeHtml(String(payment?.mode || "cash").replace("_", " "))}</strong></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Months Covered</th><th class="amount">Allocated</th></tr></thead>
          <tbody>${siblingRows || `<tr><td colspan="5">No allocations</td></tr>`}</tbody>
        </table>
        <table>
          <thead><tr><th>Month</th><th class="amount">Due</th><th class="amount">Paid</th><th class="amount">Balance</th></tr></thead>
          <tbody>${monthRows || `<tr><td colspan="4">No month summary</td></tr>`}</tbody>
        </table>
        ${tuitionConcessionRows ? `
        <div class="title">Tuition Concession Breakdown</div>
        <table>
          <thead><tr><th>Student</th><th>Month</th><th class="amount">Tuition Fee</th><th class="amount">Concession</th><th class="amount">Net Tuition</th></tr></thead>
          <tbody>${tuitionConcessionRows}</tbody>
        </table>` : ""}
        <div class="summary">
          <div>
            <strong>Note</strong>
            <p class="muted">${escapeHtml(payment?.note || "This receipt is generated from the family fee collection record.")}</p>
          </div>
          <div class="total">
            <span>Total Collected</span>
            <strong>${escapeHtml(formatCurrency(payment?.amountCollected || 0))}</strong>
          </div>
        </div>
        <div class="footer">Please keep this receipt for future reference.</div>
      </section>
    </main>
  </body>
</html>`;
};

const FamilyFeeProfile = () => {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const { axios, token } = useAuth();
  const { notify } = useNotifier();
  const amountInputRef = useRef(null);
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(formatDateInput());
  const [mode, setMode] = useState("cash");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [expandedMonthKey, setExpandedMonthKey] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [latestPayment, setLatestPayment] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");

  const fetchStatement = useCallback(async (signal) => {
    try {
      setLoading(true);
      const response = await axios.get(`/admin/families/${familyId}/statement`, {
        headers: { token },
        signal,
      });
      if (signal?.aborted) return;

      if (response.data.success) {
        setStatement(response.data.data);
        setError("");
      } else {
        setError(response.data.message || "Unable to load family statement");
      }
    } catch (fetchError) {
      if (fetchError?.name === "CanceledError" || fetchError?.code === "ERR_CANCELED" || signal?.aborted) {
        return;
      }
      setError(fetchError.response?.data?.message || fetchError.message || "Unable to load family statement");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [axios, familyId, token]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatement(controller.signal);
    return () => controller.abort();
  }, [fetchStatement]);

  const fetchPayments = useCallback(async (signal) => {
    try {
      setPaymentsLoading(true);
      const response = await axios.get(`/admin/families/${familyId}/payments`, {
        headers: { token },
        signal,
      });
      if (signal?.aborted) return;
      if (response.data.success) {
        setPayments(Array.isArray(response.data.data) ? response.data.data : []);
        setPaymentsError("");
      } else {
        setPaymentsError(response.data.message || "Unable to load payment history");
      }
    } catch (historyError) {
      if (historyError?.name === "CanceledError" || historyError?.code === "ERR_CANCELED" || signal?.aborted) {
        return;
      }
      setPaymentsError(historyError.response?.data?.message || historyError.message || "Unable to load payment history");
    } finally {
      if (!signal?.aborted) setPaymentsLoading(false);
    }
  }, [axios, familyId, token]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPayments(controller.signal);
    return () => controller.abort();
  }, [fetchPayments]);

  useEffect(() => {
    if (!loading && !error) {
      amountInputRef.current?.focus();
    }
  }, [error, loading]);

  useEffect(() => {
    const numericAmount = Number(amount);
    if (!statement || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setPreview(null);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setPreviewLoading(true);
        const response = await axios.post(
          "/admin/family/payment/preview",
          {
            familyId,
            academicYear: statement.academicYear,
            amount: numericAmount,
            date: paymentDate,
          },
          { headers: { token }, signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setPreview(response.data.data || null);
      } catch (previewError) {
        if (previewError?.name === "CanceledError" || previewError?.code === "ERR_CANCELED" || controller.signal.aborted) {
          return;
        }
        setPreview({
          error: previewError.response?.data?.message || previewError.message || "Unable to preview payment",
        });
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [amount, axios, familyId, paymentDate, statement, token]);

  const family = statement?.family || {};
  const totals = statement?.totals || {};
  const coveredMonths = useMemo(
    () => preview?.monthSummary?.filter((month) => Number(month.paidByCurrentPayment || 0) > 0) || [],
    [preview]
  );
  const previewAmount = Number(preview?.allocatedAmount ?? 0);
  const previewAdvance = Number(preview?.advanceCreated || 0);
  const previewLine = preview?.error
    ? preview.error
    : preview
      ? `Preview: ${formatCurrency(previewAmount)} applied across ${coveredMonths.length} month${coveredMonths.length === 1 ? "" : "s"}${previewAdvance > 0 ? `, ${formatCurrency(previewAdvance)} advance` : ""}`
      : "Preview: enter an amount";
  const previewSiblings = preview?.siblingsUpdated || preview?.siblingSummary || [];

  const handleSubmit = async (event) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      notify.error("Enter a valid payment amount");
      return;
    }

    try {
      setSubmitting(true);
      const idempotencyKey = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const response = await axios.post(
        "/admin/family/payment",
        {
          familyId,
          academicYear: statement?.academicYear,
          amount: numericAmount,
          date: paymentDate,
          mode,
          note,
          idempotencyKey,
        },
        {
          headers: {
            token,
            "Idempotency-Key": idempotencyKey,
          },
        }
      );

      const payment = response.data.data?.familyPayment || response.data.data;
      setLatestPayment(payment);
      notify.success(`Family payment recorded: ${formatCurrency(numericAmount)}`);
      setAmount("");
      setNote("");
      setShowNote(false);
      setPaymentDate(formatDateInput());
      setPreview(null);
      await Promise.all([fetchStatement(), fetchPayments()]);
    } catch (submitError) {
      notify.error(submitError.response?.data?.message || submitError.message || "Unable to collect family payment");
    } finally {
      setSubmitting(false);
    }
  };

  const printReceipt = (paymentRecord) => {
    const targetPayment = paymentRecord || latestPayment;
    if (!targetPayment || !statement) return;
    const printWindow = window.open("", "_blank", "width=920,height=720");
    if (!printWindow) {
      notify.error("Unable to open print window. Please allow popups.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildReceiptHtml({ statement, payment: targetPayment }));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  const downloadReceipt = (paymentRecord) => {
    const targetPayment = paymentRecord || latestPayment;
    if (!targetPayment || !statement) return;
    const receiptHtml = buildReceiptHtml({ statement, payment: targetPayment });
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFileName(family.displayName)}-${sanitizeFileName(targetPayment.transactionId)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-sm font-semibold text-gray-600">Loading family fee profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <button
          type="button"
          onClick={() => navigate("/admin/fees")}
          className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fees
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => navigate("/admin/fees")}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Families
          </button>
          <button
            type="button"
            onClick={() => fetchStatement()}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[60fr_40fr] lg:items-start">
          <main className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Family Account</p>
                  <h1 className="mt-1 text-2xl font-bold text-slate-950">{family.displayName || "Family"}</h1>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      Father: {family.fatherName || "N/A"}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      Mother: {family.motherName || "N/A"}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                      Phone: {family.primaryPhone || "N/A"}
                    </span>
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">
                      Session: {statement?.academicYear || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <StatStripRow
                    label="Family Pending"
                    value={formatCurrency(totals.pendingAmount)}
                    helper="Balance to collect"
                    tone="amber"
                  />
                  <StatStripRow
                    label="Collected"
                    value={formatCurrency(totals.paidAmount)}
                    helper="Received so far"
                    tone="green"
                  />
                  <StatStripRow
                    label="Total Due"
                    value={formatCurrency(totals.totalDue)}
                    helper={`${(statement?.siblings || []).length} student${(statement?.siblings || []).length === 1 ? "" : "s"}`}
                    tone="blue"
                  />
                  <StatStripRow
                    label="Advance"
                    value={formatCurrency(totals.advanceBalance)}
                    helper="Available credit"
                    tone="slate"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-950">Children</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                  {(statement?.siblings || []).length} listed
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {(statement?.siblings || []).map((sibling) => (
                  <div key={sibling._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-700">
                        {String(sibling.name || "S").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-950">{sibling.name}</p>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                          {sibling.classLabel} | Admission No: {sibling.admissionNo || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-slate-500">
                        Due <strong className="ml-1 text-slate-950">{formatCurrency(sibling.totalDue)}</strong>
                      </span>
                      <span className="text-slate-500">
                        Paid <strong className="ml-1 text-green-700">{formatCurrency(sibling.paidAmount)}</strong>
                      </span>
                      {Number(sibling.advanceApplied || 0) > 0 && (
                        <span className="text-slate-500">
                          Advance <strong className="ml-1 text-green-700">{formatCurrency(sibling.advanceApplied)}</strong>
                        </span>
                      )}
                      <span className="text-slate-500">
                        Pending <strong className="ml-1 text-red-600">{formatCurrency(sibling.pendingAmount)}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Monthly Statement</h2>
                  <p className="text-xs text-slate-500">April to March family ledger</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">overdue</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">pending</span>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-700">paid</span>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-1.5">Month</th>
                      <th className="px-4 py-1.5">Status</th>
                      <th className="px-4 py-1.5 text-right">Total Due</th>
                      <th className="px-4 py-1.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(statement?.months || []).map((month) => {
                      const isExpanded = expandedMonthKey === month.monthKey;

                      return (
                        <React.Fragment key={month.monthKey}>
                          <tr
                            className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                            onClick={() => setExpandedMonthKey(isExpanded ? "" : month.monthKey)}
                          >
                            <td className="px-4 py-1.5">
                              <div className="flex items-center gap-2">
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 text-slate-400 transition ${isExpanded ? "rotate-180" : ""}`}
                                />
                                <span className="font-bold text-slate-950">{month.monthLabel}</span>
                              </div>
                            </td>
                            <td className="px-4 py-1.5">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${getStatusClass(month.status)}`}>
                                {month.status}
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-right font-bold text-slate-950">
                              {formatCurrency(month.totalDue)}
                            </td>
                            <td className="px-4 py-1.5 text-right font-bold text-red-600">
                              {formatCurrency(month.endingBalance)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-t border-slate-100">
                              <td colSpan={4} className="px-4 py-3">
                                <div className={`rounded-lg border p-3 ${getMonthSurfaceClass(month.status)}`}>
                                  <p className="mb-2 text-xs font-medium text-slate-500">Due: {formatDate(month.dueDate)}</p>
                                  <div className="space-y-1.5">
                                    {(month.lines || []).map((line, index) => (
                                      <div key={`${line.type}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                                        <span className={`truncate ${getLineLabelClass(line)}`}>{line.label}</span>
                                        <span className={getLineAmountClass(line)}>{formatCurrency(line.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>

          <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:self-start">
            <form
              onSubmit={handleSubmit}
              className="flex max-h-[calc(100vh-100px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-bold text-slate-950">Collect Family Payment</h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Payment allocation</p>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="amount">Amount Received</label>
                  <div className="relative">
                    <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={amountInputRef}
                      id="amount"
                      type="number"
                      min="1"
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="Enter amount"
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xl font-bold outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="date">Payment Date</label>
                  <div className="relative w-full sm:w-[170px]">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="date"
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="mode">Payment Mode</label>
                  <div className="relative">
                    <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      id="mode"
                      value={mode}
                      onChange={(event) => setMode(event.target.value)}
                      className="h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowNote((current) => !current)}
                    className="text-xs font-bold text-blue-700 transition hover:text-blue-700"
                  >
                    {showNote ? "Hide note" : "Add note"}
                  </button>
                  {showNote && (
                    <textarea
                      id="note"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={2}
                      placeholder="Optional receipt note"
                      className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  )}
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`truncate text-sm font-bold ${preview?.error ? "text-red-600" : "text-blue-950"}`}>
                      {previewLine}
                    </p>
                    {previewLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-700" />}
                  </div>
                  {previewSiblings.length > 0 && !preview?.error && (
                    <div className="mt-2 divide-y divide-blue-100 text-xs font-semibold text-blue-950">
                      {previewSiblings.map((sibling) => (
                        <div
                          key={String(sibling.student || sibling.studentName)}
                          className="flex items-center justify-between gap-3 py-1"
                        >
                          <span className="truncate">{sibling.studentName || "Student"}</span>
                          <span className="shrink-0">{formatCurrency(sibling.allocatedAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="sticky bottom-0 border-t border-slate-100 bg-white p-4">
                <button
                  type="submit"
                  disabled={submitting || !amount || Number(amount) <= 0}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Collect Payment for Family
                </button>
              </div>
            </form>
          </aside>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4">
            <ReceiptText className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-950">Latest Receipt</h2>
          </div>
          <div className="p-5">
            {latestPayment ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Transaction ID</p>
                  <p className="mt-1 break-all font-mono text-xs font-bold text-slate-950">{latestPayment.transactionId}</p>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Total Collected</p>
                  <p className="mt-1 text-2xl font-bold text-green-700">{formatCurrency(latestPayment.amountCollected)}</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button
                    type="button"
                    onClick={() => downloadReceipt(latestPayment)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-bold text-white transition hover:bg-green-700"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => printReceipt(latestPayment)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No receipt generated in this session.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-950">Payment History</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                {payments.length} record{payments.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => fetchPayments()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${paymentsLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>
          {paymentsError ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {paymentsError}
            </div>
          ) : paymentsLoading && payments.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading payment history...
            </div>
          ) : payments.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No payments recorded for this family yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Receipt No</th>
                    <th className="px-4 py-2.5">Mode</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-right">Advance</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((paymentRecord) => {
                    const isVoided = String(paymentRecord.status || "").toLowerCase() === "voided";
                    return (
                      <tr key={paymentRecord._id || paymentRecord.transactionId} className="transition hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                          {formatDate(paymentRecord.paymentDate)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          {paymentRecord.transactionId}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold uppercase text-slate-600">
                          {String(paymentRecord.mode || "").replace("_", " ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-green-700">
                          {formatCurrency(paymentRecord.amountCollected)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                          {Number(paymentRecord.advanceCreated || 0) > 0
                            ? `+${formatCurrency(paymentRecord.advanceCreated)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              isVoided ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                            }`}
                          >
                            {isVoided ? "Voided" : "Posted"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => downloadReceipt(paymentRecord)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-green-600 px-2.5 text-xs font-bold text-white transition hover:bg-green-700"
                              title="Download receipt"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => printReceipt(paymentRecord)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
                              title="Print receipt"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FamilyFeeProfile;
