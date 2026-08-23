import { useState, useCallback, useEffect, useMemo } from 'react';
import AuthContext from './AuthContext';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { useNotifier } from '../notificationContext/NotificationContext';
import { DEFAULT_ADMIN_ROUTE_BY_PERMISSION, PERMISSIONS } from '../../constants/permissions';

// Use relative URLs so requests go to the same origin (no CORS needed)
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || "";

const ADMIN_PANEL_ROLES = ['admin', 'manager', 'staff'];
const isAdminRoutePath = (pathname = '') => pathname === '/admin' || pathname.startsWith('/admin/');

const AUTH_STORAGE_KEYS = {
  token: 'token',
  role: 'role',
  user: 'authUser',
  permissions: 'permissions',
};

const isAdminPanelRole = (role) => ADMIN_PANEL_ROLES.includes(role);
const normalizeRole = (role) => {
  if (typeof role !== 'string') {
    return '';
  }
  return role.trim().toLowerCase();
};

const parseStoredJson = (value, fallbackValue) => {
  if (!value) return fallbackValue;
  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
};

const normalizePermissions = (role, permissions = []) => {
  if (role === 'admin') {
    return [...PERMISSIONS];
  }

  if (!Array.isArray(permissions)) {
    return [];
  }

  return [...new Set(permissions)].filter((permission) => PERMISSIONS.includes(permission));
};

const getDefaultAdminRouteFor = (role, permissions = []) => {
  if (!isAdminPanelRole(role)) {
    return '/login';
  }

  if (role === 'admin') {
    return '/admin';
  }

  const normalizedPermissions = normalizePermissions(role, permissions);
  const firstAccessibleModule = DEFAULT_ADMIN_ROUTE_BY_PERMISSION.find((item) =>
    normalizedPermissions.includes(item.permission)
  );

  return firstAccessibleModule?.path || '/admin';
};

const AuthProvider = ({ children }) => {
  const { confirm } = useNotifier();
  const location = useLocation();

  // Avoid bootstrapping stale auth while on the public login route.
  const shouldBootstrapAuthFromStorage = location.pathname !== '/login';

  const storedToken = shouldBootstrapAuthFromStorage
    ? localStorage.getItem(AUTH_STORAGE_KEYS.token) || null
    : null;
  const storedUser = shouldBootstrapAuthFromStorage
    ? parseStoredJson(localStorage.getItem(AUTH_STORAGE_KEYS.user), null)
    : null;
  const storedRole = shouldBootstrapAuthFromStorage
    ? normalizeRole(localStorage.getItem(AUTH_STORAGE_KEYS.role) || storedUser?.role) || null
    : null;
  const storedPermissions = shouldBootstrapAuthFromStorage
    ? parseStoredJson(localStorage.getItem(AUTH_STORAGE_KEYS.permissions), [])
    : [];

  const initialPermissions = normalizePermissions(
    storedRole,
    storedPermissions.length ? storedPermissions : storedUser?.permissions || []
  );

  const [user, setUser] = useState(
    storedUser
      ? {
          ...storedUser,
          role: storedRole,
          permissions: initialPermissions,
        }
      : null
  );
  const [role, setRole] = useState(storedRole);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(storedToken);
  const [isRestoringSession, setIsRestoringSession] = useState(
    !!(storedToken && isAdminPanelRole(storedRole))
  );

  const clearAuthState = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEYS.token);
    localStorage.removeItem(AUTH_STORAGE_KEYS.role);
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    localStorage.removeItem(AUTH_STORAGE_KEYS.permissions);

    setToken(null);
    setRole(null);
    setPermissions([]);
    setUser(null);
    setIsRestoringSession(false);
  }, []);

  const persistAuthState = useCallback((nextToken, nextUser, nextRole, nextPermissions) => {
    const normalizedRole = normalizeRole(nextRole);
    const normalizedUser = {
      ...nextUser,
      role: normalizedRole,
      permissions: nextPermissions,
    };

    localStorage.setItem(AUTH_STORAGE_KEYS.token, nextToken);
    localStorage.setItem(AUTH_STORAGE_KEYS.role, normalizedRole);
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(normalizedUser));
    localStorage.setItem(AUTH_STORAGE_KEYS.permissions, JSON.stringify(nextPermissions));

    setToken(nextToken);
    setRole(normalizedRole);
    setUser(normalizedUser);
    setPermissions(nextPermissions);
    setIsRestoringSession(false);
  }, []);

  useEffect(() => {
    if (!token) {
      if (role || user || permissions.length) {
        clearAuthState();
      }
      setIsRestoringSession(false);
      return;
    }

    if (!role) {
      clearAuthState();
      setIsRestoringSession(false);
    }
  }, [token, role, user, permissions.length, clearAuthState]);

  const hasPermission = useCallback(
    (permission) => {
      if (!permission) return true;
      if (role === 'admin') return true;
      return permissions.includes(permission);
    },
    [role, permissions]
  );

  const hasAnyPermission = useCallback(
    (permissionList = []) => {
      if (!Array.isArray(permissionList) || permissionList.length === 0) return true;
      return permissionList.some((permission) => hasPermission(permission));
    },
    [hasPermission]
  );

  const getDefaultAdminRoute = useCallback(
    (targetRole = role, targetPermissions = permissions) =>
      getDefaultAdminRouteFor(targetRole, targetPermissions),
    [role, permissions]
  );

  const refreshCurrentUser = useCallback(async () => {
    if (!token || !isAdminPanelRole(role)) {
      return null;
    }

    if (!isAdminRoutePath(location.pathname)) {
      return null;
    }

    try {
      const response = await axios.get('/admin/users/me', {
        headers: { token },
      });

      if (!response.data?.success || !response.data.user) {
        return null;
      }

      const freshUser = response.data.user;
      const nextRole = normalizeRole(freshUser.role || role);
      const nextPermissions = normalizePermissions(nextRole, freshUser.permissions);
      const normalizedUser = {
        ...freshUser,
        role: nextRole,
        permissions: nextPermissions,
      };

      persistAuthState(token, normalizedUser, nextRole, nextPermissions);
      return normalizedUser;
    } catch (refreshError) {
      if (refreshError.response?.status === 401 || refreshError.response?.status === 403) {
        clearAuthState();
      }
      return null;
    }
  }, [token, role, location.pathname, clearAuthState, persistAuthState]);

  useEffect(() => {
    if (!token || !role) {
      setIsRestoringSession(false);
      return;
    }

    // Only validate sessions while on admin pages.
    if (!isAdminRoutePath(location.pathname)) {
      setIsRestoringSession(false);
      return;
    }

    if (!isAdminPanelRole(role)) {
      setIsRestoringSession(false);
      return;
    }

    let isMounted = true;
    setIsRestoringSession(true);

    const restoreSession = async () => {
      await refreshCurrentUser();
      if (isMounted) {
        setIsRestoringSession(false);
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [token, role, location.pathname, refreshCurrentUser]);

  const login = useCallback(async (email, password, userRole) => {
    setIsLoading(true);
    setError(null);

    try {
      const requestedRole = (userRole || '').toLowerCase();
      const endpoint = requestedRole === 'student'
        ? '/studentLogin'
        : requestedRole === 'parent'
          ? '/parentLogin'
          : '/adminLogin';
      const payload = requestedRole === 'student'
        ? { email, password }
        : requestedRole === 'parent'
          ? { familyCode: email, password }
          : { email, password, role: requestedRole };

      const response = await axios.post(endpoint, payload);

      if (response.data.token) {
        const apiUser = response.data.user || null;
        const nextRole = normalizeRole(apiUser?.role || requestedRole);
        const nextPermissions = normalizePermissions(nextRole, apiUser?.permissions || []);
        const nextUser = apiUser
          ? { ...apiUser, role: nextRole, permissions: nextPermissions }
          : {
              name: nextRole === 'student' ? 'Student' : 'User',
              email,
              role: nextRole,
              permissions: nextPermissions,
            };

        persistAuthState(response.data.token, nextUser, nextRole, nextPermissions);
        return true;
      }

      setError(response.data.message || 'Login failed');
      return false;

    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed');
      return false;
    } finally {
      setIsLoading(false);
    }

  }, [persistAuthState]);

  const logout = useCallback(async () => {
    const shouldLogout = await confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!shouldLogout) return false;

    clearAuthState();
    return true;
  }, [confirm, clearAuthState]);

  const contextValue = useMemo(() => ({
    user,
    role,
    token,
    permissions,
    isLoading,
    error,
    login,
    logout,
    axios,
    hasPermission,
    hasAnyPermission,
    refreshCurrentUser,
    resetAuthState: clearAuthState,
    getDefaultAdminRoute,
    isRestoringSession,
    isAuthenticated: !!token && !!role,
    isAdminPanelUser: isAdminPanelRole(role),
  }), [
    user,
    role,
    token,
    permissions,
    isLoading,
    error,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    refreshCurrentUser,
    clearAuthState,
    getDefaultAdminRoute,
    isRestoringSession,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
