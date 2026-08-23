import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/authContext/AuthContext';

const RoleProtectedRoute = ({ children, requiredRole, requiredRoles = [] }) => {
  const { isAuthenticated, role, getDefaultAdminRoute } = useAuth();

  const allowedRoles = requiredRoles.length
    ? requiredRoles
    : requiredRole
      ? [requiredRole]
      : [];

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length && !allowedRoles.includes(role)) {
    if (role === 'student') {
      return <Navigate to="/student" replace />;
    }

    if (role === 'parent') {
      return <Navigate to="/parent" replace />;
    }

    return <Navigate to={getDefaultAdminRoute()} replace />;
  }

  return children;
};

export default RoleProtectedRoute;