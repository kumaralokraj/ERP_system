import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import { PERMISSION_GROUPS, getAssignablePermissionGroups } from '../../constants/permissions';
import { getApiErrorMessage } from '../../lib/formValidation';

const getAllPermissionKeys = (groups = []) =>
  groups.flatMap((group) => group.permissions.map((permission) => permission.key));

const CreateUser = () => {
  const { axios, token } = useAuth();
  const { notify } = useNotifier();

  const [permissionsCatalog, setPermissionsCatalog] = useState(
    getAssignablePermissionGroups(PERMISSION_GROUPS)
  );
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'manager',
    permissions: [],
  });

  const allPermissions = useMemo(() => getAllPermissionKeys(permissionsCatalog), [permissionsCatalog]);

  const isAllPermissionsSelected =
    allPermissions.length > 0 && formData.permissions.length === allPermissions.length;

  const fetchPermissionCatalog = async () => {
    try {
      setLoadingPermissions(true);
      const response = await axios.get('/admin/users/permissions', {
        headers: { token },
      });

      if (response.data?.success) {
        const fallbackGroups = getAssignablePermissionGroups(response.data.groups || PERMISSION_GROUPS);
        const nextGroups = Array.isArray(response.data.assignableGroups)
          ? response.data.assignableGroups
          : fallbackGroups;

        setPermissionsCatalog(nextGroups);
      }
    } catch (error) {
      console.warn('Using local permission catalog fallback:', error.message);
    } finally {
      setLoadingPermissions(false);
    }
  };

  useEffect(() => {
    fetchPermissionCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const togglePermission = (permissionKey) => {
    setFormData((previous) => {
      const hasPermission = previous.permissions.includes(permissionKey);

      return {
        ...previous,
        permissions: hasPermission
          ? previous.permissions.filter((item) => item !== permissionKey)
          : [...previous.permissions, permissionKey],
      };
    });
  };

  const toggleAllPermissions = () => {
    setFormData((previous) => ({
      ...previous,
      permissions: isAllPermissionsSelected ? [] : [...allPermissions],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      notify.error('Name is required');
      return;
    }

    if (!formData.email.trim()) {
      notify.error('Email is required');
      return;
    }

    if (formData.password.length < 6) {
      notify.error('Password must be at least 6 characters');
      return;
    }

    if (!formData.permissions.length) {
      notify.error('Assign at least one permission');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
        permissions: formData.permissions,
      };

      const response = await axios.post('/admin/users/create', payload, {
        headers: { token },
      });

      if (response.data?.success) {
        notify.success('User created successfully');
        setFormData((previous) => ({
          ...previous,
          name: '',
          email: '',
          password: '',
          permissions: [],
        }));
      }
    } catch (error) {
      notify.error(getApiErrorMessage(error, 'Failed to create user'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Create User</h1>
              <p className="mt-1 text-sm text-gray-600">
                Create manager or staff accounts and assign module access permissions.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-1 sm:p-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Name</label>
              <input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter full name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Email</label>
              <input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="user@school.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Password</label>
              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Minimum 6 characters"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Role</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Creating User...' : 'Create User'}
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-semibold text-gray-900">Assign Permissions</h2>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={isAllPermissionsSelected}
                  onChange={toggleAllPermissions}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Select all permissions
              </label>
            </div>

            {loadingPermissions && (
              <p className="mb-3 text-sm text-gray-500">Loading permission catalog...</p>
            )}

            <div className="space-y-4">
              {permissionsCatalog.map((group) => (
                <div key={group.module} className="rounded-xl border border-gray-200 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {group.module}
                  </h3>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.key}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(permission.key)}
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

            <div className="mt-5 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
              Selected permissions: <span className="font-semibold">{formData.permissions.length}</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateUser;
