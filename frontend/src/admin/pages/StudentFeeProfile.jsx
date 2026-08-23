import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../../context/authContext/AuthContext";

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

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
      return "border-slate-200 bg-white";
  }
};

const getLineLabelClass = (line = {}) => {
  if (line.type === "previous_year_balance") return "font-semibold text-amber-700";
  if (Number(line.amount) < 0) return "font-semibold text-green-700";
  return "text-slate-600";
};

const getLineAmountClass = (line = {}) => {
  if (Number(line.amount) < 0) return "font-bold text-green-700";
  if (line.type === "previous_year_balance") return "font-bold text-amber-700";
  return "font-semibold text-slate-950";
};

const getBalanceTextClass = (value = 0) => (Number(value) > 0 ? "text-red-600" : "text-green-700");

const StudentFeeProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { axios, token } = useAuth();

  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedMonthKey, setExpandedMonthKey] = useState("");

  const fetchStatement = useCallback(async (signal) => {
    try {
      setLoading(true);
      const response = await axios.get(`/admin/student/${studentId}/statement`, {
        headers: { token },
        signal,
      });
      if (signal?.aborted) return;
      if (response.data.success) {
        setStatement(response.data.data);
        setError("");
      } else {
        setError(response.data.message || "Unable to load student statement");
      }
    } catch (fetchError) {
      if (fetchError?.name === "CanceledError" || fetchError?.code === "ERR_CANCELED" || signal?.aborted) {
        return;
      }
      setError(fetchError.response?.data?.message || fetchError.message || "Unable to load student statement");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [axios, studentId, token]);

  useEffect(() => {
    const controller = new AbortController();
    fetchStatement(controller.signal);
    return () => controller.abort();
  }, [fetchStatement]);

  const student = statement?.student || {};
  const totals = statement?.totals || {};

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-3 text-sm font-semibold text-gray-600">Loading student fee profile...</p>
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
      <div className="mx-auto max-w-400 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => navigate("/admin/fees")}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Fees
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

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Student Account</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">{student.name || "Student"}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                  Class: {student.classLabel || "N/A"}
                </span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                  Admission No: {student.admissionNo || "N/A"}
                </span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                  Parent: {student.parentName || "N/A"}
                </span>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1">
                  Phone: {student.parentPhone || "N/A"}
                </span>
                <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">
                  Session: {statement?.academicYear || "N/A"}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-100 bg-blue-50 px-3 py-2 text-blue-700">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide">Total Due</p>
                  <p className="truncate text-[11px] font-medium opacity-80">Assigned for this student</p>
                </div>
                <p className="shrink-0 text-lg font-bold text-slate-950">{formatCurrency(totals.totalDue)}</p>
              </div>
              <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-100 bg-green-50 px-3 py-2 text-green-700">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide">Paid</p>
                  <p className="truncate text-[11px] font-medium opacity-80">Received so far</p>
                </div>
                <p className="shrink-0 text-lg font-bold text-slate-950">{formatCurrency(totals.paidAmount)}</p>
              </div>
              <div className="flex min-h-9 items-center justify-between gap-3 border-b border-slate-100 bg-amber-50 px-3 py-2 text-amber-700">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide">Pending</p>
                  <p className="truncate text-[11px] font-medium opacity-80">Balance to collect</p>
                </div>
                <p className="shrink-0 text-lg font-bold text-slate-950">{formatCurrency(totals.pendingAmount)}</p>
              </div>
              <div className="flex min-h-9 items-center justify-between gap-3 bg-red-50 px-3 py-2 text-red-700">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide">Overdue</p>
                  <p className="truncate text-[11px] font-medium opacity-80">Past due balance</p>
                </div>
                <p className="shrink-0 text-lg font-bold text-slate-950">{formatCurrency(totals.overdueAmount)}</p>
              </div>
            </div>
          </div>
        </section>

        <main className="min-w-0">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Monthly Statement</h2>
                <p className="text-sm text-slate-500">April to March student ledger</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">overdue</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">pending</span>
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-700">paid</span>
              </div>
            </div>

            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[18%]" />
                  <col className="w-[21%]" />
                  <col className="w-[21%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-5 py-3">Month</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Total Due</th>
                    <th className="px-5 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(statement?.months || []).map((month) => {
                    const isExpanded = expandedMonthKey === month.monthKey;

                    return (
                      <React.Fragment key={month.monthKey}>
                        <tr className="bg-white transition hover:bg-slate-50">
                          <td className="px-5 py-3 align-middle">
                            <button
                              type="button"
                              onClick={() => setExpandedMonthKey(isExpanded ? "" : month.monthKey)}
                              className="flex min-w-0 items-center gap-2 text-left"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                              )}
                              <span className="truncate font-bold text-slate-950">{month.monthLabel}</span>
                            </button>
                          </td>
                          <td className="px-5 py-3 align-middle">
                            <span className={`inline-flex min-w-18 justify-center rounded-full px-2.5 py-1 text-xs font-bold capitalize ${getStatusClass(month.status)}`}>
                              {month.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right align-middle font-bold tabular-nums text-slate-950">
                            {formatCurrency(month.totalDue)}
                          </td>
                          <td className={`px-5 py-3 text-right align-middle font-bold tabular-nums ${getBalanceTextClass(month.endingBalance)}`}>
                            {formatCurrency(month.endingBalance)}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={4} className="px-5 pb-4 pt-0">
                              <div className={`rounded-lg border p-4 ${getMonthSurfaceClass(month.status)}`}>
                                <div className="mb-3 flex flex-col gap-1 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                                  <span>Due: {formatDate(month.dueDate)}</span>
                                  <span className={getBalanceTextClass(month.endingBalance)}>
                                    Balance: {formatCurrency(month.endingBalance)}
                                  </span>
                                </div>
                                <div className="divide-y divide-slate-200/70">
                                  {(month.lines || []).length ? (
                                    (month.lines || []).map((line, index) => (
                                      <div
                                        key={`${line.type}-${line.label}-${index}`}
                                        className="grid grid-cols-[minmax(0,1fr)_150px] gap-4 py-2 text-sm"
                                      >
                                        <span className={`min-w-0 leading-5 ${getLineLabelClass(line)}`}>{line.label}</span>
                                        <span className={`text-right tabular-nums ${getLineAmountClass(line)}`}>
                                          {formatCurrency(line.amount)}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="py-2 text-sm font-medium text-slate-500">No line items for this month.</p>
                                  )}
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

      </div>
    </div>
  );
};

export default StudentFeeProfile;
