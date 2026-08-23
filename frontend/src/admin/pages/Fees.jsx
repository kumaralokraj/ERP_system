import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";
import { useAdmin } from "../../context/adminContext/AdminContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import {
  ClassCardShimmer,
  StudentCardsShimmer,
  StudentTableShimmer,
  SummaryCardsShimmer,
} from "../components/ShimmerLoader";
import GlobalFeeStudentSearch from "../components/fees/GlobalFeeStudentSearch";
import MonthlyReportModal from "../components/fees/MonthlyReportModal";
import {
  exportMonthlyClassExcel,
  exportMonthlyClassPdf,
} from "../utils/feesMonthlyReport";

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const getClassLabel = (classItem = {}) => {
  if (classItem.displayName) return classItem.displayName;
  const className = classItem.name || classItem.classId?.name || "Class";
  const section = classItem.section ? `-${classItem.section}` : "";
  const academicYear = classItem.academicYear
    ? ` (${classItem.academicYear})`
    : "";
  return `${className}${section}${academicYear}`;
};

const getStudentSearchText = (student = {}) =>
  [
    getStudentName(student),
    student.studentId,
    student.admissionNo,
    student.phone,
    student.email,
    student.parentName,
    student.parentPhone,
    student.parentEmail,
    student.parent?.fatherName,
    student.parent?.motherName,
    student.parent?.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const toId = (value) => String(value?._id || value || "");

const getStudentClassId = (student = {}) =>
  toId(
    student.classSession?._id ||
      student.classSession ||
      student.class?._id ||
      student.class,
  );

const getStudentName = (student = {}) =>
  student.name ||
  `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
  "Student";

const getStudentFeeFallback = (classItem = {}, student = {}) => {
  const fees = classItem.fees || {};
  const feeSettings = student.feeSettings || {};
  const baseAdmissionFee = Number(fees.admission || 0);
  const hasAdmissionOverride =
    feeSettings.admissionFeeOverride !== null &&
    feeSettings.admissionFeeOverride !== undefined &&
    feeSettings.admissionFeeOverride !== "";
  const admissionFee = hasAdmissionOverride
    ? Math.min(
        Math.max(Number(feeSettings.admissionFeeOverride) || 0, 0),
        baseAdmissionFee,
      )
    : baseAdmissionFee;
  const tuitionConcession = feeSettings.tuitionConcession || {};
  const baseTuition = Number(fees.tuition || 0);
  const tuition =
    tuitionConcession.isActive && tuitionConcession.type === "fixed"
      ? Math.max(baseTuition - Number(tuitionConcession.value || 0) * 12, 0)
      : tuitionConcession.isActive && tuitionConcession.type === "percentage"
        ? Math.max(
            baseTuition -
              (baseTuition *
                Math.min(Number(tuitionConcession.value || 0), 100)) /
                100,
            0,
          )
        : baseTuition;

  return (
    tuition +
    admissionFee +
    Number(fees.exam || 0) +
    (feeSettings.transportOpted === false
      ? 0
      : Number(feeSettings.transportFee || 0)) +
    Number(fees.books || 0)
  );
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

const getStatusLabel = (status = "") => {
  const normalizedStatus = String(status || "pending").toLowerCase();
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const Fees = () => {
  const navigate = useNavigate();
  const { axios, token } = useAuth();
  const { notify } = useNotifier();
  const {
    classes,
    students,
    feesData,
    classesLoading,
    studentsLoading,
    feesLoading,
    fetchClasses,
    fetchStudents,
    getFeesData,
  } = useAdmin();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [studentSearchTerm, setStudentSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [reportModal, setReportModal] = useState({
    open: false,
    summary: null,
    format: "pdf",
  });
  const [reportLoading, setReportLoading] = useState(false);

  const loading = classesLoading || studentsLoading || feesLoading;

  const classSummaries = useMemo(
    () =>
      (classes || []).map((classItem) => {
        const classId = toId(classItem._id);
        const classStudents = (students || []).filter(
          (student) => getStudentClassId(student) === classId,
        );
        const enrichedStudents = classStudents.map((student) => {
          const feeRecord = feesData?.[student._id] || {};
          const totalFees =
            Number(
              feeRecord.totalFees ??
                getStudentFeeFallback(classItem, student) ??
                0,
            ) || 0;
          const paidAmount = Number(feeRecord.paidAmount || 0) || 0;
          const pendingAmount = Number.isFinite(Number(feeRecord.remaining))
            ? Number(feeRecord.remaining)
            : Math.max(totalFees - paidAmount, 0);
          const status =
            feeRecord.status ||
            (pendingAmount <= 0 && totalFees > 0
              ? "paid"
              : paidAmount > 0
                ? "partial"
                : "pending");

          return {
            ...student,
            totalFees,
            paidAmount,
            pendingAmount,
            status,
            dueDate: feeRecord.dueDate,
          };
        });
        const totalDue = enrichedStudents.reduce(
          (total, student) => total + student.totalFees,
          0,
        );
        const totalCollected = enrichedStudents.reduce(
          (total, student) => total + student.paidAmount,
          0,
        );
        const totalPending = enrichedStudents.reduce(
          (total, student) => total + student.pendingAmount,
          0,
        );
        const hasOverdue = enrichedStudents.some(
          (student) => String(student.status).toLowerCase() === "overdue",
        );
        const status =
          totalPending <= 0 && enrichedStudents.length > 0
            ? "paid"
            : hasOverdue
              ? "overdue"
              : totalCollected > 0
                ? "partial"
                : "pending";

        return {
          classItem,
          classId,
          label: getClassLabel(classItem),
          students: enrichedStudents,
          studentCount: enrichedStudents.length,
          totalDue,
          totalCollected,
          totalPending,
          status,
          collectionRate:
            totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
        };
      }),
    [classes, feesData, students],
  );

  const globalSearchStudents = useMemo(
    () =>
      classSummaries.flatMap((summary) =>
        summary.students.map((student) => ({
          id: student._id,
          familyId: toId(student.familyId),
          name: getStudentName(student),
          admissionNo: student.admissionNo || student.studentId || "",
          studentId: student.studentId || "",
          className: summary.label,
          fatherName: student.parent?.fatherName || student.parentName || "N/A",
          motherName: student.parent?.motherName || "N/A",
          phone:
            student.parent?.phone || student.parentPhone || student.phone || "",
          parentPhone: student.parentPhone || "",
          status: student.status,
          pendingAmount: student.pendingAmount,
        })),
      ),
    [classSummaries],
  );

  const filteredClasses = classSummaries;

  const selectedClass = useMemo(
    () =>
      classSummaries.find((summary) => summary.classId === selectedClassId) ||
      null,
    [classSummaries, selectedClassId],
  );

  const filteredStudents = useMemo(() => {
    const query = studentSearchTerm.trim().toLowerCase();
    return (selectedClass?.students || []).filter((student) => {
      const matchesStatus =
        filterStatus === "all" ||
        String(student.status).toLowerCase() === filterStatus;
      const searchText = getStudentSearchText(student);
      return matchesStatus && (!query || searchText.includes(query));
    });
  }, [filterStatus, selectedClass, studentSearchTerm]);

  const totals = useMemo(
    () =>
      classSummaries.reduce(
        (summary, classItem) => ({
          classes: summary.classes + 1,
          students: summary.students + classItem.studentCount,
          collected: summary.collected + classItem.totalCollected,
          pending: summary.pending + classItem.totalPending,
        }),
        { classes: 0, students: 0, collected: 0, pending: 0 },
      ),
    [classSummaries],
  );

  const refreshData = async () => {
    await Promise.all([fetchClasses(), fetchStudents(), getFeesData()]);
  };

  const handleExportExcel = (summary) => {
    if (!summary) return;
    setReportModal({ open: true, summary, format: "excel" });
  };

  const handleExportPdf = (summary) => {
    if (!summary) return;
    setReportModal({ open: true, summary, format: "pdf" });
  };

  const closeReportModal = () => {
    if (reportLoading) return;
    setReportModal({ open: false, summary: null, format: "pdf" });
  };

  const handleGenerateMonthlyReport = async ({ monthKeys, format }) => {
    const summary = reportModal.summary;
    if (!summary) return;
    const studentIds = (summary.students || [])
      .map((student) => student._id)
      .filter(Boolean);
    if (studentIds.length === 0) {
      notify.error("No students available in this class");
      return;
    }

    setReportLoading(true);
    try {
      const response = await axios.post(
        "/admin/classes/monthly-fees-report",
        {
          studentIds,
          academicYear: summary.classItem?.academicYear || "",
          monthKeys,
        },
        { headers: { token } },
      );

      if (!response.data?.success) {
        throw new Error(response.data?.message || "Unable to generate report");
      }

      const report = response.data.data;
      if (format === "excel") {
        exportMonthlyClassExcel({ classLabel: summary.label, report });
        notify.success(`Excel report downloaded for ${summary.label}`);
      } else {
        exportMonthlyClassPdf({ classLabel: summary.label, report });
        notify.success(`PDF report downloaded for ${summary.label}`);
      }
      setReportModal({ open: false, summary: null, format: "pdf" });
    } catch (error) {
      notify.error(
        error.response?.data?.message ||
          error.message ||
          "Unable to generate monthly fees report",
      );
    } finally {
      setReportLoading(false);
    }
  };

  const openStudentFeeProfile = (student) => {
    if (!student?._id) return;
    navigate(`/admin/fees/student/${student._id}`);
  };

  const openFamilyPaymentFromSearch = async (student) => {
    if (!student?.id) return;

    try {
      const response = await axios.get(
        `/admin/families/by-student/${student.id}`,
        {
          headers: { token },
        },
      );

      if (response.data?.success && response.data.familyId) {
        navigate(`/admin/fees/family/${response.data.familyId}`);
        return;
      }

      notify.error(response.data?.message || "Unable to open family payment");
    } catch (error) {
      if (student.familyId) {
        navigate(`/admin/fees/family/${student.familyId}`);
        return;
      }

      notify.error(
        error.response?.data?.message ||
          error.message ||
          "Unable to open family payment",
      );
    }
  };

  if (selectedClass) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => {
              setSelectedClassId("");
              setStudentSearchTerm("");
              setFilterStatus("all");
            }}
            className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Classes
          </button>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">
                {selectedClass.label} Fees
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                View students and open individual fee details.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportExcel(selectedClass)}
                disabled={
                  loading || (selectedClass?.students || []).length === 0
                }
                className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 shadow-sm transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                title="Download Excel report"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
              <button
                type="button"
                onClick={() => handleExportPdf(selectedClass)}
                disabled={
                  loading || (selectedClass?.students || []).length === 0
                }
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                title="Download PDF report"
              >
                <FileText className="h-4 w-4" />
                PDF
              </button>
              <button
                type="button"
                onClick={refreshData}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Students
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-950">
              {selectedClass.studentCount}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Total Fees
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-950">
              {formatCurrency(selectedClass.totalDue)}
            </p>
          </div>
          <div className="rounded-lg border border-green-100 bg-green-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-green-700">
              Collected
            </p>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {formatCurrency(selectedClass.totalCollected)}
            </p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-amber-700">
              Pending
            </p>
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {formatCurrency(selectedClass.totalPending)}
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={studentSearchTerm}
                onChange={(event) => setStudentSearchTerm(event.target.value)}
                placeholder="Search by student, admission no, parent, or phone"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {["all", "paid", "partial", "overdue", "pending"].map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      filterStatus === status
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {getStatusLabel(status)}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <>
            <div className="md:hidden">
              <StudentCardsShimmer />
            </div>
            <div className="hidden md:block">
              <StudentTableShimmer />
            </div>
          </>
        ) : filteredStudents.length === 0 ? (
          <div className="rounded-lg border border-gray-100 bg-white p-8 text-center text-sm font-medium text-gray-500">
            No students found.
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredStudents.map((student) => (
                <article
                  key={student._id}
                  className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-gray-950">
                        {getStudentName(student)}
                      </h2>
                      <p className="text-xs text-gray-500">
                        Admission No:{" "}
                        {student.admissionNo || student.studentId || "N/A"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusClass(student.status)}`}
                    >
                      {getStatusLabel(student.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">
                        Total
                      </p>
                      <p className="font-bold text-gray-950">
                        {formatCurrency(student.totalFees)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500">
                        Paid
                      </p>
                      <p className="font-bold text-green-700">
                        {formatCurrency(student.paidAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500">
                        Pending
                      </p>
                      <p className="font-bold text-red-600">
                        {formatCurrency(student.pendingAmount)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openStudentFeeProfile(student)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </article>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm md:block">
              <table className="w-full">
                <thead className="bg-gray-100 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Admission No</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStudents.map((student) => (
                    <tr
                      key={student._id}
                      className="transition hover:bg-gray-50"
                    >
                      <td className="px-4 py-4 text-sm font-semibold text-gray-950">
                        {getStudentName(student)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {student.admissionNo || student.studentId || "N/A"}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-gray-950">
                        {formatCurrency(student.totalFees)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-green-700">
                        {formatCurrency(student.paidAmount)}
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-semibold text-red-600">
                        {formatCurrency(student.pendingAmount)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusClass(student.status)}`}
                        >
                          {getStatusLabel(student.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openStudentFeeProfile(student)}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
                        >
                          View Details
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <MonthlyReportModal
          isOpen={reportModal.open}
          classLabel={reportModal.summary?.label}
          academicYear={reportModal.summary?.classItem?.academicYear || ""}
          defaultFormat={reportModal.format}
          loading={reportLoading}
          onClose={closeReportModal}
          onGenerate={handleGenerateMonthlyReport}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">
            Fees Management
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Search a student first, or use class cards below for reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshData}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <GlobalFeeStudentSearch
          students={globalSearchStudents}
          onSelect={openFamilyPaymentFromSearch}
        />
      </div>

      {loading ? (
        <SummaryCardsShimmer />
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Classes
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-950">
              {totals.classes}
            </p>
          </div>
          <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Students
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-950">
              {totals.students}
            </p>
          </div>
          <div className="rounded-lg border border-green-100 bg-green-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-green-700">
              Collected
            </p>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {formatCurrency(totals.collected)}
            </p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-amber-700">
              Pending
            </p>
            <p className="mt-2 text-2xl font-bold text-amber-700">
              {formatCurrency(totals.pending)}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <ClassCardShimmer />
      ) : filteredClasses.length === 0 ? (
        <div className="rounded-lg border border-gray-100 bg-white p-8 text-center text-sm font-medium text-gray-500">
          No classes found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredClasses.map((summary) => (
            <article
              key={summary.classId}
              className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-950">
                    {summary.label}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {summary.studentCount} students
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-bold ${getStatusClass(summary.status)}`}
                >
                  {getStatusLabel(summary.status)}
                </span>
              </div>

              <div className="mb-4 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(summary.collectionRate, 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-500">Total</p>
                  <p className="mt-1 text-sm font-bold text-gray-950">
                    {formatCurrency(summary.totalDue)}
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs font-semibold text-green-700">
                    Collected
                  </p>
                  <p className="mt-1 text-sm font-bold text-green-700">
                    {formatCurrency(summary.totalCollected)}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-700">
                    Pending
                  </p>
                  <p className="mt-1 text-sm font-bold text-amber-700">
                    {formatCurrency(summary.totalPending)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassId(summary.classId);
                    setStudentSearchTerm("");
                    setFilterStatus("all");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  View Details
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigate(`/admin/fees/pay/${summary.classId}`);
                  }}
                  className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700"
                >
                  Pay Fee
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleExportExcel(summary)}
                  disabled={summary.studentCount === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Download Excel report"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPdf(summary)}
                  disabled={summary.studentCount === 0}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Download PDF report"
                >
                  <FileText className="h-3.5 w-3.5" />
                  PDF
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <MonthlyReportModal
        isOpen={reportModal.open}
        classLabel={reportModal.summary?.label}
        academicYear={reportModal.summary?.classItem?.academicYear || ""}
        defaultFormat={reportModal.format}
        loading={reportLoading}
        onClose={closeReportModal}
        onGenerate={handleGenerateMonthlyReport}
      />
    </div>
  );
};

export default Fees;
