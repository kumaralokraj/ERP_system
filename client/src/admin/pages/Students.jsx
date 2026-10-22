import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Table from "../components/Table";
import Pagination from "../components/Pagination";
import { useAuth } from "../../context/authContext/AuthContext";
import { X, Filter, Plus, Pencil, Eye, Trash2, Upload } from "lucide-react";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import { TableRowShimmer, MobileCardShimmer } from '../components/Shimmer';
import { useAdmin } from "../../context/adminContext/AdminContext";
import StudentBulkUploadModal from "../components/StudentBulkUploadModal";
import {
    buildStudentFormData,
    getApiErrorMessage,
    validateStudentForm,
} from "../../lib/formValidation";

const columns = [
    {
        header: "Info",
        accessor: "info",
    },
    {
        header: "Student ID",
        accessor: "studentId",
        className: "hidden md:table-cell",
    },
    {
        header: "Grade",
        accessor: "grade",
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
    {
        header: "Actions",
        accessor: "action",
    },
];

const initialStudentFormData = {
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    bloodType: "",
    birthday: "",
    sex: "Male",
    photo: null,
    studentId: "",
    class: "",
    section: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
    transportOpted: "true",
    transportFee: "",
    admissionFeeOverride: "",
    tuitionConcessionType: "none",
    tuitionConcessionValue: "",
    tuitionConcessionReason: "",
    tuitionConcessionActive: "false",
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

const mapStudentToFormData = (student = {}) => ({
    username: student.username || "",
    email: student.email || "",
    password: "",
    firstName: student.firstName || "",
    lastName: student.lastName || "",
    phone: student.phone || "",
    address: student.address || "",
    bloodType: student.bloodType || "",
    birthday: formatDateForInput(student.birthday),
    sex: student.sex || "Male",
    photo: null,
    studentId: student.studentId || "",
    class: student.class?._id || student.class || "",
    section: student.section || "",
    parentName: student.parentName || "",
    parentPhone: student.parentPhone || "",
    parentEmail: student.parentEmail || "",
    transportOpted: student.feeSettings?.transportOpted === false ? "false" : "true",
    transportFee: student.feeSettings?.transportOpted === false
        ? "0"
        : student.feeSettings?.transportFee === null ||
        student.feeSettings?.transportFee === undefined
            ? ""
            : String(student.feeSettings.transportFee),
    admissionFeeOverride:
        student.feeSettings?.admissionFeeOverride === null ||
        student.feeSettings?.admissionFeeOverride === undefined
            ? ""
            : String(student.feeSettings.admissionFeeOverride),
    tuitionConcessionType: student.feeSettings?.tuitionConcession?.type || "none",
    tuitionConcessionValue: student.feeSettings?.tuitionConcession?.value
        ? String(student.feeSettings.tuitionConcession.value)
        : "",
    tuitionConcessionReason: student.feeSettings?.tuitionConcession?.reason || "",
    tuitionConcessionActive: student.feeSettings?.tuitionConcession?.isActive ? "true" : "false",
});

const formatClassSessionLabel = (classSession) => {
    if (!classSession) {
        return "N/A";
    }

    const className = classSession.name || classSession.classId?.name || "";
    const section = classSession.section ? `-${classSession.section}` : "";
    const academicYear = classSession.academicYear ? ` (${classSession.academicYear})` : "";
    return `${className}${section}${academicYear}`.trim();
};

const getStudentClassSessionId = (student = {}) => {
    const classRecord = student.classSession || student.class || {};
    return String(classRecord?._id || classRecord || "");
};

const STUDENT_FIELD_ORDER = [
    "username",
    "email",
    "password",
    "firstName",
    "lastName",
    "phone",
    "address",
    "bloodType",
    "birthday",
    "sex",
    "photo",
    "studentId",
    "class",
    "section",
    "transportOpted",
    "transportFee",
    "admissionFeeOverride",
    "tuitionConcessionType",
    "tuitionConcessionValue",
    "tuitionConcessionReason",
    "tuitionConcessionActive",
    "parentName",
    "parentPhone",
    "parentEmail",
];

const STUDENT_FIELD_LABELS = {
    username: "Username",
    email: "Email",
    password: "Password",
    firstName: "First name",
    lastName: "Last name",
    phone: "Phone",
    address: "Address",
    bloodType: "Blood type",
    birthday: "Birthday",
    sex: "Sex",
    photo: "Photo",
    studentId: "Student ID",
    class: "Class",
    section: "Section",
    transportOpted: "Transport decision",
    transportFee: "Transport fee",
    admissionFeeOverride: "Admission fee",
    tuitionConcessionType: "Tuition concession type",
    tuitionConcessionValue: "Tuition concession value",
    tuitionConcessionReason: "Tuition concession reason",
    tuitionConcessionActive: "Tuition concession status",
    parentName: "Parent name",
    parentPhone: "Parent phone",
    parentEmail: "Parent email",
};

const STUDENTS_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_STUDENTS_PAGE_SIZE = 20;

const StudentListPage = () => {
    const { notify, confirm } = useNotifier();
    const location = useLocation();
    const navigate = useNavigate();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formMode, setFormMode] = useState("create");
    const [editingStudentId, setEditingStudentId] = useState("");
    const [returnToProfileId, setReturnToProfileId] = useState("");
    const [existingPhotoUrl, setExistingPhotoUrl] = useState("");
    const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedClassFilter, setSelectedClassFilter] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_STUDENTS_PAGE_SIZE);
    const { students, studentsLoading, classes, fetchStudents, getFeesData } = useAdmin();
    const { token, axios } = useAuth();
    const [formError, setFormError] = useState("");
    const [fieldErrors, setFieldErrors] = useState({});
    const [formSubmitting, setFormSubmitting] = useState(false);
    const formRef = useRef(null);

    const [formData, setFormData] = useState(initialStudentFormData);

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

        const firstField = STUDENT_FIELD_ORDER.find((fieldName) => errors[fieldName]) || errorFields[0];
        const firstMessage = errors[firstField] || errors[errorFields[0]];
        const firstLabel = STUDENT_FIELD_LABELS[firstField] || "Form";
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

    const openCreateModal = () => {
        setFormMode("create");
        setEditingStudentId("");
        setReturnToProfileId("");
        setExistingPhotoUrl("");
        setFormData(initialStudentFormData);
        setFormError("");
        setFieldErrors({});
        setIsModalOpen(true);
    };

    const openEditModal = useCallback((student, options = {}) => {
        if (!student?._id) {
            notify.error("Unable to open edit form for this student");
            return;
        }

        setFormMode("edit");
        setEditingStudentId(student._id);
        setReturnToProfileId(options.returnToProfileId || "");
        setExistingPhotoUrl(student.photo || "");
        setFormData(mapStudentToFormData(student));
        setFormError("");
        setFieldErrors({});
        setIsModalOpen(true);
    }, [notify]);

    useEffect(() => {
        const studentIdFromState = location.state?.openEditStudentId;
        const profileReturnId = location.state?.returnToProfileId || "";
        if (!studentIdFromState || studentsLoading) {
            return;
        }

        const studentToEdit = students.find((item) => item._id === studentIdFromState);
        if (!studentToEdit) {
            notify.error("Student not found for editing");
            navigate("/admin/students", { replace: true, state: null });
            return;
        }

        openEditModal(studentToEdit, { returnToProfileId: profileReturnId });
        navigate("/admin/students", { replace: true, state: null });
    }, [students, studentsLoading, location.state, navigate, notify, openEditModal]);

    const handleChange = (e) => {
        const { name, value, type: inputType, files } = e.target;
        setFormError("");
        clearFieldError(name);

        if (name === "transportOpted") {
            setFormData((currentFormData) => ({
                ...currentFormData,
                transportOpted: value,
                transportFee: value === "false" ? "0" : currentFormData.transportFee,
            }));
            return;
        }

        if (name === "tuitionConcessionType") {
            setFormData((currentFormData) => ({
                ...currentFormData,
                tuitionConcessionType: value,
                tuitionConcessionValue: value === "none" ? "" : currentFormData.tuitionConcessionValue,
                tuitionConcessionActive: value === "none" ? "false" : "true",
            }));
            return;
        }

        setFormData((currentFormData) => ({
            ...currentFormData,
            [name]: inputType === "file" ? files?.[0] || null : value,
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError("");

        const { errors, payload } = validateStudentForm(formData, {
            requirePassword: formMode !== "edit",
        });
        if (
            payload.tuitionConcessionType === "fixed" &&
            selectedClassMonthlyTuitionFee > 0 &&
            payload.tuitionConcessionValue > selectedClassMonthlyTuitionFee
        ) {
            errors.tuitionConcessionValue =
                `Fixed concession cannot exceed monthly tuition of Rs. ${selectedClassMonthlyTuitionFee}`;
        }
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            showValidationFeedback(errors, "warning");
            return;
        }

        setFieldErrors({});

        if (formMode === "edit" && !editingStudentId) {
            const missingEditIdMessage = "Unable to update student. Please reopen the edit form.";
            setFormError(missingEditIdMessage);
            notify.error(missingEditIdMessage);
            return;
        }

        try {
            setFormSubmitting(true);
            const formDataToSend = buildStudentFormData(payload);

            if (formMode === "edit") {
                const response = await axios.put(`/admin/student/${editingStudentId}`, formDataToSend, {
                    headers: { token },
                });

                if (response.status === 200) {
                    const profileTargetId = returnToProfileId;
                    closeModal();
                    await fetchStudents();
                    await getFeesData();

                    if (profileTargetId) {
                        navigate(`/admin/student/${profileTargetId}`, {
                            state: {
                                showEditSuccess: true,
                                editSuccessMessage: response.data.familyCode
                                    ? `Student updated successfully! Family code: ${response.data.familyCode}`
                                    : "Student updated successfully!",
                            },
                        });
                    } else {
                        notify.success(
                            response.data.familyCode
                                ? `Student updated successfully! Family code: ${response.data.familyCode}`
                                : "Student updated successfully!"
                        );
                    }
                }
            } else {
                const response = await axios.post("/admin/student/create", formDataToSend, {
                    headers: { token },
                });

                if (response.status === 201) {
                    notify.success(
                        response.data.familyCode
                            ? `Student created successfully! Family code: ${response.data.familyCode}`
                            : "Student created successfully!"
                    );
                    closeModal();
                    await fetchStudents();
                    await getFeesData();
                }
            }
        } catch (error) {
            const fallbackMessage = formMode === "edit" ? "Error updating student" : "Error creating student";
            console.error(fallbackMessage, error);
            const apiMessage = getApiErrorMessage(error, fallbackMessage);
            const lowerMessage = apiMessage.toLowerCase();

            const fieldMappings = [
                { keyword: "username", field: "username" },
                { keyword: "email", field: "email" },
                { keyword: "password", field: "password" },
                { keyword: "first name", field: "firstName" },
                { keyword: "last name", field: "lastName" },
                { keyword: "student id", field: "studentId" },
                { keyword: "class", field: "class" },
                { keyword: "section", field: "section" },
                { keyword: "transport fee", field: "transportFee" },
                { keyword: "transport", field: "transportOpted" },
                { keyword: "admission fee", field: "admissionFeeOverride" },
                { keyword: "tuition concession", field: "tuitionConcessionValue" },
                { keyword: "percentage", field: "tuitionConcessionValue" },
                { keyword: "phone", field: "phone" },
                { keyword: "parent phone", field: "parentPhone" },
                { keyword: "parent email", field: "parentEmail" },
                { keyword: "blood type", field: "bloodType" },
                { keyword: "birthday", field: "birthday" },
                { keyword: "sex", field: "sex" },
                { keyword: "photo", field: "photo" },
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


    const handleDeleteStudent = async (studentId) => {
        const shouldDelete = await confirm({
            title: 'Delete student',
            message: 'Are you sure you want to delete this student?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            tone: 'danger',
        });

        if (!shouldDelete) {
            return;
        }

        try {
            const response = await axios.delete(`/admin/student/${studentId}`, { headers: { token } });
            if (response.status === 200) {
                notify.success("Student deleted successfully");
                fetchStudents();
            }
        } catch (error) {
            console.error("Error deleting student:", error);
            const errorMessage = error.response?.data?.message || "Failed to delete student";
            notify.error(errorMessage);
        }
    };

    // Filter students based on search term and class session
    const filteredStudents = useMemo(() => students.filter((student) => {
        const searchLower = searchTerm.trim().toLowerCase();
        const matchesSearch =
            !searchLower ||
            student.username?.toLowerCase().includes(searchLower) ||
            student.studentId?.toLowerCase().includes(searchLower) ||
            formatClassSessionLabel(student.class).toLowerCase().includes(searchLower);

        const matchesClass =
            !selectedClassFilter || getStudentClassSessionId(student) === selectedClassFilter;

        return matchesSearch && matchesClass;
    }), [students, searchTerm, selectedClassFilter]);

    const hasActiveFilters = Boolean(searchTerm.trim() || selectedClassFilter);

    const clearFilters = () => {
        setSearchTerm("");
        setSelectedClassFilter("");
    };

    const emptyStudentsMessage = hasActiveFilters
        ? "No students found matching your filters"
        : "No students found";

    const sortedClassOptions = [...(classes || [])].sort((left, right) =>
        formatClassSessionLabel(left).localeCompare(
            formatClassSessionLabel(right),
            undefined,
            { numeric: true, sensitivity: "base" }
        )
    );
    const selectedClassSession = sortedClassOptions.find((classSession) => classSession._id === formData.class);
    const selectedClassAdmissionFee = Number(selectedClassSession?.fees?.admission || 0);
    const selectedClassMonthlyTuitionFee = Math.floor(
        (Number(selectedClassSession?.fees?.tuition || 0) / 12) * 100
    ) / 100;

    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const pageStartIndex = (safeCurrentPage - 1) * pageSize;
    const paginatedStudents = filteredStudents.slice(pageStartIndex, pageStartIndex + pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedClassFilter, pageSize]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const closeModal = () => {
        setIsModalOpen(false);
        setFormMode("create");
        setEditingStudentId("");
        setReturnToProfileId("");
        setExistingPhotoUrl("");
        setFormData(initialStudentFormData);
        setFormError("");
        setFieldErrors({});
    };

    const renderRow = (item) => (
        <tr
            key={item._id}
            className="border-b border-gray-200 even:bg-slate-50 text-xs sm:text-sm hover:bg-lamaPurpleLight"
        >
            <td className="flex items-center gap-2 sm:gap-4 p-2 sm:p-3 md:p-4">
                <img
                    src={item.photo ? item.photo : '/avatar.png'}
                    alt={item.username}
                    onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = '/avatar.png';
                    }}
                    className="hidden md:block xl:block w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
                />
                <div className="flex flex-col flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate text-xs sm:text-sm">{item.username}</h3>
                    <p className="text-xs text-gray-500 truncate">{formatClassSessionLabel(item.class)}</p>
                </div>
            </td>

            <td className="hidden md:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{item.studentId}</td>
            <td className="hidden md:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{formatClassSessionLabel(item.class)}</td>
            <td className="hidden lg:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{item.phone}</td>
            <td className="hidden lg:table-cell p-2 sm:p-3 md:p-4 text-xs sm:text-sm">{item.address}</td>

            <td className="p-2 sm:p-3 md:p-4">
                <div className="flex items-center gap-1 sm:gap-2">
                    <Link to={`/admin/student/${item._id}`}>
                        <button className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white hover:bg-green-200 cursor-pointer transition">
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-gray-700" />
                        </button>
                    </Link>

                    <button
                        onClick={() => openEditModal(item)}
                        className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white hover:bg-green-200 cursor-pointer transition"
                    >
                        <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-gray-700" />
                    </button>

                    <button
                        onClick={() => handleDeleteStudent(item._id)}
                        className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white hover:bg-green-200 cursor-pointer transition"
                    >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-gray-700" />
                    </button>
                </div>
            </td>
        </tr>
    );
    return (
        <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 h-[calc(100%-1rem)] sm:h-[calc(100%-1.5rem)] md:h-[calc(100%-2rem)] min-h-0 flex flex-col overflow-hidden">
            {/* TOP */}
            <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 md:p-6">
                <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900">
                    All Students
                </h1>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-[#CFCEFF] hover:bg-purple-300 cursor-pointer transition"
                    >
                        <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-100" />
                    </button>

                    <button
                        onClick={() => setIsBulkUploadOpen(true)}
                        className="h-7 sm:h-8 flex items-center justify-center gap-1.5 rounded-full bg-[#CFCEFF] hover:bg-purple-300 cursor-pointer transition px-3 text-xs sm:text-sm font-semibold text-gray-100"
                    >
                        <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Upload</span>
                    </button>

                    <button onClick={openCreateModal} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-[#CFCEFF] hover:bg-purple-300 cursor-pointer transition">
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-100" />
                    </button>
                </div>
            </div>

            {/* FILTER SECTION */}
            {isFilterOpen && (
                <div className="shrink-0 px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-6 border-b border-gray-200">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <input
                            type="text"
                            placeholder="Search by username, student ID, or class..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#CFCEFF] focus:border-transparent"
                            autoFocus
                        />
                        <select
                            value={selectedClassFilter}
                            onChange={(e) => setSelectedClassFilter(e.target.value)}
                            className="w-full sm:w-56 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#CFCEFF] focus:border-transparent"
                        >
                            <option value="">All classes</option>
                            {sortedClassOptions.map((cls) => (
                                <option key={cls._id} value={String(cls._id)}>
                                    {formatClassSessionLabel(cls)}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => {
                                clearFilters();
                                setIsFilterOpen(false);
                            }}
                            className="px-3 sm:px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-900 rounded-lg text-xs sm:text-sm font-medium transition"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden border-t border-gray-100">
                {/* Mobile Card View */}
                {
                    studentsLoading ? <MobileCardShimmer cards={4} />
                        : (<div className="md:hidden p-2 sm:p-3 space-y-3">
                            {filteredStudents.length > 0 ? (
                                paginatedStudents.map((student) => (
                                    <div key={student._id} className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition">
                                        <div className="flex gap-3 mb-3">
                                            <img
                                                src={student.photo || '/avatar.png'}
                                                alt={student.username}
                                                onError={(event) => {
                                                    event.currentTarget.onerror = null;
                                                    event.currentTarget.src = '/avatar.png';
                                                }}
                                                className="w-12 h-12 rounded-lg object-cover border border-gray-300"
                                            />
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-gray-900 text-sm">{student.username}</h3>
                                                <p className="text-xs text-gray-600">{formatClassSessionLabel(student.class)}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                            <div>
                                                <p className="text-gray-600">Student ID</p>
                                                <p className="font-medium text-gray-900">{student.studentId}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Phone</p>
                                                <p className="font-medium text-gray-900">{student.phone || "N/A"}</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 justify-end">
                                            <Link to={`/admin/student/${student._id}`} className="flex-1">
                                                <button className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium py-2 rounded transition">
                                                    View
                                                </button>
                                            </Link>
                                            <button
                                                onClick={() => openEditModal(student)}
                                                className="flex-1 bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-medium py-2 rounded transition"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteStudent(student._id)}
                                                className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium py-2 rounded transition"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-gray-500 py-8 text-sm">
                                    {emptyStudentsMessage}
                                </p>
                            )}
                        </div>)
                }

                {/* Desktop Table View */}
                {studentsLoading ? <TableRowShimmer rows={5} columns={6} /> : (
                    <div className="hidden md:block">
                        <Table
                            columns={columns}
                            renderRow={renderRow}
                            data={paginatedStudents}
                        />
                    </div>)}
            </div>

            {!studentsLoading && filteredStudents.length > 0 && (
                <Pagination
                    currentPage={safeCurrentPage}
                    totalPages={totalPages}
                    totalItems={filteredStudents.length}
                    pageSize={pageSize}
                    pageSizeOptions={STUDENTS_PAGE_SIZE_OPTIONS}
                    itemLabel="students"
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                />
            )}



            <StudentBulkUploadModal
                isOpen={isBulkUploadOpen}
                onClose={() => setIsBulkUploadOpen(false)}
                onImported={async () => {
                    await fetchStudents();
                    await getFeesData();
                }}
            />

            {/* MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-3 sm:p-4">
                    <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
                            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">
                                {formMode === "edit" ? "Edit student" : "Create a new student"}
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
                                            Username *
                                        </label>
                                        <input
                                            type="text"
                                            name="username"
                                            value={formData.username}
                                            onChange={handleChange}
                                            maxLength={50}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("username")}`}
                                            aria-invalid={Boolean(fieldErrors.username)}
                                            required
                                        />
                                        {renderFieldError("username")}
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
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("email")}`}
                                            aria-invalid={Boolean(fieldErrors.email)}
                                            required
                                        />
                                        {renderFieldError("email")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Password {formMode === "edit" ? "(leave blank to keep current password)" : "*"}
                                        </label>
                                        <input
                                            type="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            minLength={6}
                                            autoComplete="new-password"
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("password")}`}
                                            aria-invalid={Boolean(fieldErrors.password)}
                                            required={formMode !== "edit"}
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
                                            First Name *
                                        </label>
                                        <input
                                            type="text"
                                            name="firstName"
                                            value={formData.firstName}
                                            onChange={handleChange}
                                            maxLength={50}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("firstName")}`}
                                            aria-invalid={Boolean(fieldErrors.firstName)}
                                            required
                                        />
                                        {renderFieldError("firstName")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Last Name *
                                        </label>
                                        <input
                                            type="text"
                                            name="lastName"
                                            value={formData.lastName}
                                            onChange={handleChange}
                                            maxLength={50}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("lastName")}`}
                                            aria-invalid={Boolean(fieldErrors.lastName)}
                                            required
                                        />
                                        {renderFieldError("lastName")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Phone
                                        </label>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
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
                                            maxLength={15}
                                            pattern="\d{10,15}"
                                            required
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("phone")}`}
                                            aria-invalid={Boolean(fieldErrors.phone)}
                                        />
                                        {renderFieldError("phone")}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4">
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Address
                                        </label>
                                        <input
                                            type="text"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("address")}`}
                                            aria-invalid={Boolean(fieldErrors.address)}
                                        />
                                        {renderFieldError("address")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Blood Type
                                        </label>
                                        <select
                                            name="bloodType"
                                            value={formData.bloodType}
                                            onChange={handleChange}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("bloodType")}`}
                                            aria-invalid={Boolean(fieldErrors.bloodType)}
                                        >
                                            <option value="">Select blood type</option>
                                            <option value="A+">A+</option>
                                            <option value="A-">A-</option>
                                            <option value="B+">B+</option>
                                            <option value="B-">B-</option>
                                            <option value="AB+">AB+</option>
                                            <option value="AB-">AB-</option>
                                            <option value="O+">O+</option>
                                            <option value="O-">O-</option>
                                        </select>
                                        {renderFieldError("bloodType")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Birthday
                                        </label>
                                        <input
                                            type="date"
                                            name="birthday"
                                            value={formData.birthday}
                                            onChange={handleChange}
                                            max={new Date().toISOString().split("T")[0]}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("birthday")}`}
                                            aria-invalid={Boolean(fieldErrors.birthday)}
                                        />
                                        {renderFieldError("birthday")}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">Sex</label>
                                        <select
                                            name="sex"
                                            value={formData.sex}
                                            onChange={handleChange}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("sex")}`}
                                            aria-invalid={Boolean(fieldErrors.sex)}
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                        {renderFieldError("sex")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">Photo</label>
                                        <label className={`flex items-center justify-center gap-2 cursor-pointer text-blue-500 hover:text-blue-600 border-2 border-dashed rounded-lg p-2 sm:p-3 ${fieldErrors.photo ? "border-red-300 bg-red-50" : "border-blue-300"}`}>
                                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                            <span className="text-xs sm:text-sm">Upload</span>
                                            <input
                                                type="file"
                                                name="photo"
                                                onChange={handleChange}
                                                className="hidden"
                                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                            />
                                        </label>
                                        {renderFieldError("photo")}
                                    </div>
                                </div>

                                {formData.photo && (
                                    <div className="mt-3 sm:mt-4">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={URL.createObjectURL(formData.photo)}
                                                alt="Preview"
                                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border border-gray-300"
                                            />
                                            <div className="flex flex-col gap-1 sm:gap-2">
                                                <p className="text-xs sm:text-sm text-gray-600 truncate">{formData.photo.name}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFormError("");
                                                        clearFieldError("photo");
                                                        setFormData({ ...formData, photo: null });
                                                    }}
                                                    className="text-xs sm:text-sm text-red-500 hover:text-red-700 font-semibold"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {!formData.photo && existingPhotoUrl && (
                                    <div className="mt-3 sm:mt-4">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={existingPhotoUrl}
                                                alt="Current student"
                                                onError={(event) => {
                                                    event.currentTarget.onerror = null;
                                                    event.currentTarget.src = '/avatar.png';
                                                }}
                                                className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border border-gray-300"
                                            />
                                            <p className="text-xs sm:text-sm text-gray-600">Current photo</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Academic Information */}
                            <div>
                                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                                    Academic Information
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Student ID
                                        </label>
                                        <input
                                            type="text"
                                            name="studentId"
                                            value={formData.studentId}
                                            required
                                            onChange={handleChange}
                                            maxLength={30}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("studentId")}`}
                                            aria-invalid={Boolean(fieldErrors.studentId)}
                                        />
                                        {renderFieldError("studentId")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                            Class Session *
                                        </label>
                                        <select
                                            name="class"
                                            value={formData.class}
                                            onChange={handleChange}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("class")}`}
                                            aria-invalid={Boolean(fieldErrors.class)}
                                            required
                                        >
                                            <option value="">Select a class session</option>
                                            {classes && classes.length > 0 ? (
                                                classes.map((cls) => (
                                                    <option key={cls._id} value={cls._id}>
                                                        {formatClassSessionLabel(cls)}
                                                    </option>
                                                ))
                                            ) : (
                                                <option disabled>No class sessions available</option>
                                            )}
                                        </select>
                                        {renderFieldError("class")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Section
                                        </label>
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
                                </div>

                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                            Transport Required?
                                        </label>
                                        <select
                                            name="transportOpted"
                                            value={formData.transportOpted}
                                            onChange={handleChange}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("transportOpted")}`}
                                            aria-invalid={Boolean(fieldErrors.transportOpted)}
                                        >
                                            <option value="true">Yes - add transport fee</option>
                                            <option value="false">No - do not add transport fee</option>
                                        </select>
                                        {renderFieldError("transportOpted")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                            Transport Fee
                                        </label>
                                        <input
                                            type="number"
                                            name="transportFee"
                                            value={formData.transportFee}
                                            onChange={handleChange}
                                            min="0"
                                            step="1"
                                            disabled={formData.transportOpted === "false"}
                                            placeholder="Fee for this student's route"
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 ${getInputStateClass("transportFee")}`}
                                            aria-invalid={Boolean(fieldErrors.transportFee)}
                                        />
                                        {renderFieldError("transportFee")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                            Admission Fee Charged
                                        </label>
                                        <input
                                            type="number"
                                            name="admissionFeeOverride"
                                            value={formData.admissionFeeOverride}
                                            onChange={handleChange}
                                            min="0"
                                            max={selectedClassAdmissionFee || undefined}
                                            step="1"
                                            placeholder={
                                                selectedClassAdmissionFee
                                                    ? `Default Rs. ${selectedClassAdmissionFee.toLocaleString()}`
                                                    : "Default class admission fee"
                                            }
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("admissionFeeOverride")}`}
                                            aria-invalid={Boolean(fieldErrors.admissionFeeOverride)}
                                        />
                                        {renderFieldError("admissionFeeOverride")}
                                        <p className="mt-1 text-xs text-gray-500">
                                            Leave blank for normal admission fee. Enter 0 or a lower amount for concessions.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Fee Concession */}
                            <div>
                                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                                    Fee Concession
                                </label>
                                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                        <div>
                                            <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                                Concession Type
                                            </label>
                                            <select
                                                name="tuitionConcessionType"
                                                value={formData.tuitionConcessionType}
                                                onChange={handleChange}
                                                className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 ${getInputStateClass("tuitionConcessionType")}`}
                                                aria-invalid={Boolean(fieldErrors.tuitionConcessionType)}
                                            >
                                                <option value="none">No Concession</option>
                                                <option value="fixed">Fixed Monthly Amount</option>
                                                <option value="percentage">Percentage</option>
                                            </select>
                                            {renderFieldError("tuitionConcessionType")}
                                        </div>
                                        <div>
                                            <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                                Concession Value
                                            </label>
                                            <input
                                                type="number"
                                                name="tuitionConcessionValue"
                                                value={formData.tuitionConcessionValue}
                                                onChange={handleChange}
                                                min="0"
                                                max={
                                                    formData.tuitionConcessionType === "percentage"
                                                        ? 100
                                                        : selectedClassMonthlyTuitionFee || undefined
                                                }
                                                step="0.01"
                                                disabled={formData.tuitionConcessionType === "none"}
                                                placeholder={
                                                    formData.tuitionConcessionType === "percentage"
                                                        ? "e.g., 10"
                                                        : "e.g., 50 per month"
                                                }
                                                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 ${getInputStateClass("tuitionConcessionValue")}`}
                                                aria-invalid={Boolean(fieldErrors.tuitionConcessionValue)}
                                            />
                                            {renderFieldError("tuitionConcessionValue")}
                                            {formData.tuitionConcessionType === "fixed" && selectedClassMonthlyTuitionFee > 0 && (
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Monthly class tuition: Rs. {selectedClassMonthlyTuitionFee.toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                                Status
                                            </label>
                                            <select
                                                name="tuitionConcessionActive"
                                                value={formData.tuitionConcessionActive}
                                                onChange={handleChange}
                                                disabled={formData.tuitionConcessionType === "none"}
                                                className={`w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 ${getInputStateClass("tuitionConcessionActive")}`}
                                                aria-invalid={Boolean(fieldErrors.tuitionConcessionActive)}
                                            >
                                                <option value="true">Active</option>
                                                <option value="false">Inactive</option>
                                            </select>
                                            {renderFieldError("tuitionConcessionActive")}
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2 font-medium">
                                            Concession Reason
                                        </label>
                                        <input
                                            type="text"
                                            name="tuitionConcessionReason"
                                            value={formData.tuitionConcessionReason}
                                            onChange={handleChange}
                                            maxLength={200}
                                            disabled={formData.tuitionConcessionType === "none"}
                                            placeholder="e.g., Merit scholarship or financial support"
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:bg-gray-100 disabled:text-gray-500 ${getInputStateClass("tuitionConcessionReason")}`}
                                            aria-invalid={Boolean(fieldErrors.tuitionConcessionReason)}
                                        />
                                        {renderFieldError("tuitionConcessionReason")}
                                    </div>
                                    <p className="mt-3 text-xs text-gray-500">
                                        This concession applies to every monthly tuition installment. Existing past or paid installments keep their original snapshot.
                                    </p>
                                </div>
                            </div>

                            {/* Parent/Guardian Information */}
                            <div>
                                <label className="text-xs sm:text-sm text-gray-600 font-semibold block mb-3 sm:mb-4">
                                    Parent/Guardian Information
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Parent Name
                                        </label>
                                        <input
                                            type="text"
                                            name="parentName"
                                            value={formData.parentName}
                                            onChange={handleChange}
                                            maxLength={80}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("parentName")}`}
                                            aria-invalid={Boolean(fieldErrors.parentName)}
                                        />
                                        {renderFieldError("parentName")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Parent Phone
                                        </label>
                                        <input
                                            type="tel"
                                            name="parentPhone"
                                            value={formData.parentPhone}
                                            onChange={(e) => {
                                                const onlyNums = e.target.value.replace(/\D/g, "");
                                                if (onlyNums.length <= 15) {
                                                    handleChange({
                                                        target: { name: "parentPhone", value: onlyNums }
                                                    });
                                                }
                                            }}
                                            inputMode="numeric"
                                            maxLength={15}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("parentPhone")}`}
                                            aria-invalid={Boolean(fieldErrors.parentPhone)}
                                        />
                                        {renderFieldError("parentPhone")}
                                    </div>
                                    <div>
                                        <label className="text-xs sm:text-sm text-gray-700 block mb-2">
                                            Parent Email
                                        </label>
                                        <input
                                            type="email"
                                            name="parentEmail"
                                            value={formData.parentEmail}
                                            onChange={handleChange}
                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${getInputStateClass("parentEmail")}`}
                                            aria-invalid={Boolean(fieldErrors.parentEmail)}
                                        />
                                        {renderFieldError("parentEmail")}
                                    </div>
                                </div>
                            </div>

                            {/* Submit Button */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    disabled={formSubmitting}
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-2 sm:py-3 rounded-lg transition duration-200 text-sm sm:text-base"
                                >
                                    {formSubmitting
                                        ? formMode === "edit"
                                            ? "Updating..."
                                            : "Creating..."
                                        : formMode === "edit"
                                            ? "Update Student"
                                            : "Create Student"}
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

export default StudentListPage;
