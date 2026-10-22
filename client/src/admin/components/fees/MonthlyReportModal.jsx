import React, { useEffect, useMemo, useState } from "react";
import { Calendar, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";

// Fixed academic-year months (April → March). Mirrors backend ACADEMIC_MONTHS.
const ACADEMIC_MONTHS = [
  { key: "APRIL", label: "April" },
  { key: "MAY", label: "May" },
  { key: "JUNE", label: "June" },
  { key: "JULY", label: "July" },
  { key: "AUGUST", label: "August" },
  { key: "SEPTEMBER", label: "September" },
  { key: "OCTOBER", label: "October" },
  { key: "NOVEMBER", label: "November" },
  { key: "DECEMBER", label: "December" },
  { key: "JANUARY", label: "January" },
  { key: "FEBRUARY", label: "February" },
  { key: "MARCH", label: "March" },
];

const buildInitialSelection = () => new Set(ACADEMIC_MONTHS.map((month) => month.key));

const MonthlyReportModal = ({
  isOpen,
  classLabel = "",
  academicYear = "",
  defaultFormat = "pdf",
  loading = false,
  onClose,
  onGenerate,
}) => {
  const [selectedKeys, setSelectedKeys] = useState(buildInitialSelection);
  const [format, setFormat] = useState(defaultFormat);

  useEffect(() => {
    if (isOpen) {
      setSelectedKeys(buildInitialSelection());
      setFormat(defaultFormat);
    }
  }, [isOpen, defaultFormat]);

  const allSelected = useMemo(() => selectedKeys.size === ACADEMIC_MONTHS.length, [selectedKeys]);

  if (!isOpen) return null;

  const toggleMonth = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAll = () => setSelectedKeys(buildInitialSelection());
  const handleClearAll = () => setSelectedKeys(new Set());

  const handleQuickRange = (startIndex, endIndex) => {
    const next = new Set();
    for (let i = startIndex; i <= endIndex; i += 1) {
      next.add(ACADEMIC_MONTHS[i].key);
    }
    setSelectedKeys(next);
  };

  const handleSubmit = () => {
    if (loading || selectedKeys.size === 0) return;
    const orderedKeys = ACADEMIC_MONTHS.filter((month) => selectedKeys.has(month.key)).map(
      (month) => month.key
    );
    onGenerate?.({ monthKeys: orderedKeys, format });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onClose?.();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-600 p-2 text-white">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Monthly Fees Report</h2>
              <p className="mt-0.5 text-sm text-gray-600">
                {classLabel ? `${classLabel} · ` : ""}
                {academicYear ? `Academic Year ${academicYear}` : "Select the months to include in the report"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Quick select
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              All 12
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(0, 2)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Q1 (Apr–Jun)
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(3, 5)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Q2 (Jul–Sep)
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(6, 8)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Q3 (Oct–Dec)
            </button>
            <button
              type="button"
              onClick={() => handleQuickRange(9, 11)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Q4 (Jan–Mar)
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ACADEMIC_MONTHS.map((month) => {
              const isSelected = selectedKeys.has(month.key);
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => toggleMonth(month.key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  {month.label}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-gray-500">
            {selectedKeys.size === 0
              ? "Select at least one month to enable report generation."
              : `${selectedKeys.size} month${selectedKeys.size === 1 ? "" : "s"} selected${
                  allSelected ? " (full year)" : ""
                }.`}
          </p>

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Output format
            </p>
            <div className="flex gap-2">
              <label
                className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  format === "pdf"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-red-200"
                }`}
              >
                <input
                  type="radio"
                  name="report-format"
                  value="pdf"
                  checked={format === "pdf"}
                  onChange={() => setFormat("pdf")}
                  className="sr-only"
                />
                <FileText className="h-4 w-4" />
                PDF
              </label>
              <label
                className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  format === "excel"
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-green-200"
                }`}
              >
                <input
                  type="radio"
                  name="report-format"
                  value="excel"
                  checked={format === "excel"}
                  onChange={() => setFormat("excel")}
                  className="sr-only"
                />
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || selectedKeys.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                {format === "pdf" ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Generate {format === "pdf" ? "PDF" : "Excel"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MonthlyReportModal;
