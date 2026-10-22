import React, { useState, useCallback, useEffect } from 'react';
import AdminContext from './AdminContext';
import { useAuth } from '../authContext/AuthContext';

export const AdminProvider = ({ children }) => {
  const { axios, token, hasPermission } = useAuth();
  
  // Dashboard Data
  const [dashboardData, setDashboardData] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalParents: 0,
  });

  // Announcements
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);

  // Students
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Teachers
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);

  // Classes
  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [masterClasses, setMasterClasses] = useState([]);
  const [masterClassesLoading, setMasterClassesLoading] = useState(false);

  //Fees Data
  const [feesData, setFeesData] = useState({});
  const [feesLoading, setFeesLoading] = useState(false);

  // Initial loading state (true until first batch of API calls complete)
  const [initialLoading, setInitialLoading] = useState(true);

  // Admin Profile
  const [adminProfile, setAdminProfile] = useState(null);
  const [adminStats, setAdminStats] = useState({ totalStudents: 0, totalTeachers: 0, totalClasses: 0 });
  const [profileLoading, setProfileLoading] = useState(false);
  const [loginHistory, setLoginHistory] = useState([]);

  // Announcements Methods
  const fetchAnnouncements = useCallback(async () => {
    if (!hasPermission('dashboard.view')) {
      setAnnouncements([]);
      return;
    }

    try {
      setAnnouncementsLoading(true);
      const response = await axios.get('/admin/announcements', { 
        headers: { token } 
      });
      setAnnouncements(response.data.announcements || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [axios, token, hasPermission]);


  // Students Methods
  const fetchStudents = useCallback(async () => {
    if (
      !hasPermission('students.view') &&
      !hasPermission('dashboard.view') &&
      !hasPermission('fees.view')
    ) {
      setStudents([]);
      return;
    }

    try {
      setStudentsLoading(true);
      const response = await axios.get('/admin/students', { 
        headers: { token } 
      });
      setStudents(response.data.students || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setStudentsLoading(false);
    }
  }, [axios, token, hasPermission]);

  // Teachers Methods
  const fetchTeachers = useCallback(async () => {
    if (!hasPermission('teachers.view') && !hasPermission('dashboard.view')) {
      setTeachers([]);
      return;
    }

    try {
      setTeachersLoading(true);
      const response = await axios.get('/admin/teachers', { 
        headers: { token } 
      });
      setTeachers(response.data.teachers || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
    } finally {
      setTeachersLoading(false);
    }
  }, [axios, token, hasPermission]);

  // Classes Methods
  const fetchClasses = useCallback(async () => {
    if (
      !hasPermission('classes.view') &&
      !hasPermission('dashboard.view') &&
      !hasPermission('fees.view')
    ) {
      setClasses([]);
      return;
    }

    try {
      setClassesLoading(true);
      const response = await axios.get('/admin/classes', { 
        headers: { token } 
      });
      setClasses(response.data.classSessions || response.data.classes || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setClassesLoading(false);
    }
  }, [axios, token, hasPermission]);

  const fetchMasterClasses = useCallback(async () => {
    if (!hasPermission('classes.view')) {
      setMasterClasses([]);
      return;
    }

    try {
      setMasterClassesLoading(true);
      const response = await axios.get('/classes', {
        headers: { token }
      });
      setMasterClasses(response.data.classes || []);
    } catch (error) {
      console.error('Error fetching master classes:', error);
    } finally {
      setMasterClassesLoading(false);
    }
  }, [axios, token, hasPermission]);

  const getFeesData = useCallback(async () => {
    if (!hasPermission('fees.view') && !hasPermission('dashboard.view')) {
      setFeesData({});
      return;
    }

    try {
      setFeesLoading(true);
      const response = await axios.get('/admin/student/feesRecords', { headers: { token } });
      if (response.status === 200) {
        const feesMap = {};
        response.data.fees?.forEach(fee => {
          const totalFees = Number(fee.totalFees || 0);
          const paidAmount = Number(fee.paidAmount || 0);
          feesMap[fee.student._id] = {
            _id: fee._id,
            totalFees,
            paidAmount,
            remaining: Number.isFinite(Number(fee.remaining))
              ? Number(fee.remaining)
              : Math.max(totalFees - paidAmount, 0),
            status: fee.status,
            dueDate: fee.dueDate,
            feeSettings: fee.feeSettings,
            feeBreakdown: fee.feeBreakdown,
            feeFrequency: fee.feeFrequency,
            feeInstallments: fee.feeInstallments,
            installmentSummary: fee.installmentSummary,
            paidBreakdown: fee.paidBreakdown,
            paymentHistory: fee.paymentHistory
          };
        });

        setFeesData(feesMap);
      }
    } catch (error) {
      console.warn("Fees data endpoint not available, using defaults:", error.message);
    } finally {
      setFeesLoading(false);
    }
  },[axios, token, hasPermission]);

  // Admin Profile Methods
  const fetchAdminProfile = useCallback(async () => {
    if (!hasPermission('profile.view')) {
      setAdminProfile(null);
      return;
    }

    try {
      setProfileLoading(true);
      const response = await axios.get('/admin/profile', { headers: { token } });
      if (response.data.success) {
        setAdminProfile(response.data.admin);
        setAdminStats(response.data.stats);
      }
    } catch (error) {
      console.error('Error fetching admin profile:', error);
    } finally {
      setProfileLoading(false);
    }
  }, [axios, token, hasPermission]);

  const updateAdminProfile = useCallback(async (profileData) => {
    if (!hasPermission('profile.view')) {
      return { success: false, message: 'You are not allowed to update profile' };
    }

    try {
      const response = await axios.put('/admin/profile', profileData, { headers: { token } });
      if (response.data.success) {
        setAdminProfile(response.data.admin);
        return { success: true, message: response.data.message };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to update profile' };
    }
  }, [axios, token, hasPermission]);

  const changeAdminPassword = useCallback(async (passwordData) => {
    if (!hasPermission('profile.view')) {
      return { success: false, message: 'You are not allowed to change password' };
    }

    try {
      const response = await axios.put('/admin/change-password', passwordData, { headers: { token } });
      if (response.data.success) {
        return { success: true, message: response.data.message };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to change password' };
    }
  }, [axios, token, hasPermission]);

  const fetchLoginHistory = useCallback(async () => {
    if (!hasPermission('profile.view')) {
      setLoginHistory([]);
      return;
    }

    try {
      const response = await axios.get('/admin/login-history', { headers: { token } });
      if (response.data.success) {
        setLoginHistory(response.data.loginHistory || []);
      }
    } catch (error) {
      console.error('Error fetching login history:', error);
    }
  }, [axios, token, hasPermission]);



  useEffect(() => {
    if (!token) {
      setInitialLoading(false);
      return;
    }

    const loadAllData = async () => {
      setInitialLoading(true);
      try {
        const requests = [];
        const canViewDashboard = hasPermission('dashboard.view');
        const canViewFees = hasPermission('fees.view') || canViewDashboard;
        const canViewStudents = hasPermission('students.view') || canViewDashboard || canViewFees;
        const canViewTeachers = hasPermission('teachers.view') || canViewDashboard;
        const canViewClasses = hasPermission('classes.view') || canViewDashboard || canViewFees;

        if (canViewStudents) {
          requests.push(fetchStudents());
        }

        if (canViewClasses) {
          requests.push(fetchClasses());
        }

        if (hasPermission('classes.view')) {
          requests.push(fetchMasterClasses());
        }

        if (canViewTeachers) {
          requests.push(fetchTeachers());
        }

        if (canViewDashboard) {
          requests.push(fetchAnnouncements());
        }

        if (canViewFees) {
          requests.push(getFeesData());
        }

        if (hasPermission('profile.view')) {
          requests.push(fetchAdminProfile());
        }

        await Promise.all(requests);
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setInitialLoading(false);
      }
    };

    loadAllData();
  }, [
    token,
    hasPermission,
    fetchStudents,
    fetchClasses,
    fetchMasterClasses,
    fetchTeachers,
    fetchAnnouncements,
    getFeesData,
    fetchAdminProfile,
  ]);




  const value = {
    // Dashboard
    dashboardData,
    setDashboardData,

    // Announcements
    announcements,
    setAnnouncements,
    announcementsLoading,
    fetchAnnouncements,

    // Students
    students,
    studentsLoading,
    fetchStudents,

    // Teachers
    teachers,
    teachersLoading,
    fetchTeachers,

    // Classes
    classes,
    classesLoading,
    fetchClasses,
    masterClasses,
    masterClassesLoading,
    fetchMasterClasses,

    // Fees
    feesData,
    feesLoading,
    getFeesData,

    // Admin Profile
    adminProfile,
    adminStats,
    profileLoading,
    loginHistory,
    fetchAdminProfile,
    updateAdminProfile,
    changeAdminPassword,
    fetchLoginHistory,

    // Initial loading
    initialLoading,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};
