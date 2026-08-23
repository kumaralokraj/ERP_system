import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import { PERMISSION_GROUPS, getAssignablePermissionGroups } from '../../constants/permissions';
import { getApiErrorMessage } from '../../lib/formValidation';

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50];

const getAllPermissionKeys = (groups = []) =>
  groups.flatMap((group) => group.permissions.map((permission) => permission.key));

const formatDateTime = (value) => {
  if (!value) {
    return 'Never';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Never';
  }

  return parsedDate.toLocaleString();
};

const getRoleBadgeClass = (role = '') => {
  if (role === 'manager') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }

  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const getStatusBadgeClass = (isActive) =>
  isActive
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';

const ManageUsers = () => {
  const { axios, token } = useAuth();
  const { notify, confirm } = useNotifier();

  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [permissionsCatalog, setPermissionsCatalog] = useState(
    getAssignablePermissionGroups(PERMISSION_GROUPS)
  );
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState([]);
  const [isSavingPermissions, setIsSavingPermissions] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [statusUpdatingUserId, setStatusUpdatingUserId] = useState('');
  const [passwordUpdatingUserId, setPasswordUpdatingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');

  const allPermissions = useMemo(
    () => getAllPermissionKeys(permissionsCatalog),
    [permissionsCatalog]
  );

  const isAllPermissionsSelected =
    allPermissions.length > 0 && editingPermissions.length === allPermissions.length;

  const paginationWindow = useMemo(() => {
    const totalPages = pagination.totalPages || 0;
    if (totalPages <= 1) {
      return [];
    }

    const currentPage = pagination.page || 1;
    const windowSize = 5;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + windowSize - 1);

    if (endPage - startPage + 1 < windowSize) {
      startPage = Math.max(1, endPage - windowSize + 1);
    }

    const pages = [];
    for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      pages.push(pageNumber);
    }

    return pages;
  }, [pagination.page, pagination.totalPages]);

  const recordsSummary = useMemo(() => {
    if (!users.length || pagination.totalItems === 0) {
      return 'Showing 0 of 0 users';
    }

    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = start + users.length - 1;
    return `Showing ${start}-${end} of ${pagination.totalItems} users`;
  }, [users.length, pagination]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(debounceTimer);
  }, [searchInput]);

  const fetchPermissionCatalog = useCallback(async () => {
    try {
      setIsLoadingPermissions(true);
      const response = await axios.get('/admin/users/permissions', {
        headers: { token },
      });

      if (response.data?.success) {
        const fallbackGroups = getAssignablePermissionGroups(response.data.groups || PERMISSION_GROUPS);
        const catalog = Array.isArray(response.data.assignableGroups)
          ? response.data.assignableGroups
          : fallbackGroups;
        setPermissionsCatalog(catalog);
      }
    } catch (error) {
      notify.warning(getApiErrorMessage(error, 'Using local permission catalog fallback'));
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [axios, notify, token]);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoadingUsers(true);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });

      if (roleFilter !== 'all') {
        params.set('role', roleFilter);
      }

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      if (searchQuery) {
        params.set('search', searchQuery);
      }

      const response = await axios.get(`/admin/users?${params.toString()}`, {
        headers: { token },
      });

      if (response.data?.success) {
        const apiUsers = Array.isArray(response.data.users) ? response.data.users : [];
        const apiPagination = response.data.pagination || {};

        const nextPagination = {
          page: apiPagination.page || 1,
          limit: apiPagination.limit || pageSize,
          totalItems: apiPagination.totalItems || 0,
          totalPages: apiPagination.totalPages || 0,
          hasNextPage: !!apiPagination.hasNextPage,
          hasPrevPage: !!apiPagination.hasPrevPage,
        };

        setUsers(apiUsers);
        setPagination(nextPagination);

        if (nextPagination.page !== page) {
          setPage(nextPagination.page);
        }
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Failed to fetch users'));
      setUsers([]);
      setPagination((currentPagination) => ({
        ...currentPagination,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      }));
    } finally {
      setIsLoadingUsers(false);
    }
  }, [axios, notify, page, pageSize, roleFilter, searchQuery, statusFilter, token]);

  useEffect(() => {
    fetchPermissionCatalog();
  }, [fetchPermissionCatalog]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openPermissionsModal = (user) => {
    const availablePermissionSet = new Set(allPermissions);
    const currentPermissions = Array.isArray(user.permissions)
      ? user.permissions.filter((permission) => availablePermissionSet.has(permission))
      : [];

    setEditingUser(user);
    setEditingPermissions(currentPermissions);
    setIsPermissionsModalOpen(true);
  };

  const closePermissionsModal = () => {
    setIsPermissionsModalOpen(false);
    setEditingUser(null);
    setEditingPermissions([]);
  };

  const togglePermission = (permissionKey) => {
    setEditingPermissions((previousPermissions) => {
      const hasPermission = previousPermissions.includes(permissionKey);
      if (hasPermission) {
        return previousPermissions.filter((permission) => permission !== permissionKey);
      }

      return [...previousPermissions, permissionKey];
    });
  };

  const toggleAllPermissions = () => {
    setEditingPermissions(isAllPermissionsSelected ? [] : [...allPermissions]);
  };

  const handleSavePermissions = async () => {
    if (!editingUser?.id) {
      notify.error('Select a user to update permissions');
      return;
    }

    if (!editingPermissions.length) {
      notify.error('Assign at least one permission');
      return;
    }

    try {
      setIsSavingPermissions(true);

      const payload = {
        permissions: editingPermissions,
      };

      const response = await axios.put(`/admin/users/${editingUser.id}/permissions`, payload, {
        headers: { token },
      });

      if (response.data?.success && response.data.user) {
        const nextUser = response.data.user;

        setUsers((currentUsers) =>
          currentUsers.map((user) => (user.id === nextUser.id ? nextUser : user))
        );

        notify.success('User permissions updated successfully');
        closePermissionsModal();
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Failed to update user permissions'));
    } finally {
      setIsSavingPermissions(false);
    }
  };

  const handleToggleUserStatus = async (user) => {
    const nextIsActive = !user.isActive;

    const shouldProceed = await confirm({
      title: nextIsActive ? 'Activate user' : 'Deactivate user',
      message: nextIsActive
        ? `Activate ${user.name}? The account will be able to login again.`
        : `Deactivate ${user.name}? This immediately logs out active sessions for this account.`,
      confirmText: nextIsActive ? 'Activate' : 'Deactivate',
      cancelText: 'Cancel',
      tone: nextIsActive ? 'primary' : 'danger',
    });

    if (!shouldProceed) {
      return;
    }

    try {
      setStatusUpdatingUserId(user.id);

      const response = await axios.patch(
        `/admin/users/${user.id}/status`,
        { isActive: nextIsActive },
        { headers: { token } }
      );

      if (response.data?.success && response.data.user) {
        const nextUser = response.data.user;
        setUsers((currentUsers) =>
          currentUsers.map((item) => (item.id === nextUser.id ? nextUser : item))
        );

        notify.success(nextIsActive ? 'User activated successfully' : 'User deactivated successfully');
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Failed to update user status'));
    } finally {
      setStatusUpdatingUserId('');
    }
  };

  const openPasswordModal = (user) => {
    setPasswordTargetUser(user);
    setPasswordForm({
      newPassword: '',
      confirmPassword: '',
    });
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setPasswordTargetUser(null);
    setPasswordForm({
      newPassword: '',
      confirmPassword: '',
    });
  };

  const handlePasswordInputChange = (event) => {
    const { name, value } = event.target;
    setPasswordForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  const handleChangeUserPassword = async () => {
    if (!passwordTargetUser?.id) {
      notify.error('Select a user to change password');
      return;
    }

    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      notify.error('Please fill all password fields');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      notify.error('New password must be at least 6 characters');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      notify.error('Password confirmation does not match');
      return;
    }

    try {
      setIsSavingPassword(true);
      setPasswordUpdatingUserId(passwordTargetUser.id);

      const response = await axios.patch(
        `/admin/users/${passwordTargetUser.id}/password`,
        { newPassword: passwordForm.newPassword },
        { headers: { token } }
      );

      if (response.data?.success) {
        if (response.data.user) {
          const nextUser = response.data.user;
          setUsers((currentUsers) =>
            currentUsers.map((user) => (user.id === nextUser.id ? nextUser : user))
          );
        }

        notify.success(response.data.message || 'User password updated successfully');
        closePasswordModal();
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Failed to update user password'));
    } finally {
      setIsSavingPassword(false);
      setPasswordUpdatingUserId('');
    }
  };

  const handleDeleteUser = async (user) => {
    const shouldProceed = await confirm({
      title: 'Delete user',
      message: `Delete ${user.name}? This cannot be undone and the user will lose access immediately.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });

    if (!shouldProceed) {
      return;
    }

    try {
      setDeletingUserId(user.id);
      const response = await axios.delete(`/admin/users/${user.id}`, {
        headers: { token },
      });

      if (response.data?.success) {
        notify.success(response.data.message || 'User deleted successfully');
        await fetchUsers();
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Failed to delete user'));
    } finally {
      setDeletingUserId('');
    }
  };

  const handleRoleFilterChange = (event) => {
    setRoleFilter(event.target.value);
    setPage(1);
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (event) => {
    const nextPageSize = Number.parseInt(event.target.value, 10) || 10;
    setPageSize(nextPageSize);
    setPage(1);
  };

  const goToPage = (nextPage) => {
    if (nextPage === page) {
      return;
    }

    if (nextPage < 1 || nextPage > (pagination.totalPages || 0)) {
      return;
    }

    setPage(nextPage);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Manage Users</h1>
                <p className="mt-1 text-sm text-gray-600">
                  Update manager and staff permissions, filter users, change passwords, and manage account access.
                </p>
              </div>
            </div>

            <Link
              to="/admin/users/create"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-900"
            >
              <Plus className="h-4 w-4" />
              Create User
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by name or email"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</span>
              <select
                value={roleFilter}
                onChange={handleRoleFilterChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All roles</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</span>
              <select
                value={statusFilter}
                onChange={handleStatusFilterChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rows per page</span>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <div className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>{recordsSummary}</span>
            </div>
            <span className="text-xs text-gray-500">
              {isLoadingPermissions ? 'Loading permission catalog...' : 'Permission catalog loaded'}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-230 border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Permissions</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                      No users found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => {
                    const permissionList = Array.isArray(user.permissions) ? user.permissions : [];
                    const permissionPreview = permissionList.slice(0, 2).join(', ');
                    const isStatusUpdating = statusUpdatingUserId === user.id;
                    const isPasswordUpdating = passwordUpdatingUserId === user.id;
                    const isDeleting = deletingUserId === user.id;
                    const isAnyActionLoading = isStatusUpdating || isPasswordUpdating || isDeleting;

                    return (
                      <tr key={user.id} className="border-b border-gray-100 text-sm text-gray-700 hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-900">{user.name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${getRoleBadgeClass(
                              user.role
                            )}`}
                          >
                            {user.role}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                              user.isActive
                            )}`}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-sm font-medium text-gray-800">
                            {permissionList.length} permission{permissionList.length === 1 ? '' : 's'}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {permissionPreview || 'No permissions assigned'}
                            {permissionList.length > 2 ? ` +${permissionList.length - 2} more` : ''}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-xs text-gray-500">{formatDateTime(user.lastLogin)}</td>

                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openPermissionsModal(user)}
                              disabled={isAnyActionLoading}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit permissions
                            </button>

                            <button
                              type="button"
                              onClick={() => openPasswordModal(user)}
                              disabled={isAnyActionLoading}
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {isPasswordUpdating ? 'Saving...' : 'Change password'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(user)}
                              disabled={isAnyActionLoading}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition disabled:opacity-60 ${
                                user.isActive
                                  ? 'bg-rose-600 hover:bg-rose-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              {user.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                              {isStatusUpdating
                                ? 'Saving...'
                                : user.isActive
                                  ? 'Deactivate'
                                  : 'Activate'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              disabled={isAnyActionLoading}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-3 md:hidden">
            {isLoadingUsers ? (
              <p className="rounded-lg border border-gray-200 px-3 py-5 text-center text-sm text-gray-500">
                Loading users...
              </p>
            ) : users.length === 0 ? (
              <p className="rounded-lg border border-gray-200 px-3 py-5 text-center text-sm text-gray-500">
                No users found for the selected filters.
              </p>
            ) : (
              users.map((user) => {
                const permissionList = Array.isArray(user.permissions) ? user.permissions : [];
                const isStatusUpdating = statusUpdatingUserId === user.id;
                const isPasswordUpdating = passwordUpdatingUserId === user.id;
                const isDeleting = deletingUserId === user.id;
                const isAnyActionLoading = isStatusUpdating || isPasswordUpdating || isDeleting;

                return (
                  <div key={user.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{user.name}</h3>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(
                          user.isActive
                        )}`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 font-semibold capitalize ${getRoleBadgeClass(
                          user.role
                        )}`}
                      >
                        {user.role}
                      </span>
                      <span>{permissionList.length} permissions</span>
                    </div>

                    <p className="mt-2 text-xs text-gray-500">Last login: {formatDateTime(user.lastLogin)}</p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openPermissionsModal(user)}
                        disabled={isAnyActionLoading}
                        className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
                      >
                        Edit permissions
                      </button>

                      <button
                        type="button"
                        onClick={() => openPasswordModal(user)}
                        disabled={isAnyActionLoading}
                        className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
                      >
                        {isPasswordUpdating ? 'Saving...' : 'Change password'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(user)}
                        disabled={isAnyActionLoading}
                        className={`rounded-lg px-2.5 py-2 text-xs font-semibold text-white ${
                          user.isActive ? 'bg-rose-600' : 'bg-emerald-600'
                        }`}
                      >
                        {isStatusUpdating
                          ? 'Saving...'
                          : user.isActive
                            ? 'Deactivate'
                            : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        disabled={isAnyActionLoading}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
            <button
              type="button"
              onClick={() => goToPage((pagination.page || 1) - 1)}
              disabled={!pagination.hasPrevPage}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {paginationWindow.length > 0 ? (
                paginationWindow.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => goToPage(pageNumber)}
                    className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition ${
                      pageNumber === (pagination.page || 1)
                        ? 'bg-black text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))
              ) : (
                <span className="text-sm text-gray-500">Page 1</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => goToPage((pagination.page || 1) + 1)}
              disabled={!pagination.hasNextPage}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isPermissionsModalOpen && editingUser && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Edit Permissions</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Update permissions for {editingUser.name} ({editingUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={closePermissionsModal}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-5">
              <label className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={isAllPermissionsSelected}
                  onChange={toggleAllPermissions}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Select all permissions
              </label>

              <div className="space-y-4">
                {permissionsCatalog.map((group) => (
                  <div key={group.module} className="rounded-lg border border-gray-200 p-4">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      {group.module}
                    </h3>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <label
                          key={permission.key}
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={editingPermissions.includes(permission.key)}
                            onChange={() => togglePermission(permission.key)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 sm:p-5">
              <p className="text-sm text-gray-600">
                Selected permissions: <span className="font-semibold">{editingPermissions.length}</span>
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePermissionsModal}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingPermissions}
                  onClick={handleSavePermissions}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingPermissions ? 'Saving...' : 'Save permissions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPasswordModalOpen && passwordTargetUser && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4 sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Set a new password for {passwordTargetUser.name} ({passwordTargetUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={isSavingPassword}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  New password
                </span>
                <input
                  name="newPassword"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordInputChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Enter new password"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Confirm new password
                </span>
                <input
                  name="confirmPassword"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordInputChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Re-enter new password"
                />
              </label>

              <p className="text-xs text-gray-500">
                Minimum 6 characters. Updating the password logs the user out of active sessions.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 p-4 sm:p-5">
              <button
                type="button"
                onClick={closePasswordModal}
                disabled={isSavingPassword}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangeUserPassword}
                disabled={isSavingPassword}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingPassword ? 'Saving...' : 'Save password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
