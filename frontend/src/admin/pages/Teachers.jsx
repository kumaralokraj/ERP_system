import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Table from "../components/Table";
import { useAuth } from "../../context/authContext/AuthContext";
import {useAdmin} from "../../context/adminContext/AdminContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import { 
  TableRowShimmer, 
  MobileCardShimmer, 
  ListHeaderShimmer 
} from "../components/Shimmer";
import { X, Plus, Pencil, Eye, Trash2 } from "lucide-react";
import {
  getApiErrorMessage,
  validateTeacherForm,
} from "../../lib/formValidation";

const columns = [
  { header: "Info", accessor: "info" },
  {
    header: "Employee ID",
    accessor: "employeeId",
    className: "hidden md:table-cell",
  },
  {
    header: "Phone",
    accessor: "phone",
    className: "hidden lg:table-cell",
  },
  {
    header: "Address",
    accessor: "address",
    className: "hidden lg:table-cell",
  },
  { header: "Actions", accessor: "action" },
];

const initialTeacherFormData = {
  name: "",
  email: "",
  password: "",
  phone: "",
  gender: "Male",
  dob: "",
  address: "",
  employeeId: "",
  qualification: "",
  experienceYears: "",
  joiningDate: "",
};

const formatDateForInput = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toISOString().slice(0, 10);
};

const mapTeacherToFormData = (teacher = {}) => ({
  name: teacher.name || "",
  email: teacher.email || "",
  password: "",
  phone: teacher.phone || "",
  gender: teacher.gender || "Male",
  dob: formatDateForInput(teacher.dob),
  address: teacher.address || "",
  employeeId: teacher.employeeId || "",
  qualification: teacher.qualification || "",
  experienceYears:
    teacher.experienceYears === undefined || teacher.experienceYears === null
      ? ""
      : teacher.experienceYears,
  joiningDate: formatDateForInput(teacher.joiningDate),
});

const TEACHER_FIELD_ORDER = [
  "name",
  "email",
  "password",
  "phone",
  "gender",
  "dob",
  "address",
  "employeeId",
  "qualification",
  "experienceYears",
  "joiningDate",
];

const TEACHER_FIELD_LABELS = {
  name: "Name",
  email: "Email",
  password: "Password",
  phone: "Phone",
  gender: "Gender",
  dob: "Date of birth",
  address: "Address",
  employeeId: "Employee ID",
  qualification: "Qualification",
  experienceYears: "Experience",
  joiningDate: "Joining date",
};

const TeacherListPage = () => {
  const { notify, confirm } = useNotifier();
  const location = useLocation();
  const navigate = useNavigate();
  const {teachers , teachersLoading , fetchTeachers} = useAdmin();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingTeacherId, setEditingTeacherId] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const { token, axios } = useAuth();
  const [formData, setFormData] = useState(initialTeacherFormData);
  const formRef = useRef(null);

  const openCreateModal = () => {
    setFormMode("create");
    setEditingTeacherId("");
    setFormData(initialTeacherFormData);
    setFormError("");
    setFieldErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = useCallback((teacher) => {
    if (!teacher?._id) {
      notify.error("Unable to open edit form for this teacher");
      return;
    }

    setFormMode("edit");
    setEditingTeacherId(teacher._id);
    setFormData(mapTeacherToFormData(teacher));
    setFormError("");
    setFieldErrors({});
    setIsModalOpen(true);
  }, [notify]);

  useEffect(() => {
    const teacherIdFromState = location.state?.openEditTeacherId;
    if (!teacherIdFromState || teachersLoading) {
      return;
    }

    const teacherToEdit = teachers.find((item) => item._id === teacherIdFromState);
    if (!teacherToEdit) {
      notify.error("Teacher not found for editing");
      navigate("/admin/teachers", { replace: true, state: null });
      return;
    }

    openEditModal(teacherToEdit);
    navigate("/admin/teachers", { replace: true, state: null });
  }, [teachers, teachersLoading, location.state, navigate, notify, openEditModal]);

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

  const getFieldClassName = (fieldName) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
      fieldErrors[fieldName]
        ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500"
        : "border-gray-300 focus:ring-blue-500"
    }`;

  const renderFieldError = (fieldName) =>
    fieldErrors[fieldName] ? (
      <p className="mt-1 text-xs text-red-600">{fieldErrors[fieldName]}</p>
    ) : null;

  const focusFieldByName = useCallback((fieldName) => {
    if (!fieldName || !formRef.current) {
      return;
    }

    const selector = `input[name="${fieldName}"], select[name="${fieldName}"], textarea[name="${fieldName}"]`;
    const fieldElement = formRef.current.querySelector(selector);
    if (!fieldElement) {
      return;
    }

    fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
    fieldElement.focus({ preventScroll: true });
  }, []);

  const showValidationFeedback = useCallback((errors, tone = "warning") => {
    const errorFields = Object.keys(errors || {});
    if (errorFields.length === 0) {
      return;
    }

    const firstField = TEACHER_FIELD_ORDER.find((fieldName) => errors[fieldName]) || errorFields[0];
    const firstMessage = errors[firstField] || errors[errorFields[0]];
    const firstLabel = TEACHER_FIELD_LABELS[firstField] || "Form";
    const summaryMessage =
      errorFields.length === 1
        ? `${firstLabel}: ${firstMessage}`
        : `Please fix ${errorFields.length} fields. First: ${firstLabel} - ${firstMessage}`;

    if (tone === "error") {
      notify.error(summaryMessage, 5000);
    } else {
      notify.warning(summaryMessage, 5000);
    }

    requestAnimationFrame(() => {
      focusFieldByName(firstField);
    });
  }, [focusFieldByName, notify]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormError("");
    clearFieldError(name);
    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const { errors, payload } = validateTeacherForm(formData, {
      requirePassword: formMode !== "edit",
    });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showValidationFeedback(errors, "warning");
      return;
    }

    setFieldErrors({});

    if (formMode === "edit" && !editingTeacherId) {
      const missingEditIdMessage = "Unable to update teacher. Please reopen the edit form.";
      setFormError(missingEditIdMessage);
      notify.error(missingEditIdMessage);
      return;
    }

    try {
      setFormSubmitting(true);
      if (formMode === "edit") {
        const response = await axios.put(`/admin/teacher/${editingTeacherId}`, payload, {
          headers: { token },
        });

        if (response.status === 200) {
          notify.success("Teacher updated successfully!");
          closeModal();
          await fetchTeachers();
        }
      } else {
        const response = await axios.post("/admin/teacher/create", payload, { headers: { token } });

        if (response.status === 201) {
          notify.success("Teacher created successfully!");
          closeModal();
          await fetchTeachers();
        }
      }
    } catch (error) {
      const fallbackMessage = formMode === "edit" ? "Error updating teacher" : "Error creating teacher";
      console.error(fallbackMessage, error);
      const apiMessage = getApiErrorMessage(error, fallbackMessage);
      const lowerMessage = apiMessage.toLowerCase();

      const fieldMappings = [
        { keyword: "employee id", field: "employeeId" },
        { keyword: "email", field: "email" },
        { keyword: "password", field: "password" },
        { keyword: "phone", field: "phone" },
        { keyword: "gender", field: "gender" },
        { keyword: "date of birth", field: "dob" },
        { keyword: "joining date", field: "joiningDate" },
        { keyword: "experience", field: "experienceYears" },
      ];

      const mappedField = fieldMappings.find(({ keyword }) =>
        lowerMessage.includes(keyword)
      )?.field;

      if (mappedField) {
        const mappedErrors = { [mappedField]: apiMessage };
        setFieldErrors(mappedErrors);
        setFormError("");
        showValidationFeedback(mappedErrors, "error");
      } else {
        setFormError(apiMessage);
        notify.error(apiMessage);
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteTeacher = async (teacherId) => {
    const shouldDelete = await confirm({
      title: 'Delete teacher',
      message: 'Are you sure you want to delete this teacher?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });

    if (!shouldDelete) {
      return;
    }

    try {
      const response = await axios.delete(`/admin/teacher/${teacherId}`, { headers: { token } });
      if (response.status === 200) {
        notify.success("Teacher deleted successfully");
        await fetchTeachers();
      }
    } catch (error) {
      console.error("Error deleting teacher:", error);
      const errorMessage = error.response?.data?.message || "Failed to delete teacher";
      notify.error(errorMessage);
    }
  };

  const renderRow = (item) => (
    <tr
      key={item._id}
      className="border-b border-gray-200 even:bg-slate-50 text-xs sm:text-sm hover:bg-lamaPurpleLight"
    >
      <td className="flex items-center gap-2 sm:gap-4 p-2 sm:p-3 md:p-4">
        <div className="flex flex-col flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
          <p className="text-xs text-gray-500 truncate">{item.email}</p>
        </div>
      </td>

      <td className="hidden md:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{item.employeeId}</td>
      <td className="hidden lg:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{item.phone}</td>
      <td className="hidden lg:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{item.address}</td>

      <td className="p-2 sm:p-3 md:p-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <Link to={`/admin/teacher/${item._id}`}>
            <button className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white hover:bg-green-200 cursor-pointer transition">
              <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-black-700" />
            </button>
          </Link>

          <button
            onClick={() => openEditModal(item)}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white hover:bg-green-200 cursor-pointer transition"
          >
            <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-black-700" />
          </button>

          <button
            onClick={() => handleDeleteTeacher(item._id)}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white hover:bg-green-200 cursor-pointer transition"
          >
            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-black-700" />
          </button>
        </div>
      </td>
    </tr>
  );

  const closeModal = () => {
    setIsModalOpen(false);
    setFormMode("create");
    setEditingTeacherId("");
    setFormData(initialTeacherFormData);
    setFormError("");
    setFieldErrors({});
  };

  return (
    <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4">
      {/* TOP */}
      {teachersLoading ? (
        <ListHeaderShimmer />
      ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 md:p-6">
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900">All Teachers</h1>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateModal}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-[#CFCEFF] hover:bg-purple-300 transition"
            >
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-100" />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      {teachersLoading ? (
        <MobileCardShimmer cards={4} />
      ) : (
        <div className="md:hidden p-2 sm:p-3 space-y-3">
          {teachers.length > 0 ? (
            teachers.map((teacher) => (
              <div key={teacher._id} className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition">
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{teacher.name}</h3>
                    <p className="text-xs text-gray-600 break-all">{teacher.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div>
                    <p className="text-gray-600">Employee ID</p>
                    <p className="font-medium text-gray-900">{teacher.employeeId || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Phone</p>
                    <p className="font-medium text-gray-900">{teacher.phone || "N/A"}</p>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Link to={`/admin/teacher/${teacher._id}`} className="flex-1">
                    <button className="w-full bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium py-2 rounded transition">
                      View
                    </button>
                  </Link>
                  <button
                    onClick={() => openEditModal(teacher)}
                    className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium py-2 rounded transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTeacher(teacher._id)}
                    className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-xs font-medium py-2 rounded transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 py-8 text-sm">No teachers found</p>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      {teachersLoading ? (
        <TableRowShimmer rows={5} columns={5} />
      ) : (
        <div className="hidden md:block">
          <Table columns={columns} renderRow={renderRow} data={teachers} />
        </div>
      )}

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-lg sm:text-2xl font-bold text-gray-900">
                {formMode === "edit" ? "Edit teacher" : "Create a new teacher"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition shrink-0"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-4 sm:p-6 space-y-6">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Authentication Information */}
              <div>
                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                  Authentication Information
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      maxLength={80}
                      className={getFieldClassName("name")}
                      aria-invalid={Boolean(fieldErrors.name)}
                      required
                    />
                    {renderFieldError("name")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="email"
                      className={getFieldClassName("email")}
                      aria-invalid={Boolean(fieldErrors.email)}
                      required
                    />
                    {renderFieldError("email")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      {formMode === "edit" ? "Password (optional)" : "Password *"}
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      minLength={6}
                      autoComplete="new-password"
                      className={getFieldClassName("password")}
                      aria-invalid={Boolean(fieldErrors.password)}
                      required={formMode !== "edit"}
                      placeholder={formMode === "edit" ? "Leave blank to keep current password" : ""}
                    />
                    {renderFieldError("password")}
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                  Personal Information
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={(e) => {
                        const onlyNums = e.target.value.replace(/\D/g, "");
                        if (onlyNums.length <= 15) {
                          handleChange({
                            target: { name: "phone", value: onlyNums }
                          });
                        }
                      }}
                      inputMode="numeric"
                      maxLength={15}
                      className={getFieldClassName("phone")}
                      aria-invalid={Boolean(fieldErrors.phone)}
                    />
                    {renderFieldError("phone")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Gender
                    </label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className={getFieldClassName("gender")}
                      aria-invalid={Boolean(fieldErrors.gender)}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                    {renderFieldError("gender")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      name="dob"
                      value={formData.dob}
                      onChange={handleChange}
                      max={new Date().toISOString().split("T")[0]}
                      className={getFieldClassName("dob")}
                      aria-invalid={Boolean(fieldErrors.dob)}
                    />
                    {renderFieldError("dob")}
                  </div>
                </div>

                <div>
                  <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className={getFieldClassName("address")}
                    aria-invalid={Boolean(fieldErrors.address)}
                  />
                  {renderFieldError("address")}
                </div>
              </div>

              {/* Teacher-Specific Information */}
              <div>
                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                  Teacher Information
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Employee ID
                    </label>
                    <input
                      type="text"
                      name="employeeId"
                      value={formData.employeeId}
                      onChange={handleChange}
                      maxLength={30}
                      className={getFieldClassName("employeeId")}
                      aria-invalid={Boolean(fieldErrors.employeeId)}
                    />
                    {renderFieldError("employeeId")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Qualification
                    </label>
                    <input
                      type="text"
                      name="qualification"
                      value={formData.qualification}
                      onChange={handleChange}
                      className={getFieldClassName("qualification")}
                      aria-invalid={Boolean(fieldErrors.qualification)}
                      placeholder="e.g., B.A., M.Sc."
                    />
                    {renderFieldError("qualification")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Experience (Years)
                    </label>
                    <input
                      type="number"
                      name="experienceYears"
                      value={formData.experienceYears}
                      onChange={handleChange}
                      className={getFieldClassName("experienceYears")}
                      aria-invalid={Boolean(fieldErrors.experienceYears)}
                      min="0"
                      step="1"
                    />
                    {renderFieldError("experienceYears")}
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                      Joining Date
                    </label>
                    <input
                      type="date"
                      name="joiningDate"
                      value={formData.joiningDate}
                      onChange={handleChange}
                      max={new Date().toISOString().split("T")[0]}
                      className={getFieldClassName("joiningDate")}
                      aria-invalid={Boolean(fieldErrors.joiningDate)}
                    />
                    {renderFieldError("joiningDate")}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 sm:py-3 rounded-lg transition duration-200 text-sm sm:text-base"
                >
                  {formSubmitting ? (formMode === "edit" ? "Saving..." : "Creating...") : (formMode === "edit" ? "Save Changes" : "Create Teacher")}
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

export default TeacherListPage;
