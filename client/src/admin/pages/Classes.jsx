import React, { useCallback, useEffect, useMemo, useState } from "react";
import Table from "../components/Table";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";
import { useAdmin } from "../../context/adminContext/AdminContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import {
  TableRowShimmer,
  MobileCardShimmer,
  ListHeaderShimmer,
} from "../components/Shimmer";
import { X, Plus, Pencil, Eye, Trash2, Copy, GraduationCap } from "lucide-react";
import {
  getApiErrorMessage,
  normalizeAcademicYear,
  validateClassForm,
} from "../../lib/formValidation";

const columns = [
  { header: "Class", accessor: "name" },
  { header: "Section", accessor: "section", className: "hidden md:table-cell" },
  { header: "Academic Year", accessor: "academicYear", className: "hidden md:table-cell" },
  { header: "Teacher", accessor: "classTeacher", className: "hidden lg:table-cell" },
  { header: "Capacity", accessor: "capacity", className: "hidden lg:table-cell" },
  { header: "Status", accessor: "status", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "action" },
];

// const initialClassFormData = {
//   classId: "",
//   section: "",
//   academicYear: "",
//   classTeacher: "",
//   capacity: 40,
//   fees: {
//     tuition: 0,
//     admission: 0,
//     exam: 0,
//     currency: "INR",
//   },
//   status: "ACTIVE",
// };
const initialClassFormData = {
  classId: "",
  section: "",
  academicYear: "",
  classTeacher: "",
  capacity: 40,

  fees: [
    {
      name: "Tuition Fee",
      amount: 0,
    },
    {
      name: "Admission Fee",
      amount: 0,
    },
    {
      name: "Exam Fee",
      amount: 0,
    },
  ],

  currency: "INR",
  status: "ACTIVE",
};
const buildAcademicYearOptions = () => {
  const currentDate = new Date();
  const currentStartYear = currentDate.getMonth() >= 3 ? currentDate.getFullYear() : currentDate.getFullYear() - 1;

  return Array.from({ length: 8 }, (_, index) => {
    const startYear = currentStartYear - 3 + index;
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
  });
};

const mapClassSessionToFormData = (classSession) => ({
  classId: classSession?.classId?._id || classSession?.classId || "",
  section: classSession?.section || "",
  academicYear: classSession?.academicYear || "",
  classTeacher: classSession?.classTeacher?._id || classSession?.classTeacher || "",
  capacity: Number.isInteger(classSession?.capacity) ? classSession.capacity : 40,
  fees: {
    tuition: Number(classSession?.fees?.tuition ?? 0),
    admission: Number(classSession?.fees?.admission ?? 0),
    exam: Number(classSession?.fees?.exam ?? 0),
    currency: classSession?.fees?.currency || "INR",
  },
  status: classSession?.status || "ACTIVE",
});

const getSessionName = (classSession) => classSession?.name || classSession?.classId?.name || "Untitled";

const formatSessionLabel = (classSession) => {
  const className = getSessionName(classSession);
  const section = classSession?.section ? `-${classSession.section}` : "";
  const academicYear = classSession?.academicYear ? ` (${classSession.academicYear})` : "";
  return `${className}${section}${academicYear}`;
};

const ClassListPage = () => {
  const { notify, confirm } = useNotifier();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, axios, hasPermission } = useAuth();
  const {
    classes,
    classesLoading,
    teachers,
    masterClasses,
    masterClassesLoading,
    fetchClasses,
  } = useAdmin();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingClassId, setEditingClassId] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formData, setFormData] = useState(initialClassFormData);

  const academicYearOptions = useMemo(buildAcademicYearOptions, []);

  const openCreateModal = () => {
    setFormMode("create");
    setEditingClassId("");
    setFormData({
      ...initialClassFormData,
      academicYear: academicYearOptions[3] || "",
    });
    setFormError("");
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = useCallback((classSession) => {
    if (!classSession?._id) {
      notify.error("Unable to open edit form for this class session");
      return;
    }

    setFormMode("edit");
    setEditingClassId(classSession._id);
    setFormData(mapClassSessionToFormData(classSession));
    setFormError("");
    setFieldErrors({});
    setIsModalOpen(true);
  }, [notify]);

  useEffect(() => {
    const classIdFromState = location.state?.openEditClassId;
    if (!classIdFromState || classesLoading) {
      return;
    }

    const classSessionToEdit = classes.find((item) => item._id === classIdFromState);
    if (!classSessionToEdit) {
      notify.error("Class session not found for editing");
      navigate("/admin/classes", { replace: true, state: null });
      return;
    }

    openEditModal(classSessionToEdit);
    navigate("/admin/classes", { replace: true, state: null });
  }, [classes, classesLoading, location.state, navigate, notify, openEditModal]);

  const clearFieldError = (fieldName) => {
    setFieldErrors((currentErrors) => {
      if (!currentErrors[fieldName]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
  };

  const getInputStateClass = (fieldName) =>
    fieldErrors[fieldName]
      ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500"
      : "border-gray-300 focus:ring-blue-500";

  const renderFieldError = (fieldName) =>
    fieldErrors[fieldName] ? (
      <p className="mt-1 text-xs text-red-600">{fieldErrors[fieldName]}</p>
    ) : null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormError("");
    clearFieldError(name);

    if (name.includes("fees.")) {
      const [, feeKey, nestedFeeKey] = name.split(".");
      setFormData((currentFormData) => ({
        ...currentFormData,
        fees: {
          ...currentFormData.fees,
          [feeKey]: nestedFeeKey
            ? {
                ...(currentFormData.fees[feeKey] || {}),
                [nestedFeeKey]: value,
              }
            : feeKey === "currency"
              ? value
              : (value === "" ? "" : Number(value)),
        },
      }));
      return;
    }

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: name === "academicYear" ? normalizeAcademicYear(value) || value : value,
    }));
  };

  const handleCopyFromPreviousYear = async () => {
    if (!formData.classId || !formData.academicYear) {
      const nextErrors = {};
      if (!formData.classId) nextErrors.classId = "Select a master class first";
      if (!formData.academicYear) nextErrors.academicYear = "Select an academic year first";
      setFieldErrors((currentErrors) => ({ ...currentErrors, ...nextErrors }));
      return;
    }

    try {
      setCopyLoading(true);
      const response = await axios.get("/class-sessions/copy-template", {
        headers: { token },
        params: {
          classId: formData.classId,
          academicYear: formData.academicYear,
          section: formData.section || undefined,
        },
      });

      const template = response.data.template;
      setFormData((currentFormData) => ({
        ...currentFormData,
        classTeacher: template?.classTeacher?._id || template?.classTeacher || currentFormData.classTeacher,
        capacity: template?.capacity ?? currentFormData.capacity,
        fees: {
          tuition: Number(template?.fees?.tuition ?? currentFormData.fees.tuition),
          admission: Number(template?.fees?.admission ?? currentFormData.fees.admission),
          exam: Number(template?.fees?.exam ?? currentFormData.fees.exam),
          currency: template?.fees?.currency || currentFormData.fees.currency,
        },
      }));

      notify.success(`Copied settings from ${formatSessionLabel(template)}`);
    } catch (error) {
      notify.error(getApiErrorMessage(error, "No previous-year class session was found to copy"));
    } finally {
      setCopyLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const { errors, payload } = validateClassForm(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});

    if (formMode === "edit" && !editingClassId) {
      setFormError("Unable to update class session. Please reopen the edit form.");
      return;
    }

    try {
      setFormSubmitting(true);

      if (formMode === "edit") {
        const response = await axios.put(`/class-sessions/${editingClassId}`, payload, {
          headers: { token },
        });

        if (response.status === 200) {
          notify.success("Class session updated successfully!");
          closeModal();
          await fetchClasses();
        }
      } else {
        const response = await axios.post("/class-sessions", payload, {
          headers: { token },
        });

        if (response.status === 201) {
          notify.success("Class session created successfully!");
          closeModal();
          await fetchClasses();
        }
      }
    } catch (error) {
      const fallbackMessage =
        formMode === "edit" ? "Error updating class session" : "Error creating class session";
      const apiMessage = getApiErrorMessage(error, fallbackMessage);
      const lowerMessage = apiMessage.toLowerCase();

      const fieldMappings = [
        { keyword: "master class", field: "classId" },
        { keyword: "class teacher", field: "classTeacher" },
        { keyword: "teacher", field: "classTeacher" },
        { keyword: "academic year", field: "academicYear" },
        { keyword: "section", field: "section" },
        { keyword: "capacity", field: "capacity" },
        { keyword: "tuition", field: "fees.tuition" },
        { keyword: "admission", field: "fees.admission" },
        { keyword: "exam", field: "fees.exam" },
        { keyword: "status", field: "status" },
      ];

      const mappedField = fieldMappings.find(({ keyword }) => lowerMessage.includes(keyword))?.field;
      if (mappedField) {
        setFieldErrors({ [mappedField]: apiMessage });
        setFormError("");
      } else {
        setFormError(apiMessage);
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteClassSession = async (classSessionId) => {
    const shouldDelete = await confirm({
      title: "Delete class session",
      message: "Are you sure you want to delete this class session?",
      confirmText: "Delete",
      cancelText: "Cancel",
      tone: "danger",
    });

    if (!shouldDelete) {
      return;
    }

    try {
      const response = await axios.delete(`/class-sessions/${classSessionId}`, {
        headers: { token },
      });

      if (response.status === 200) {
        notify.success("Class session deleted successfully");
        await fetchClasses();
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, "Failed to delete class session"));
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormMode("create");
    setEditingClassId("");
    setFormData(initialClassFormData);
    setFormError("");
    setFieldErrors({});
  };

  const renderRow = (item) => (
    <tr
      key={item._id}
      className="border-b border-gray-200 even:bg-slate-50 text-xs sm:text-sm hover:bg-lamaPurpleLight"
    >
      <td className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4">{getSessionName(item)}</td>
      <td className="hidden md:table-cell p-3 sm:p-4">{item.section || "N/A"}</td>
      <td className="hidden md:table-cell p-3 sm:p-4">{item.academicYear}</td>
      <td className="hidden lg:table-cell p-3 sm:p-4">{item.classTeacher?.name || "Unassigned"}</td>
      <td className="hidden lg:table-cell p-3 sm:p-4">{item.capacity}</td>
      <td className="hidden lg:table-cell p-3 sm:p-4">
        <span
          className={`px-2 sm:px-3 py-1 rounded-full text-white text-xs font-semibold ${
            item.status === "ACTIVE" ? "bg-green-500" : "bg-slate-500"
          }`}
        >
          {item.status}
        </span>
      </td>
      <td className="p-3 sm:p-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <Link to={`/admin/class/${item._id}`}>
            <button className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white cursor-pointer hover:bg-green-200 transition">
              <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-black-700" />
            </button>
          </Link>

          <button
            onClick={() => openEditModal(item)}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white cursor-pointer hover:bg-green-200 transition"
            title="Edit"
          >
            <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-black-700" />
          </button>

          <button
            onClick={() => handleDeleteClassSession(item._id)}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white cursor-pointer hover:bg-green-200 transition"
          >
            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-black-700" />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white rounded-md flex-1 m-2 sm:m-3 md:m-4 mt-0">
      {classesLoading ? (
        <ListHeaderShimmer />
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 md:p-6">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900">All Class Sessions</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Manage year-wise batches without duplicating master classes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPermission("promotions.view") ? (
              <button
                onClick={() => navigate("/admin/promotions")}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 sm:text-sm"
                title="Promote students"
              >
                <GraduationCap className="h-4 w-4" />
                <span className="hidden sm:inline">Promote Students</span>
              </button>
            ) : null}
            <button
              onClick={openCreateModal}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-[#CFCEFF] hover:bg-purple-300 transition"
              title="Create"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-100" />
            </button>
          </div>
        </div>
      )}

      {classesLoading ? (
        <MobileCardShimmer cards={4} />
      ) : (
        <div className="md:hidden p-3 sm:p-4 space-y-3">
          {classes.length > 0 ? (
            classes.map((classSession) => (
              <div
                key={classSession._id}
                className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{getSessionName(classSession)}</h3>
                    <p className="text-xs text-gray-600">{classSession.academicYear}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-white text-xs font-semibold shrink-0 ${
                      classSession.status === "ACTIVE" ? "bg-green-500" : "bg-slate-500"
                    }`}
                  >
                    {classSession.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <p className="text-gray-600">Section</p>
                    <p className="font-medium text-gray-900">{classSession.section || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Capacity</p>
                    <p className="font-medium text-gray-900">{classSession.capacity}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-xs mb-3">
                  <div>
                    <p className="text-gray-600">Teacher</p>
                    <p className="font-medium text-gray-900">{classSession.classTeacher?.name || "Unassigned"}</p>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Link to={`/admin/class/${classSession._id}`} className="flex-1">
                    <button className="w-full bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium py-2 rounded transition">
                      View
                    </button>
                  </Link>
                  <button
                    onClick={() => openEditModal(classSession)}
                    className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium py-2 rounded transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClassSession(classSession._id)}
                    className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium py-2 rounded transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 py-8">No class sessions found</p>
          )}
        </div>
      )}

      {classesLoading ? (
        <TableRowShimmer rows={5} columns={7} />
      ) : (
        <div className="hidden md:block mt-4 overflow-x-auto">
          <Table columns={columns} renderRow={renderRow} data={classes} />
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {formMode === "edit" ? "Edit Class Session" : "Create Class Session"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition shrink-0"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="p-4 sm:p-6 space-y-6">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {masterClasses.length === 0 && !masterClassesLoading && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  No master classes exist yet. Create them with the `POST /classes` API or run the migration script
                  before adding class sessions.
                </div>
              )}

              <div>
                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                  Session Information
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Class Name *</label>
                    <select
                      name="classId"
                      value={formData.classId}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("classId")}`}
                      aria-invalid={Boolean(fieldErrors.classId)}
                      required
                    >
                      <option value="">Select a master class</option>
                      {masterClasses.map((masterClass) => (
                        <option key={masterClass._id} value={masterClass._id}>
                          {masterClass.name} (Order {masterClass.order})
                        </option>
                      ))}
                    </select>
                    {renderFieldError("classId")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Section</label>
                    <input
                      type="text"
                      name="section"
                      value={formData.section}
                      onChange={handleChange}
                      maxLength={10}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("section")}`}
                      aria-invalid={Boolean(fieldErrors.section)}
                      placeholder="e.g., A, B, C"
                    />
                    {renderFieldError("section")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Academic Year *</label>
                    <select
                      name="academicYear"
                      value={formData.academicYear}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("academicYear")}`}
                      aria-invalid={Boolean(fieldErrors.academicYear)}
                      required
                    >
                      <option value="">Select academic year</option>
                      {academicYearOptions.map((yearOption) => (
                        <option key={yearOption} value={yearOption}>
                          {yearOption}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("academicYear")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Capacity</label>
                    <input
                      type="number"
                      name="capacity"
                      value={formData.capacity}
                      onChange={handleChange}
                      min="1"
                      max="100"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("capacity")}`}
                      aria-invalid={Boolean(fieldErrors.capacity)}
                    />
                    {renderFieldError("capacity")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                      Class Teacher *
                    </label>
                    <select
                      name="classTeacher"
                      value={formData.classTeacher}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("classTeacher")}`}
                      aria-invalid={Boolean(fieldErrors.classTeacher)}
                      required
                    >
                      <option value="">Select a teacher</option>
                      {teachers?.map((teacher) => (
                        <option key={teacher._id} value={teacher._id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("classTeacher")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("status")}`}
                      aria-invalid={Boolean(fieldErrors.status)}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                    {renderFieldError("status")}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Copy From Previous Year</p>
                  <p className="text-xs text-blue-700">
                    Prefill fees, teacher, and capacity from the same class session in the previous academic year.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyFromPreviousYear}
                  disabled={copyLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
                >
                  <Copy className="w-4 h-4" />
                  {copyLoading ? "Copying..." : "Copy Previous Year"}
                </button>
              </div>

              <div>
                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                  Fees Information
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Tuition Fee *</label>
                    <input
                      type="number"
                      name="fees.tuition"
                      value={formData.fees.tuition}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("fees.tuition")}`}
                      aria-invalid={Boolean(fieldErrors["fees.tuition"])}
                      min="0"
                      required
                    />
                    {renderFieldError("fees.tuition")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Admission Fee</label>
                    <input
                      type="number"
                      name="fees.admission"
                      value={formData.fees.admission}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("fees.admission")}`}
                      aria-invalid={Boolean(fieldErrors["fees.admission"])}
                      min="0"
                    />
                    {renderFieldError("fees.admission")}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Exam Fee</label>
                    <input
                      type="number"
                      name="fees.exam"
                      value={formData.fees.exam}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("fees.exam")}`}
                      aria-invalid={Boolean(fieldErrors["fees.exam"])}
                      min="0"
                    />
                    {renderFieldError("fees.exam")}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">Currency</label>
                    <select
                      name="fees.currency"
                      value={formData.fees.currency}
                      onChange={handleChange}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("fees.currency")}`}
                      aria-invalid={Boolean(fieldErrors["fees.currency"])}
                    >
                      <option value="INR">INR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                    {renderFieldError("fees.currency")}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 sm:py-3 rounded-lg transition duration-200 text-sm sm:text-base"
                >
                  {formSubmitting
                    ? formMode === "edit"
                      ? "Saving..."
                      : "Creating..."
                    : formMode === "edit"
                      ? "Save Session"
                      : "Create Session"}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-semibold py-2 sm:py-3 rounded-lg transition duration-200 text-sm sm:text-base"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassListPage;
