import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import { ChevronLeft, Pencil } from "lucide-react";

const formatClassSessionLabel = (classSession) => {
    if (!classSession) {
        return "N/A";
    }

    const className = classSession.name || classSession.classId?.name || "";
    const section = classSession.section ? `-${classSession.section}` : "";
    const academicYear = classSession.academicYear ? ` (${classSession.academicYear})` : "";
    return `${className}${section}${academicYear}`.trim();
};

const formatCurrency = (value = 0) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);

const formatConcessionType = (type = "none") => {
    if (type === "fixed") return "Fixed Monthly Amount";
    if (type === "percentage") return "Percentage";
    return "No Concession";
};

const StudentProfile = () => {
    const { token, axios } = useAuth();
    const { notify } = useNotifier();
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const showEditSuccess = Boolean(location.state?.showEditSuccess);
    const editSuccessMessage = location.state?.editSuccessMessage || "Student updated successfully!";

    useEffect(() => {
        fetchStudentDetails();
    }, [id]);

    useEffect(() => {
        if (!showEditSuccess) {
            return;
        }

        notify.success(editSuccessMessage);
        navigate(location.pathname, { replace: true, state: null });
    }, [showEditSuccess, editSuccessMessage, notify, navigate, location.pathname]);

    const fetchStudentDetails = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/admin/student/${id}`, { headers: { token } });
            setStudent(response.data.student);
            setError(null);
        } catch (err) {
            console.error("Error fetching student:", err);
            setError(err.response?.data?.message || "Failed to fetch student details");
        } finally {
            setLoading(false);
        }
    };

    const handleEditStudent = () => {
        const profileStudentId = student?._id || id;
        navigate("/admin/students", {
            state: {
                openEditStudentId: profileStudentId,
                returnToProfileId: profileStudentId,
            },
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-500 mx-auto mb-3 sm:mb-4"></div>
                    <p className="text-gray-600 font-semibold text-sm sm:text-base">Loading student profile...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-800">Student Profile</h1>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition text-sm sm:text-base"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </button>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm sm:text-base">
                    ⚠️ {error}
                </div>
            </div>
        );
    }

    if (!student) {
        return (
            <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-800">Student Profile</h1>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition text-sm sm:text-base"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </button>
                </div>
                <div className="text-center text-gray-500 py-8 text-sm">No student found</div>
            </div>
        );
    }

    const classRecord = student.classSession || student.class || {};
    const annualTuition = Number(classRecord.fees?.tuition || 0);
    const monthlyTuition = Math.round((annualTuition / 12) * 100) / 100;
    const tuitionConcession = student.feeSettings?.tuitionConcession || {};
    const concessionActive =
        tuitionConcession.isActive && ["fixed", "percentage"].includes(tuitionConcession.type);
    const monthlyConcession = concessionActive
        ? tuitionConcession.type === "fixed"
            ? Math.min(Number(tuitionConcession.value || 0), monthlyTuition)
            : Math.min(
                Math.round(((monthlyTuition * Number(tuitionConcession.value || 0)) / 100) * 100) / 100,
                monthlyTuition
            )
        : 0;
    const monthlyPayable = Math.max(monthlyTuition - monthlyConcession, 0);

    return (
        <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6 md:mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Student Profile</h1>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleEditStudent}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-xs sm:text-sm font-medium"
                    >
                        <Pencil className="w-4 h-4" />
                        Edit
                    </button>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition text-xs sm:text-sm font-medium"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Back
                    </button>
                </div>
            </div>

            {/* Profile Header */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 pb-6 md:pb-8 border-b border-gray-200 mb-6 md:mb-8">
                <img
                    src={student.photo || '/avatar.png'}
                    alt={student.username}
                    className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-lg object-cover border-2 border-gray-300 shrink-0"
                />

                <div className="flex-1">
                    <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
                        {student.firstName} {student.lastName}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 break-all">{student.email}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Username</p>
                            <p className="font-semibold text-sm sm:text-base">{student.username}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Student ID</p>
                            <p className="font-semibold text-sm sm:text-base">{student.studentId}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Class</p>
                            <p className="font-semibold text-sm sm:text-base">{formatClassSessionLabel(student.class)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Section</p>
                            <p className="font-semibold text-sm sm:text-base">{student.section || "N/A"}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Personal Information */}
            <div className="mb-6 md:mb-8">
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
                    Personal Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">First Name</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{student.firstName}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Last Name</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{student.lastName}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Phone</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{student.phone || "N/A"}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Gender</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{student.sex}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Blood Type</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{student.bloodType || "N/A"}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Date of Birth</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">
                            {student.birthday ? new Date(student.birthday).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                            }) : "N/A"}
                        </p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200 sm:col-span-2 lg:col-span-1">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Address</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{student.address || "N/A"}</p>
                    </div>
                </div>
            </div>

            {/* Academic Information */}
            <div className="mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
                    Academic Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Student ID</p>
                        <p className="font-semibold text-sm sm:text-base text-blue-600">{student.studentId}</p>
                    </div>
                    <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Class</p>
                        <p className="font-semibold text-sm sm:text-base text-blue-600">{formatClassSessionLabel(student.class)}</p>
                    </div>
                    <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200 sm:col-span-2 lg:col-span-1">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Section</p>
                        <p className="font-semibold text-sm sm:text-base text-blue-600">{student.section || "N/A"}</p>
                    </div>
                </div>
            </div>

            {/* Fee Concession */}
            <div className="mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
                    Fee Concession
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-amber-50 p-3 sm:p-4 rounded-lg border border-amber-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Monthly Tuition Fee</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{formatCurrency(monthlyTuition)}</p>
                    </div>
                    <div className="bg-amber-50 p-3 sm:p-4 rounded-lg border border-amber-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Concession Type</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">
                            {formatConcessionType(tuitionConcession.type)}
                        </p>
                    </div>
                    <div className="bg-amber-50 p-3 sm:p-4 rounded-lg border border-amber-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Concession Value</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">
                            {tuitionConcession.type === "percentage"
                                ? `${Number(tuitionConcession.value || 0)}%`
                                : formatCurrency(tuitionConcession.value || 0)}
                        </p>
                    </div>
                    <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Monthly Payable Tuition</p>
                        <p className="font-semibold text-sm sm:text-base text-green-700">{formatCurrency(monthlyPayable)}</p>
                    </div>
                    <div className="bg-amber-50 p-3 sm:p-4 rounded-lg border border-amber-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Reason</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">
                            {tuitionConcession.reason || "N/A"}
                        </p>
                    </div>
                    <div className="bg-amber-50 p-3 sm:p-4 rounded-lg border border-amber-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Status</p>
                        <p className={`font-semibold text-sm sm:text-base ${concessionActive ? "text-green-700" : "text-gray-600"}`}>
                            {concessionActive ? "Active" : "Inactive"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Parent/Guardian Information */}
            {(student.parentName || student.parentPhone || student.parentEmail) && (
                <div className="mb-6 md:mb-8">
                    <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
                        Parent/Guardian Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                            <p className="text-xs text-gray-600 mb-1 font-medium">Parent Name</p>
                            <p className="font-semibold text-sm sm:text-base text-gray-900">{student.parentName || "N/A"}</p>
                        </div>
                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                            <p className="text-xs text-gray-600 mb-1 font-medium">Parent Phone</p>
                            <p className="font-semibold text-sm sm:text-base text-gray-900">{student.parentPhone || "N/A"}</p>
                        </div>
                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200 sm:col-span-2 lg:col-span-1">
                            <p className="text-xs text-gray-600 mb-1 font-medium">Parent Email</p>
                            <p className="font-semibold text-xs sm:text-sm text-gray-900 break-all">{student.parentEmail || "N/A"}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Account Information */}
            <div className="pt-6 md:pt-8 border-t border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
                    Account Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-purple-50 p-3 sm:p-4 rounded-lg border border-purple-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Username</p>
                        <p className="font-semibold text-sm sm:text-base text-purple-600">{student.username}</p>
                    </div>
                    <div className="bg-purple-50 p-3 sm:p-4 rounded-lg border border-purple-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Email</p>
                        <p className="font-semibold text-xs sm:text-sm text-purple-600 break-all">{student.email}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentProfile;
