import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";
import { ChevronLeft, Pencil } from "lucide-react";

const TeacherProfile = () => {
  const { token, axios } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTeacherDetails();
  }, [id]);

  const fetchTeacherDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/admin/teacher/${id}`, {
        headers: { token },
      });

      setTeacher(response.data.teacher);
      setError(null);
    } catch (err) {
      console.error("Error fetching teacher:", err);
      setError(err.response?.data?.message || "Failed to fetch teacher details");
    } finally {
      setLoading(false);
    }
  };

  const handleEditTeacher = () => {
    navigate("/admin/teachers", {
      state: { openEditTeacherId: teacher?._id || id },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-500 mx-auto mb-3 sm:mb-4"></div>
          <p className="text-gray-600 font-semibold text-sm sm:text-base">Loading teacher profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-800">Teacher Profile</h1>
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

  if (!teacher) {
    return (
      <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-800">Teacher Profile</h1>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition text-sm sm:text-base"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="text-center text-gray-500 py-8 text-sm">No teacher found</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6 md:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Teacher Profile</h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleEditTeacher}
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
          src="/avatar.png"
          alt={teacher.name}
          className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 rounded-lg object-cover border-2 border-gray-300 shrink-0"
        />

        <div className="flex-1">
          <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">{teacher.name}</h2>
          <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 break-all">{teacher.email}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-gray-500 font-medium">Employee ID</p>
              <p className="font-semibold text-sm sm:text-base">
                {teacher.employeeId || "N/A"}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium">Phone</p>
              <p className="font-semibold text-sm sm:text-base">{teacher.phone || "N/A"}</p>
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
            <p className="text-xs text-gray-600 mb-1 font-medium">Gender</p>
            <p className="font-semibold text-sm sm:text-base text-gray-900">
              {teacher.gender || "N/A"}
            </p>
          </div>

          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-600 mb-1 font-medium">Date of Birth</p>
            <p className="font-semibold text-sm sm:text-base text-gray-900">
              {teacher.dob
                ? new Date(teacher.dob).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "N/A"}
            </p>
          </div>

          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-gray-600 mb-1 font-medium">Address</p>
            <p className="font-semibold text-sm sm:text-base text-gray-900">
              {teacher.address || "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Professional Information */}
      <div className="mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200">
        <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
          Professional Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600 mb-1 font-medium">Qualification</p>
            <p className="font-semibold text-sm sm:text-base text-blue-600">
              {teacher.qualification || "N/A"}
            </p>
          </div>

          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
            <p className="text-xs text-gray-600 mb-1 font-medium">Experience</p>
            <p className="font-semibold text-sm sm:text-base text-blue-600">
              {teacher.experienceYears} Years
            </p>
          </div>

          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200 sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-gray-600 mb-1 font-medium">Joining Date</p>
            <p className="font-semibold text-sm sm:text-base text-blue-600">
              {teacher.joiningDate
                ? new Date(teacher.joiningDate).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className="pt-6 md:pt-8">
        <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-gray-800">
          Account Information
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-purple-50 p-3 sm:p-4 rounded-lg border border-purple-200">
            <p className="text-xs text-gray-600 mb-1 font-medium">Email</p>
            <p className="font-semibold text-xs sm:text-sm text-purple-600 break-all">
              {teacher.email}
            </p>
          </div>

          <div className="bg-purple-50 p-3 sm:p-4 rounded-lg border border-purple-200">
            <p className="text-xs text-gray-600 mb-1 font-medium">Status</p>
            <p className="font-semibold text-sm sm:text-base text-green-600">✓ Active</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherProfile;