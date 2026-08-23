import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";
import { ChevronLeft, Pencil } from "lucide-react";

const ClassDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { axios, token } = useAuth();
  const [classSession, setClassSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClassSessionDetails = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/class-sessions/${id}`, {
          headers: { token },
        });
        setClassSession(response.data.classSession || null);
        setError(null);
      } catch (requestError) {
        setError(requestError.response?.data?.message || "Failed to fetch class session details");
      } finally {
        setLoading(false);
      }
    };

    fetchClassSessionDetails();
  }, [axios, id, token]);

  const handleEditClassSession = () => {
    navigate("/admin/classes", {
      state: { openEditClassId: classSession?._id || id },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-500 mx-auto mb-3 sm:mb-4"></div>
          <p className="text-gray-600 font-semibold text-sm sm:text-base">Loading class session details...</p>
        </div>
      </div>
    );
  }

  if (error || !classSession) {
    return (
      <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-800">Class Session Details</h1>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm sm:text-base"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm sm:text-base">
          {error || "Class session not found"}
        </div>
      </div>
    );
  }

  const totalFee =
    (classSession.fees?.tuition || 0) +
    (classSession.fees?.admission || 0) +
    (classSession.fees?.exam || 0);

  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50 min-h-screen p-2 sm:p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-1 sm:mb-2">
              {classSession.name}
              {classSession.section ? `-${classSession.section}` : ""}
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-gray-600">
              Academic Year: <span className="font-semibold">{classSession.academicYear}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleEditClassSession}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition text-xs sm:text-sm font-medium"
            >
              <Pencil className="w-4 h-4" />
              Edit Session
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition text-xs sm:text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        </div>

        <div className="mb-4 sm:mb-6 md:mb-8">
          <span
            className={`inline-block px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-semibold text-white text-xs sm:text-sm ${
              classSession.status === "ACTIVE" ? "bg-green-500" : "bg-slate-500"
            }`}
          >
            {classSession.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
          <div className="bg-white rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-6 md:p-8 border-l-4 border-blue-500">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6">Session Information</h2>
            <div className="space-y-3 sm:space-y-4">
              <div className="pb-3 sm:pb-4 border-b border-gray-200">
                <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Master Class</label>
                <p className="text-lg sm:text-2xl font-bold text-gray-800 mt-1">{classSession.name}</p>
              </div>
              <div className="pb-3 sm:pb-4 border-b border-gray-200">
                <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Section</label>
                <p className="text-base sm:text-lg font-semibold text-gray-700 mt-1">{classSession.section || "N/A"}</p>
              </div>
              <div className="pb-3 sm:pb-4 border-b border-gray-200">
                <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Academic Year</label>
                <p className="text-base sm:text-lg font-semibold text-gray-700 mt-1">{classSession.academicYear}</p>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Capacity</label>
                <p className="text-base sm:text-lg font-semibold text-gray-700 mt-1">{classSession.capacity} Students</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-6 md:p-8 border-l-4 border-purple-500">
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6">Class Teacher</h2>
            {classSession.classTeacher ? (
              <div className="space-y-3 sm:space-y-4">
                <div className="pb-3 sm:pb-4 border-b border-purple-200">
                  <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Name</label>
                  <p className="text-base sm:text-lg font-bold text-gray-800 mt-1">{classSession.classTeacher.name}</p>
                </div>
                <div className="pb-3 sm:pb-4 border-b border-purple-200">
                  <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Email</label>
                  <p className="text-xs sm:text-sm text-gray-700 mt-1 break-all font-medium">
                    {classSession.classTeacher.email}
                  </p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-gray-600 uppercase">Contact</label>
                  <p className="text-xs sm:text-sm text-gray-700 mt-1 font-medium">
                    {classSession.classTeacher.phone || "N/A"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-6 sm:py-8 text-sm">No teacher assigned</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg sm:rounded-xl shadow-lg p-4 sm:p-6 md:p-8 mb-4 sm:mb-6 md:mb-8 border-l-4 border-green-500">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-8">Fees Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 sm:p-4 md:p-6 border border-blue-200">
              <label className="text-xs font-semibold text-gray-600 uppercase block">Tuition</label>
              <p className="text-base sm:text-lg md:text-2xl font-bold text-blue-600 mt-1 sm:mt-2">
                {classSession.fees?.currency} {Number(classSession.fees?.tuition || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 sm:p-4 md:p-6 border border-green-200">
              <label className="text-xs font-semibold text-gray-600 uppercase block">Admission</label>
              <p className="text-base sm:text-lg md:text-2xl font-bold text-green-600 mt-1 sm:mt-2">
                {classSession.fees?.currency} {Number(classSession.fees?.admission || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-3 sm:p-4 md:p-6 border border-yellow-200">
              <label className="text-xs font-semibold text-gray-600 uppercase block">Exam</label>
              <p className="text-base sm:text-lg md:text-2xl font-bold text-yellow-600 mt-1 sm:mt-2">
                {classSession.fees?.currency} {Number(classSession.fees?.exam || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 sm:p-4 md:p-6 border border-purple-200">
              <label className="text-xs font-semibold text-gray-600 uppercase block">Total</label>
              <p className="text-base sm:text-lg md:text-2xl font-bold text-purple-600 mt-1 sm:mt-2">
                {classSession.fees?.currency} {totalFee.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg sm:rounded-xl shadow p-4 sm:p-6 md:p-8 border border-gray-200">
          <h3 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase mb-3 sm:mb-4">
            Additional Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Created</label>
              <p className="text-xs sm:text-sm text-gray-700 mt-1 font-medium">
                {new Date(classSession.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase font-semibold">Last Updated</label>
              <p className="text-xs sm:text-sm text-gray-700 mt-1 font-medium">
                {new Date(classSession.updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassDetails;
