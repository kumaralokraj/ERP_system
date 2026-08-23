import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";

const StudentFeeFamilyRedirect = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { axios, token } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const resolveFamily = async () => {
      try {
        const response = await axios.get(`/admin/families/by-student/${studentId}`, {
          headers: { token },
        });
        if (!isMounted) return;

        if (response.data.success && response.data.familyId) {
          navigate(`/admin/fees/family/${response.data.familyId}`, { replace: true });
        } else {
          setFailed(true);
        }
      } catch {
        if (isMounted) setFailed(true);
      }
    };

    resolveFamily();

    return () => {
      isMounted = false;
    };
  }, [axios, navigate, studentId, token]);

  if (failed) {
    return <Navigate to="/admin/fees" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
        <p className="mt-3 text-sm font-semibold text-gray-600">Opening family fee collection...</p>
      </div>
    </div>
  );
};

export default StudentFeeFamilyRedirect;
