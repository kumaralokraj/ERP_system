import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, MapPin, Building, Calendar, Edit2, Save, X, Eye, EyeOff, LogOut, Lock, Loader2 } from 'lucide-react';
import { useAdmin } from '../../context/adminContext/AdminContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';

const Profile = () => {
  const { notify } = useNotifier();
  const {
    adminProfile,
    adminStats: stats,
    profileLoading,
    loginHistory,
    updateAdminProfile,
    changeAdminPassword,
    fetchLoginHistory,
    fetchAdminProfile,
  } = useAdmin();

  const [isEditing, setIsEditing] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [editedData, setEditedData] = useState({});

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Sync editedData when adminProfile loads
  useEffect(() => {
    if (adminProfile) {
      setEditedData({
        firstName: adminProfile.firstName || '',
        lastName: adminProfile.lastName || '',
        phone: adminProfile.phone || '',
        position: adminProfile.position || '',
        department: adminProfile.department || '',
        address: adminProfile.address || '',
        city: adminProfile.city || '',
        state: adminProfile.state || '',
        zipCode: adminProfile.zipCode || '',
      });
    }
  }, [adminProfile]);

  // Fetch login history when component mounts
  useEffect(() => {
    fetchLoginHistory();
  }, [fetchLoginHistory]);

  const formData = adminProfile || {};

  const adminStatsDisplay = [
    { label: 'Students', value: stats.totalStudents?.toLocaleString() || '0', icon: User, color: 'bg-blue-100 text-blue-600' },
    { label: 'Teachers', value: stats.totalTeachers?.toLocaleString() || '0', icon: Building, color: 'bg-purple-100 text-purple-600' },
    { label: 'Classes', value: stats.totalClasses?.toLocaleString() || '0', icon: Calendar, color: 'bg-green-100 text-green-600' },
    { label: 'Last Login', value: formData.lastLogin ? new Date(formData.lastLogin).toLocaleDateString() : '—', icon: LogOut, color: 'bg-orange-100 text-orange-600' },
  ];

  const parseUserAgent = (ua) => {
    if (!ua) return 'Unknown Device';
    let browser = 'Unknown';
    let os = 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
    else if (ua.includes('Edg')) browser = 'Edge';
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'MacOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    return `${browser} - ${os}`;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = async () => {
    if (!editedData.firstName?.trim()) {
      notify.error('First name is required');
      return;
    }
    setSaving(true);
    const result = await updateAdminProfile(editedData);
    setSaving(false);
    if (result.success) {
      setIsEditing(false);
      notify.success(result.message);
    } else {
      notify.error(result.message);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      notify.error('Please fill all password fields');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      notify.error('New password must be at least 8 characters');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      notify.error('New passwords do not match');
      return;
    }
    setChangingPassword(true);
    const result = await changeAdminPassword({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
    setChangingPassword(false);
    if (result.success) {
      notify.success(result.message);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowChangePassword(false);
    } else {
      notify.error(result.message);
    }
  };

  const handleCancel = () => {
    if (adminProfile) {
      setEditedData({
        firstName: adminProfile.firstName || '',
        lastName: adminProfile.lastName || '',
        phone: adminProfile.phone || '',
        position: adminProfile.position || '',
        department: adminProfile.department || '',
        address: adminProfile.address || '',
        city: adminProfile.city || '',
        state: adminProfile.state || '',
        zipCode: adminProfile.zipCode || '',
      });
    }
    setIsEditing(false);
  };

  if (profileLoading && !adminProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Profile</h1>
        <p className="text-sm sm:text-base text-gray-600">Manage your account and settings</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6 sm:mb-8 overflow-hidden">
        {/* Cover Section */}
        <div className="h-24 sm:h-28 md:h-32 bg-[#C3EBFA]"></div>

        {/* Profile Header */}
        <div className="px-4 sm:px-6 md:px-8 pb-6 sm:pb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6 -mt-12 sm:-mt-14 md:-mt-16 relative z-10 mb-6 sm:mb-8">
            <div className="flex items-end gap-3 sm:gap-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-32 md:h-32 bg-white rounded-lg shadow-lg border-4 border-white flex items-center justify-center flex-shrink-0">
                <User className="w-10 h-10 sm:w-14 sm:h-14 md:w-20 md:h-20 text-gray-300" />
              </div>
              <div className="pb-1 sm:pb-2">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                  {formData.firstName} {formData.lastName}
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-gray-400 font-semibold">{formData.position}</p>
                <p className="text-xs sm:text-sm text-gray-600">{formData.department}</p>
              </div>
            </div>

            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg font-medium text-sm sm:text-base transition whitespace-nowrap flex-shrink-0 ${
                isEditing
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-[#C3EBFA] text-black hover:bg-[#a4e4fb]'
              }`}
            >
              {isEditing ? (
                <>
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Cancel</span>
                </>
              ) : (
                <>
                  <Edit2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Edit Profile</span>
                  <span className="sm:hidden">Edit</span>
                </>
              )}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8 pt-6 sm:pt-8 border-t border-gray-200">
            {adminStatsDisplay.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="text-center">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${stat.color} flex items-center justify-center mx-auto mb-2`}>
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 break-words">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-gray-600">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Profile Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-6 sm:mb-8">
        {/* Main Profile Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Personal Information</h3>

            {!isEditing ? (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">First Name</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.firstName}</p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">Last Name</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.lastName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">Email Address</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2 flex items-center gap-2">
                      <Mail className="w-4 h-4 text-black flex-shrink-0" />
                      <span className="break-all">{formData.email}</span>
                    </p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">Phone Number</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-black flex-shrink-0" />
                      {formData.phone}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">Position</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.position}</p>
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">Department</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.department}</p>
                  </div>
                </div>

                <div className="border-t pt-4 sm:pt-6">
                  <h4 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Address</h4>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <label className="text-xs sm:text-sm font-semibold text-gray-600">Street Address</label>
                      <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2 flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
                        <span>{formData.address}</span>
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600">City</label>
                        <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.city}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600">State</label>
                        <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.state}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600">ZIP Code</label>
                        <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2">{formData.zipCode}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 border-t pt-4 sm:pt-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600">Join Date</label>
                    <p className="text-sm sm:text-base text-gray-900 font-medium mt-1 sm:mt-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-black flex-shrink-0" />
                      {new Date(formData.joinDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">First Name</label>
                    <input
                      type="text"
                      name="firstName"
                      value={editedData.firstName}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                    />
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Last Name</label>
                    <input
                      type="text"
                      name="lastName"
                      value={editedData.lastName}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={editedData.email}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                    />
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={editedData.phone}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Position</label>
                    <input
                      type="text"
                      name="position"
                      value={editedData.position}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                    />
                  </div>
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Department</label>
                    <input
                      type="text"
                      name="department"
                      value={editedData.department}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                    />
                  </div>
                </div>

                <div className="border-t pt-4 sm:pt-6">
                  <h4 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Address</h4>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Street Address</label>
                      <input
                        type="text"
                        name="address"
                        value={editedData.address}
                        onChange={handleInputChange}
                        className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">City</label>
                        <input
                          type="text"
                          name="city"
                          value={editedData.city}
                          onChange={handleInputChange}
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                        />
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">State</label>
                        <input
                          type="text"
                          name="state"
                          value={editedData.state}
                          onChange={handleInputChange}
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                        />
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">ZIP Code</label>
                        <input
                          type="text"
                          name="zipCode"
                          value={editedData.zipCode}
                          onChange={handleInputChange}
                          className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C3EBFA]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4 sm:pt-6 border-t">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
                    <span className="sm:hidden">{saving ? '...' : 'Save'}</span>
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition text-sm"
                  >
                    <X className="w-4 h-4" />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Change Password */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            {!showChangePassword ? (
              <>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-black" />
                  Security
                </h3>
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="w-full px-4 py-2 bg-[#C3EBFA] rounded-lg font-semibold hover:bg-[#a4e4fb] transition text-sm"
                >
                  Change Password
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Change Password</h3>
                
                <div>
                  <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      name="currentPassword"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C3EBFA] pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-2.5 text-gray-500"
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C3EBFA] pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 text-gray-500"
                    >
                      {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-semibold text-gray-600 block mb-2">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordChange}
                      className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C3EBFA] pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-gray-500"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <button
                    onClick={handleChangePassword}
                    disabled={changingPassword}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {changingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                    {changingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                  <button
                    onClick={() => setShowChangePassword(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full text-left px-3 sm:px-4 py-3 hover:bg-gray-50 rounded-lg font-medium text-gray-700 transition text-sm">
                Download Profile
              </button>
              <button className="w-full text-left px-3 sm:px-4 py-3 hover:bg-gray-50 rounded-lg font-medium text-gray-700 transition text-sm">
                Export Data
              </button>
              <button className="w-full text-left px-3 sm:px-4 py-3 hover:bg-red-50 rounded-lg font-medium text-red-600 transition text-sm">
                Logout All Devices
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Login History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 md:p-8">
        <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6">Login History</h3>
        <div className="space-y-3 sm:space-y-4">
          {loginHistory.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No login history available</p>
          ) : (
            loginHistory.map((login, idx) => (
              <div key={idx} className="pb-3 sm:pb-4 border-b border-gray-200 last:border-b-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm sm:text-base text-gray-900 font-medium">{parseUserAgent(login.device)}</p>
                    <p className="text-xs sm:text-sm text-gray-600">
                      {new Date(login.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {' at '}
                      {new Date(login.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                    login.status === 'Active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {login.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;