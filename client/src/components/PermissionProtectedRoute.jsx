import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/authContext/AuthContext';
import useHasPermission from '../hooks/usePermission';

const PermissionProtectedRoute = ({ children, permission }) => {
  const { isAuthenticated, role, getDefaultAdminRoute } = useAuth();
  const isAllowed = useHasPermission(permission);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAllowed) {
    if (role === 'student') {
      return <Navigate to="/student" replace />;
    }

    const fallbackRoute = getDefaultAdminRoute();

    if (fallbackRoute === location.pathname) {
      return (
        <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your account does not currently have permission to access this module.
          Please contact your administrator to update assigned permissions.
        </div>
      );
    }

    return <Navigate to={fallbackRoute} replace />;
  }

  return children;
};

export default PermissionProtectedRoute;
