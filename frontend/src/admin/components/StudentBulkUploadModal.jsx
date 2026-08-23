import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  Loader2,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../context/authContext/AuthContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import { getApiErrorMessage } from "../../lib/formValidation";
import {
  downloadStudentErrorReport,
  downloadStudentTemplate,
  importStudentBulkUpload,
  isAllowedStudentBulkFile,
  previewStudentBulkUpload,
} from "../../services/studentBulkUploadService";

const emptySummary = {
  total: 0,
  valid: 0,
  failed: 0,
  errors: [],
};

const formatFileSize = (size = 0) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const SummaryCard = ({ label, value, tone }) => {
  const toneClasses = {
    neutral: "border-slate-200 bg-white text-slate-900",
    success: "border-green-100 bg-green-50 text-green-700",
    danger: "border-red-100 bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClasses[tone] || toneClasses.neutral}`}>
      <p className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
};

const StudentBulkUploadModal = ({ isOpen, onClose, onImported }) => {
  const { axios, token } = useAuth();
  const { notify } = useNotifier();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  if (!isOpen) {
    return null;
  }

  const resetModal = () => {
    setSelectedFile(null);
    setDragActive(false);
    setPreviewResult(null);
    setIsPreviewing(false);
    setIsImporting(false);
    setSkipDuplicates(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeModal = () => {
    resetModal();
    onClose?.();
  };

  const setFile = (file) => {
    if (!file) {
      return;
    }

    if (!isAllowedStudentBulkFile(file)) {
      notify.error("Please select a CSV or XLSX file.");
      return;
    }

    setSelectedFile(file);
    setPreviewResult(null);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setPreviewResult(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileInputChange = (event) => {
    setFile(event.target.files?.[0]);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    setFile(event.dataTransfer.files?.[0]);
  };

  const handlePreview = async () => {
    if (!selectedFile) {
      notify.warning("Select a file before previewing.");
      return;
    }

    try {
      setIsPreviewing(true);
      const result = await previewStudentBulkUpload({ axios, token, file: selectedFile });
      setPreviewResult(result);
      notify.success(`Preview ready: ${result.valid || 0} valid, ${result.failed || 0} failed`, 4000);
    } catch (error) {
      const apiResult = error.response?.data;
      if (apiResult?.errors || apiResult?.missingColumns) {
        setPreviewResult({
          total: apiResult.total || 0,
          valid: apiResult.valid || 0,
          failed: apiResult.failed || apiResult.errors?.length || 0,
          errors: apiResult.errors || [],
        });
      }

      notify.error(getApiErrorMessage(error, "Unable to preview student upload"));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      notify.warning("Select a file before importing.");
      return;
    }

    try {
      setIsImporting(true);
      const result = await importStudentBulkUpload({
        axios,
        token,
        file: selectedFile,
        skipDuplicates,
      });

      setPreviewResult(result);

      if (result.imported > 0) {
        notify.success(result.message || `${result.imported} students imported successfully`, 5000);
        await onImported?.();
      }

      if (result.errors?.length > 0) {
        notify.warning(`${result.errors.length} rows failed. Download the error report for details.`, 6000);
      }
    } catch (error) {
      const apiResult = error.response?.data;
      if (apiResult?.errors) {
        setPreviewResult({
          total: apiResult.total || 0,
          valid: apiResult.valid || 0,
          failed: apiResult.failed || apiResult.errors.length,
          errors: apiResult.errors,
        });
      }

      notify.error(getApiErrorMessage(error, "Unable to import students"));
    } finally {
      setIsImporting(false);
    }
  };

  const summary = previewResult || emptySummary;
  const errors = summary.errors || [];
  const importDisabled =
    !selectedFile ||
    isPreviewing ||
    isImporting ||
    (previewResult && Number(previewResult.valid || 0) === 0 && Number(previewResult.total || 0) > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 backdrop-blur-sm sm:p-4"
      role="presentation"
      onClick={closeModal}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
          <div>
            <h2 id="bulk-upload-title" className="text-lg font-bold text-gray-900 sm:text-2xl">
              Bulk Upload Students
            </h2>
            <p className="mt-1 text-xs text-gray-500 sm:text-sm">
              Use CSV or XLSX files with the exact student template columns.
            </p>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close bulk upload modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6">
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Template</p>
                <p className="mt-1 text-xs text-gray-500">
                  Use the exact class session label shown in Classes, or the class session ID.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadStudentTemplate}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
              >
                <Download className="h-4 w-4" />
                Download Template
              </button>
            </div>

            <div
              className={`rounded-lg border-2 border-dashed bg-white p-6 text-center transition ${
                dragActive ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-300"
              }`}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#CFCEFF]">
                <UploadCloud className="h-6 w-6 text-white" />
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-900">Drag and drop a file here</p>
              <p className="mt-1 text-xs text-gray-500">CSV and XLSX files only</p>
              <button
                type="button"
                className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-slate-100"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse File
              </button>
            </div>

            {selectedFile && (
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {selectedFile.name} selected
                    </p>
                    <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeSelectedFile}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard label="Total rows" value={summary.total || 0} tone="neutral" />
              <SummaryCard label="Valid rows" value={summary.valid || 0} tone="success" />
              <SummaryCard label="Failed rows" value={summary.failed || 0} tone="danger" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(event) => setSkipDuplicates(event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Skip duplicate existing students during import</span>
            </label>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  {errors.length > 0 ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : previewResult ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <FileWarning className="h-4 w-4 text-slate-400" />
                  )}
                  <h3 className="text-sm font-semibold text-gray-900">Validation Errors</h3>
                </div>

                {errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadStudentErrorReport(errors)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-slate-100"
                  >
                    <Download className="h-4 w-4" />
                    Download Error Report
                  </button>
                )}
              </div>

              {errors.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="w-24 px-4 py-3 font-semibold">Row</th>
                        <th className="px-4 py-3 font-semibold">Error message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((error, index) => (
                        <tr key={`${error.row}-${index}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-gray-700">{error.row}</td>
                          <td className="px-4 py-3 text-gray-600">{error.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-6 text-sm text-gray-500">
                  <AlertTriangle className="h-4 w-4 text-slate-400" />
                  {previewResult ? "No validation errors found." : "Preview a file to see row-level errors."}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={!selectedFile || isPreviewing || isImporting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPreviewing && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPreviewing ? "Previewing..." : "Preview"}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isImporting ? "Importing..." : "Import Students"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentBulkUploadModal;
