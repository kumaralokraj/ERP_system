import { useStudent } from "../../context/studentContext/StudentContext";

const formatClassSessionLabel = (classSession) => {
    if (!classSession) {
        return "N/A";
    }

    const className = classSession.name || classSession.classId?.name || "";
    const section = classSession.section ? `-${classSession.section}` : "";
    const academicYear = classSession.academicYear ? ` (${classSession.academicYear})` : "";
    return `${className}${section}${academicYear}`.trim();
};

const StudentProfile = () => {
    const {studentProfile,profileLoading} = useStudent();


   

    if (profileLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-500 mx-auto mb-3 sm:mb-4"></div>
                    <p className="text-gray-600 font-semibold text-sm sm:text-base">Loading profile...</p>
                </div>
            </div>
        );
    }

    if (!studentProfile) {
        return (
            <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-800">Profile</h1>
                </div>
                <div className="text-center text-gray-500 py-8 text-sm">No student found</div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6 md:mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Profile</h1>
            </div>

            {/* Profile Header */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 pb-6 md:pb-8 border-b border-gray-200 mb-6 md:mb-8">
                <img
                    src={studentProfile.photo || '/avatar.png'}
                    alt={studentProfile.username}
                    className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-lg object-cover border-2 border-gray-300 flex-shrink-0"
                />

                <div className="flex-1">
                    <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">
                        {studentProfile.firstName} {studentProfile.lastName}
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 break-all">{studentProfile.email}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Username</p>
                            <p className="font-semibold text-sm sm:text-base">{studentProfile.username}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Student ID</p>
                            <p className="font-semibold text-sm sm:text-base">{studentProfile.studentId}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Class</p>
                            <p className="font-semibold text-sm sm:text-base">{formatClassSessionLabel(studentProfile.class)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Section</p>
                            <p className="font-semibold text-sm sm:text-base">{studentProfile.section || "N/A"}</p>
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
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.firstName}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Last Name</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.lastName}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Phone</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.phone || "N/A"}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Gender</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.sex}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Blood Type</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.bloodType || "N/A"}</p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Date of Birth</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">
                            {studentProfile.birthday ? new Date(studentProfile.birthday).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                            }) : "N/A"}
                        </p>
                    </div>
                    <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200 sm:col-span-2 lg:col-span-1">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Address</p>
                        <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.address || "N/A"}</p>
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
                        <p className="font-semibold text-sm sm:text-base text-blue-600">{studentProfile.studentId}</p>
                    </div>
                    <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Class</p>
                        <p className="font-semibold text-sm sm:text-base text-blue-600">{formatClassSessionLabel(studentProfile.class)}</p>
                    </div>
                    <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200 sm:col-span-2 lg:col-span-1">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Section</p>
                        <p className="font-semibold text-sm sm:text-base text-blue-600">{studentProfile.section || "N/A"}</p>
                    </div>
                </div>
            </div>

            {/* Parent/Guardian Information */}
            {(studentProfile.parentName || studentProfile.parentPhone || studentProfile.parentEmail) && (
                <div className="mb-6 md:mb-8">
                    <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
                        Parent/Guardian Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                            <p className="text-xs text-gray-600 mb-1 font-medium">Parent Name</p>
                            <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.parentName || "N/A"}</p>
                        </div>
                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                            <p className="text-xs text-gray-600 mb-1 font-medium">Parent Phone</p>
                            <p className="font-semibold text-sm sm:text-base text-gray-900">{studentProfile.parentPhone || "N/A"}</p>
                        </div>
                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200 sm:col-span-2 lg:col-span-1">
                            <p className="text-xs text-gray-600 mb-1 font-medium">Parent Email</p>
                            <p className="font-semibold text-xs sm:text-sm text-gray-900 break-all">{studentProfile.parentEmail || "N/A"}</p>
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
                        <p className="font-semibold text-sm sm:text-base text-purple-600">{studentProfile.username}</p>
                    </div>
                    <div className="bg-purple-50 p-3 sm:p-4 rounded-lg border border-purple-200">
                        <p className="text-xs text-gray-600 mb-1 font-medium">Email</p>
                        <p className="font-semibold text-xs sm:text-sm text-purple-600 break-all">{studentProfile.email}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentProfile;
