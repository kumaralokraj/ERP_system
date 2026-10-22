import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CopyPlus,
  Eye,
  GraduationCap,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/authContext/AuthContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import { getApiErrorMessage, normalizeAcademicYear } from "../../lib/formValidation";

const RESULT_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "detained", label: "Detained" },
  { value: "absent", label: "Absent" },
  { value: "withheld", label: "Withheld" },
];

const DECISION_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "promote", label: "Promote" },
  { value: "repeat", label: "Repeat" },
  { value: "graduate", label: "Graduate" },
  { value: "transfer", label: "Transfer" },
  { value: "drop", label: "Drop" },
  { value: "skip", label: "Skip" },
];

const getCurrentAcademicYear = () => {
  const today = new Date();
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const getNextAcademicYear = (academicYear) => {
  const normalizedYear = normalizeAcademicYear(academicYear);
  const match = normalizedYear.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";

  const startYear = Number(match[1]) + 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const buildAcademicYearOptions = () => {
  const currentYear = getCurrentAcademicYear();
  const start = Number(currentYear.slice(0, 4));

  return Array.from({ length: 10 }, (_, index) => {
    const year = start - 4 + index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
};

const formatSessionLabel = (classSession) => {
  if (!classSession) return "Select class session";

  return (
    classSession.displayName ||
    `${classSession.name || "Class"}${classSession.section ? `-${classSession.section}` : ""} (${classSession.academicYear})`
  );
};

const getStudentName = (student) =>
  student?.name || `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || "Student";

const buildResultRows = (students = []) =>
  students.map(({ student, enrollment, result }) => ({
    studentId: student?._id || result?.studentId || "",
    enrollmentId: enrollment?._id || result?.enrollmentId || "",
    name: getStudentName(student),
    admissionNo: student?.admissionNo || student?.studentId || "",
    resultStatus: result?.resultStatus || "pending",
    percentage: result?.percentage ?? "",
    grade: result?.grade || "",
    remarks: result?.remarks || "",
    decision: "",
    targetClassSessionId: "",
    note: "",
  }));

const buildStudentDecisions = (rows = []) =>
  rows
    .filter((row) => row.decision || row.targetClassSessionId || row.note)
    .map((row) => ({
      studentId: row.studentId,
      decision: row.decision || undefined,
      targetClassSessionId: row.targetClassSessionId || undefined,
      note: row.note || undefined,
    }));

const getPreviewTone = (summary = {}) => {
  if (summary.errors > 0) return "border-red-200 bg-red-50 text-red-700";
  if (summary.warnings > 0) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const SummaryTile = ({ label, value, icon: Icon, tone = "bg-slate-50 text-slate-700" }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {Icon ? (
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
      ) : null}
    </div>
    <p className="mt-2 text-2xl font-semibold text-gray-900">{Number(value || 0).toLocaleString()}</p>
  </div>
);

const StatusPill = ({ children, tone = "slate" }) => {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
};

const Promotions = () => {
  const navigate = useNavigate();
  const { axios, token, hasPermission } = useAuth();
  const { notify, confirm } = useNotifier();
  const defaultCurrentYear = useMemo(getCurrentAcademicYear, []);
  const [currentYear, setCurrentYear] = useState(defaultCurrentYear);
  const [nextYear, setNextYear] = useState(getNextAcademicYear(defaultCurrentYear));
  const [context, setContext] = useState(null);
  const [rollover, setRollover] = useState(null);
  const [selectedClassSessionId, setSelectedClassSessionId] = useState("");
  const [resultClassSession, setResultClassSession] = useState(null);
  const [resultRows, setResultRows] = useState([]);
  const [resultRowsDirty, setResultRowsDirty] = useState(false);
  const [scopeType, setScopeType] = useState("classSession");
  const [preview, setPreview] = useState(null);
  const [batch, setBatch] = useState(null);
  const [batchItems, setBatchItems] = useState([]);
  const [loading, setLoading] = useState({});

  const academicYearOptions = useMemo(buildAcademicYearOptions, []);
  const headers = useMemo(() => ({ token }), [token]);

  const sourceSessions = context?.sourceSessions || [];
  const targetSessions = context?.targetSessions || [];
  const existingBatches = context?.existingBatches || [];
  const missingTargetSessions = rollover?.sessions?.filter((session) => session.status === "missing") || [];

  const setBusy = (key, value) => {
    setLoading((current) => ({ ...current, [key]: value }));
  };

  const loadContext = useCallback(async () => {
    const normalizedCurrentYear = normalizeAcademicYear(currentYear);
    const normalizedNextYear = normalizeAcademicYear(nextYear);

    if (!normalizedCurrentYear || !normalizedNextYear) {
      notify.error("Select valid current and next academic years");
      return null;
    }

    try {
      setBusy("context", true);
      const response = await axios.get("/promotions/context", {
        headers,
        params: {
          currentYear: normalizedCurrentYear,
          nextYear: normalizedNextYear,
        },
      });

      const data = response.data;
      const nextSourceSessions = data.sourceSessions || [];
      setContext(data);
      setSelectedClassSessionId((currentValue) =>
        nextSourceSessions.some((classSession) => String(classSession._id) === String(currentValue))
          ? currentValue
          : nextSourceSessions[0]?._id || ""
      );
      return data;
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to load promotion context"));
      return null;
    } finally {
      setBusy("context", false);
    }
  }, [axios, currentYear, headers, nextYear, notify]);

  const loadRollover = useCallback(async () => {
    const normalizedCurrentYear = normalizeAcademicYear(currentYear);
    const normalizedNextYear = normalizeAcademicYear(nextYear);

    if (!normalizedCurrentYear || !normalizedNextYear) {
      return null;
    }

    try {
      setBusy("rollover", true);
      const response = await axios.get("/session-rollover/preview", {
        headers,
        params: {
          sourceYear: normalizedCurrentYear,
          targetYear: normalizedNextYear,
        },
      });
      setRollover(response.data);
      return response.data;
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to load session rollover preview"));
      return null;
    } finally {
      setBusy("rollover", false);
    }
  }, [axios, currentYear, headers, nextYear, notify]);

  const refreshPromotionWorkspace = useCallback(async () => {
    setPreview(null);
    setBatch(null);
    setBatchItems([]);
    await Promise.all([loadContext(), loadRollover()]);
  }, [loadContext, loadRollover]);

  useEffect(() => {
    refreshPromotionWorkspace();
  }, [refreshPromotionWorkspace]);

  const handleCurrentYearChange = (event) => {
    const normalizedYear = normalizeAcademicYear(event.target.value) || event.target.value;
    setCurrentYear(normalizedYear);
    setNextYear(getNextAcademicYear(normalizedYear));
    setResultClassSession(null);
    setResultRows([]);
    setResultRowsDirty(false);
  };

  const handleSelectedClassChange = (event) => {
    setSelectedClassSessionId(event.target.value);
    setResultClassSession(null);
    setResultRows([]);
    setResultRowsDirty(false);
    setPreview(null);
    setBatch(null);
    setBatchItems([]);
  };

  const handleCloneMissingSessions = async () => {
    if (missingTargetSessions.length === 0) {
      notify.success("Target year already has matching class sessions");
      return;
    }

    const shouldClone = await confirm({
      title: "Create target sessions",
      message: `Create ${missingTargetSessions.length} missing class session(s) for ${nextYear}?`,
      confirmText: "Create",
      cancelText: "Cancel",
      tone: "primary",
    });

    if (!shouldClone) return;

    try {
      setBusy("clone", true);
      const response = await axios.post(
        "/session-rollover/clone",
        {
          sourceYear: currentYear,
          targetYear: nextYear,
          selectedClassSessionIds: missingTargetSessions.map((session) => session.sourceSession?._id).filter(Boolean),
        },
        { headers }
      );

      if (response.data.errors?.length > 0) {
        notify.error("Some class sessions could not be created");
      } else {
        notify.success("Target class sessions created");
      }

      await refreshPromotionWorkspace();
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to create target class sessions"));
    } finally {
      setBusy("clone", false);
    }
  };

  const loadResultsForSelectedClass = async () => {
    if (!selectedClassSessionId) {
      notify.error("Select a source class session first");
      return;
    }

    try {
      setBusy("results", true);
      const response = await axios.get(`/results/class-session/${selectedClassSessionId}`, {
        headers,
        params: { academicYear: currentYear },
      });
      setResultClassSession(response.data.classSession);
      setResultRows(buildResultRows(response.data.students || []));
      setResultRowsDirty(false);
      setPreview(null);
      setBatch(null);
      setBatchItems([]);
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to load class results"));
    } finally {
      setBusy("results", false);
    }
  };

  const updateResultRow = (studentId, patch) => {
    setResultRows((currentRows) =>
      currentRows.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row))
    );
    setResultRowsDirty(true);
  };

  const markAllResults = (resultStatus) => {
    setResultRows((currentRows) => currentRows.map((row) => ({ ...row, resultStatus })));
    setResultRowsDirty(true);
  };

  const saveResults = async ({ quiet = false } = {}) => {
    if (!selectedClassSessionId || resultRows.length === 0) {
      if (!quiet) {
        notify.error("Load a class before saving results");
      }
      return false;
    }

    try {
      setBusy("saveResults", true);
      await axios.post(
        "/results/bulk",
        {
          classSessionId: selectedClassSessionId,
          academicYear: currentYear,
          results: resultRows.map((row) => ({
            enrollmentId: row.enrollmentId,
            resultStatus: row.resultStatus,
            percentage: row.percentage,
            grade: row.grade,
            remarks: row.remarks,
          })),
        },
        { headers }
      );
      if (!quiet) {
        notify.success("Results saved");
      }
      setResultRowsDirty(false);
      await loadResultsForSelectedClass();
      return true;
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to save results"));
      return false;
    } finally {
      setBusy("saveResults", false);
    }
  };

  const ensureResultsSaved = async () => {
    if (!resultRowsDirty) {
      return true;
    }

    const saved = await saveResults({ quiet: true });
    if (saved) {
      notify.success("Unsaved result changes were saved before preview");
    }
    return saved;
  };

  const buildPromotionPayload = () => {
    const classScoped = scopeType === "classSession" && selectedClassSessionId;

    return {
      currentYear,
      nextYear,
      scope: classScoped
        ? { type: "classSession", classSessionId: selectedClassSessionId }
        : { type: "year" },
      studentDecisions: buildStudentDecisions(resultRows),
    };
  };

  const previewPromotion = async () => {
    if (scopeType === "classSession" && !selectedClassSessionId) {
      notify.error("Select a source class session first");
      return;
    }

    if (!(await ensureResultsSaved())) {
      return;
    }

    try {
      setBusy("preview", true);
      const response = await axios.post("/promotions/preview", buildPromotionPayload(), { headers });
      setPreview(response.data);
      setBatch(null);
      setBatchItems([]);
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to preview promotion"));
    } finally {
      setBusy("preview", false);
    }
  };

  const createPromotionBatch = async () => {
    if (!(await ensureResultsSaved())) {
      return;
    }

    try {
      setBusy("createBatch", true);
      const response = await axios.post("/promotions/batches", buildPromotionPayload(), { headers });
      setPreview(response.data.preview);
      setBatch(response.data.batch);
      setBatchItems([]);
      notify.success("Promotion batch created");
      await loadContext();
    } catch (error) {
      const previewFromError = error?.response?.data?.preview;
      if (previewFromError) {
        setPreview(previewFromError);
      }
      notify.error(getApiErrorMessage(error, "Failed to create promotion batch"));
    } finally {
      setBusy("createBatch", false);
    }
  };

  const loadBatch = async (batchId) => {
    try {
      setBusy(`batch:${batchId}`, true);
      const response = await axios.get(`/promotions/batches/${batchId}`, { headers });
      setBatch(response.data.batch);
      setBatchItems(response.data.items || []);
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to load promotion batch"));
    } finally {
      setBusy(`batch:${batchId}`, false);
    }
  };

  const executeBatch = async () => {
    if (!batch?._id) {
      notify.error("Create or load a promotion batch first");
      return;
    }

    const shouldExecute = await confirm({
      title: "Execute promotion",
      message: `Promote students for ${batch.currentYear} to ${batch.nextYear}? This will update enrollments and fee records.`,
      confirmText: "Execute",
      cancelText: "Cancel",
      tone: "danger",
    });

    if (!shouldExecute) return;

    try {
      setBusy("execute", true);
      const response = await axios.post(
        `/promotions/batches/${batch._id}/execute`,
        {},
        {
          headers: {
            ...headers,
            "Idempotency-Key": `promotion-${batch._id}`,
          },
        }
      );
      setBatch(response.data.batch);
      notify.success(response.data.message || "Promotion executed");
      await Promise.all([loadBatch(batch._id), refreshPromotionWorkspace()]);
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to execute promotion batch"));
    } finally {
      setBusy("execute", false);
    }
  };

  const previewSummary = preview?.summary || {};
  const canCreateBatch = Boolean(preview && previewSummary.total > 0 && previewSummary.errors === 0);

  return (
    <div className="flex-1 m-2 mt-0 rounded-md bg-white sm:m-3 md:m-4">
      <div className="flex flex-col gap-4 p-3 sm:p-4 md:p-6">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            {hasPermission("classes.view") ? (
              <button
                onClick={() => navigate("/admin/classes")}
                className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                title="Back to classes"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <div>
              <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Student Promotion</h1>
              <p className="mt-1 text-sm text-gray-500">
                Roll over class sessions, save results, preview blockers, then execute one audited batch.
              </p>
            </div>
          </div>

          <button
            onClick={refreshPromotionWorkspace}
            disabled={loading.context || loading.rollover}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400"
          >
            {loading.context || loading.rollover ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Current Year</label>
            <select
              value={currentYear}
              onChange={handleCurrentYearChange}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {academicYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Next Year</label>
            <select
              value={nextYear}
              onChange={(event) => setNextYear(normalizeAcademicYear(event.target.value) || event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {academicYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <SummaryTile
            label="Source Students"
            value={Object.values(context?.sourceEnrollmentCounts || {}).reduce((total, count) => total + count, 0)}
            icon={Users}
            tone="bg-blue-50 text-blue-700"
          />
          <SummaryTile
            label="Missing Sessions"
            value={rollover?.summary?.missingTargetSessions || 0}
            icon={AlertTriangle}
            tone={missingTargetSessions.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.45fr]">
          <section className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Session Rollover</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Target sessions are matched by master class and section.
                </p>
              </div>
              <button
                onClick={handleCloneMissingSessions}
                disabled={loading.clone || missingTargetSessions.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                {loading.clone ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}
                Create Missing
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-semibold text-gray-900">{rollover?.summary?.sourceSessions || 0}</p>
                <p className="text-xs text-gray-500">Source</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="font-semibold text-emerald-700">{rollover?.summary?.existingTargetSessions || 0}</p>
                <p className="text-xs text-emerald-700">Ready</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="font-semibold text-amber-700">{rollover?.summary?.missingTargetSessions || 0}</p>
                <p className="text-xs text-amber-700">Missing</p>
              </div>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-gray-200">
              {(rollover?.sessions || []).length > 0 ? (
                rollover.sessions.map((session) => (
                  <div
                    key={session.sourceSession?._id}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {formatSessionLabel(session.sourceSession)}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {session.targetSession ? formatSessionLabel(session.targetSession) : "No target session"}
                      </p>
                    </div>
                    <StatusPill tone={session.status === "existing" ? "emerald" : "amber"}>
                      {session.status === "existing" ? "Ready" : "Missing"}
                    </StatusPill>
                  </div>
                ))
              ) : (
                <p className="p-4 text-sm text-gray-500">No source class sessions found for this year.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Result Entry</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Results are saved against the source enrollment for {currentYear}.
                </p>
                <select
                  value={selectedClassSessionId}
                  onChange={handleSelectedClassChange}
                  className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {sourceSessions.length === 0 ? <option value="">No source sessions</option> : null}
                  {sourceSessions.map((classSession) => (
                    <option key={classSession._id} value={classSession._id}>
                      {formatSessionLabel(classSession)} -{" "}
                      {context?.sourceEnrollmentCounts?.[classSession._id] || 0} students
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={loadResultsForSelectedClass}
                  disabled={loading.results || !selectedClassSessionId}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-gray-300"
                >
                  {loading.results ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  Load
                </button>
                <button
                  onClick={() => markAllResults("pass")}
                  disabled={resultRows.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark Pass
                </button>
                <button
                  onClick={saveResults}
                  disabled={loading.saveResults || resultRows.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {loading.saveResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
            </div>

            {resultClassSession ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
                <span>
                  Loaded {resultRows.length} student(s) from {formatSessionLabel(resultClassSession)}
                </span>
                {resultRowsDirty ? <StatusPill tone="amber">Unsaved changes</StatusPill> : null}
              </div>
            ) : null}

            <div className="mt-4 max-h-[34rem] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Result</th>
                    <th className="px-3 py-3">%</th>
                    <th className="px-3 py-3">Grade</th>
                    <th className="px-3 py-3">Manual Decision</th>
                    <th className="px-3 py-3">Target Override</th>
                    <th className="px-3 py-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.length > 0 ? (
                    resultRows.map((row) => (
                      <tr key={row.studentId} className="border-t border-gray-100 even:bg-slate-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.admissionNo || "No admission no"}</p>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.resultStatus}
                            onChange={(event) => updateResultRow(row.studentId, { resultStatus: event.target.value })}
                            className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            {RESULT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={row.percentage}
                            onChange={(event) => updateResultRow(row.studentId, { percentage: event.target.value })}
                            className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.grade}
                            onChange={(event) => updateResultRow(row.studentId, { grade: event.target.value })}
                            className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.decision}
                            onChange={(event) => updateResultRow(row.studentId, { decision: event.target.value })}
                            className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            {DECISION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.targetClassSessionId}
                            onChange={(event) =>
                              updateResultRow(row.studentId, { targetClassSessionId: event.target.value })
                            }
                            className="w-52 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            <option value="">Auto target</option>
                            {targetSessions.map((classSession) => (
                              <option key={classSession._id} value={classSession._id}>
                                {formatSessionLabel(classSession)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.note}
                            onChange={(event) => updateResultRow(row.studentId, { note: event.target.value })}
                            className="w-56 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Optional"
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                        Select a class session and load students.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Promotion Batch</h2>
              <p className="mt-1 text-sm text-gray-500">
                Preview validates results, target sessions, duplicate target-year enrollments, and capacity.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-gray-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setScopeType("classSession")}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    scopeType === "classSession" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Selected Class
                </button>
                <button
                  type="button"
                  onClick={() => setScopeType("year")}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    scopeType === "year" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                  }`}
                >
                  Full Year
                </button>
              </div>

              <button
                onClick={previewPromotion}
                disabled={loading.preview}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-gray-300"
              >
                {loading.preview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Preview
              </button>
              <button
                onClick={createPromotionBatch}
                disabled={loading.createBatch || !canCreateBatch}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                {loading.createBatch ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GraduationCap className="h-4 w-4" />
                )}
                Create Batch
              </button>
              <button
                onClick={executeBatch}
                disabled={loading.execute || !batch?._id || batch?.status === "completed"}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {loading.execute ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Execute
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            <SummaryTile label="Total" value={previewSummary.total} />
            <SummaryTile label="Ready" value={previewSummary.ready} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
            <SummaryTile label="Promote" value={previewSummary.promoted} />
            <SummaryTile label="Repeat" value={previewSummary.repeated} icon={RotateCcw} tone="bg-blue-50 text-blue-700" />
            <SummaryTile label="Graduate" value={previewSummary.graduated} icon={GraduationCap} tone="bg-indigo-50 text-indigo-700" />
            <SummaryTile label="Errors" value={previewSummary.errors} icon={AlertTriangle} tone="bg-red-50 text-red-700" />
          </div>

          {preview ? (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${getPreviewTone(previewSummary)}`}>
              {previewSummary.errors > 0
                ? "Fix preview errors before creating a promotion batch."
                : previewSummary.warnings > 0
                  ? "Preview is batch-ready, but review warnings before execution."
                  : "Preview is ready for batch creation."}
            </div>
          ) : null}

          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-gray-200">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">From</th>
                  <th className="px-3 py-3">Result</th>
                  <th className="px-3 py-3">Decision</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Messages</th>
                </tr>
              </thead>
              <tbody>
                {(preview?.items || []).length > 0 ? (
                  preview.items.map((item) => (
                    <tr key={item.studentId} className="border-t border-gray-100 even:bg-slate-50">
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{getStudentName(item.student)}</p>
                        <p className="text-xs text-gray-500">
                          {item.student?.admissionNo || item.student?.studentId || "No admission no"}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{item.fromClass || "-"}</td>
                      <td className="px-3 py-2 capitalize">{item.resultStatus || "pending"}</td>
                      <td className="px-3 py-2 capitalize">{item.decision}</td>
                      <td className="px-3 py-2 text-gray-700">{item.targetClass || "-"}</td>
                      <td className="px-3 py-2">
                        <StatusPill
                          tone={item.errors?.length ? "red" : item.warnings?.length ? "amber" : "emerald"}
                        >
                          {item.status}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-2">
                        {[...(item.errors || []), ...(item.warnings || [])].length > 0 ? (
                          <ul className="space-y-1 text-xs text-gray-600">
                            {[...(item.errors || []), ...(item.warnings || [])].map((message) => (
                              <li key={message}>{message}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-gray-400">No messages</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                      Run preview to see promotion decisions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Recent Batches</h2>
              <p className="mt-1 text-sm text-gray-500">Use these to resume execution or review status.</p>
            </div>
            {batch ? (
              <StatusPill tone={batch.status === "completed" ? "emerald" : batch.status === "failed" ? "red" : "blue"}>
                Loaded: {batch.batchNo}
              </StatusPill>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {existingBatches.length > 0 ? (
              existingBatches.map((existingBatch) => (
                <div
                  key={existingBatch._id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{existingBatch.batchNo}</p>
                    <p className="text-xs text-gray-500">
                      {existingBatch.currentYear} to {existingBatch.nextYear} - {existingBatch.counts?.total || 0} students
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill
                      tone={
                        existingBatch.status === "completed"
                          ? "emerald"
                          : existingBatch.status === "failed"
                            ? "red"
                            : "blue"
                      }
                    >
                      {existingBatch.status}
                    </StatusPill>
                    <button
                      onClick={() => loadBatch(existingBatch._id)}
                      disabled={loading[`batch:${existingBatch._id}`]}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                      title="Load batch"
                    >
                      {loading[`batch:${existingBatch._id}`] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                No promotion batches found for this year pair.
              </p>
            )}
          </div>

          {batchItems.length > 0 ? (
            <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Decision</th>
                    <th className="px-3 py-3">Result</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {batchItems.map((item) => (
                    <tr key={item._id} className="border-t border-gray-100 even:bg-slate-50">
                      <td className="px-3 py-2 text-gray-700">{item.studentId}</td>
                      <td className="px-3 py-2 capitalize">{item.decision}</td>
                      <td className="px-3 py-2 capitalize">{item.resultStatus}</td>
                      <td className="px-3 py-2">
                        <StatusPill tone={item.status === "processed" ? "emerald" : item.status === "failed" ? "red" : "blue"}>
                          {item.status}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {[...(item.errorMessages || []), ...(item.warningMessages || [])].join(", ") || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default Promotions;
