import React, { useState, useCallback, useEffect } from 'react';
import StudentContext from './StudentContext';
import { useAuth } from '../authContext/AuthContext';

export const StudentProvider = ({ children }) => {
  const { axios, token } = useAuth();

  // Loading
  const [initialLoading, setInitialLoading] = useState(true);

  // Student Profile
  const [studentProfile, setStudentProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Announcements
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);

  // Fees
  const [feesData, setFeesData] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [feesLoading, setFeesLoading] = useState(false);

  // Books
  const [issuedBooks, setIssuedBooks] = useState([]);
  const [catalogBooks, setCatalogBooks] = useState([]);

  // Uniforms
  const [studentUniforms, setStudentUniforms] = useState([]);
  const [uniformItems, setUniformItems] = useState([]);

  // Profile Methods
  const fetchStudentProfile = useCallback(async () => {
    try {
      setProfileLoading(true);
      const response = await axios.get('/student/profile', { 
        headers: { token } 
      });
      setStudentProfile(response.data.student);
    } catch (error) {
      console.error('Error fetching student profile:', error);
    } finally {
      setProfileLoading(false);
    }
  }, [axios, token]);

  // Announcements Methods
  const fetchAnnouncements = useCallback(async () => {
    try {
      setAnnouncementsLoading(true);
      const response = await axios.get('/student/announcements', { 
        headers: { token } 
      });
      setAnnouncements(response.data.announcements || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setAnnouncementsLoading(false);
    }
  }, [axios, token]);

  // Fees Methods
  const fetchFeesData = useCallback(async () => {
    try {
      setFeesLoading(true);
      const response = await axios.get("/student/fees", {
        headers: { token },
      });

      if (response.data.success && response.data.fees?.length > 0) {
        const fees = response.data.fees[0];
        setFeesData(fees);
        setPaymentHistory(fees.paymentHistory || []);
      }
    } catch (error) {
      console.error("Error fetching fees data:", error);
    } finally {
      setFeesLoading(false);
    }
  }, [axios, token]);

  // Books Methods
  const fetchStudentBooks = useCallback(async () => {
    try {
      const response = await axios.get('/student/issuedBooks', { 
        headers: { token } 
      });
      setIssuedBooks(response.data.data || []);
    } catch (error) {
      console.error('Error fetching student books:', error);
    } 
  }, [axios, token]);

  // Catalog Books
  const fetchCatalogBooks = useCallback(async () => {
    try {
      const response = await axios.get('/student/books', {
        headers: { token }
      });
      if (response.data.success) {
        setCatalogBooks(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching catalog books:', error);
    }
  }, [axios, token]);

  // Uniforms Methods
  const fetchStudentUniforms = useCallback(async () => {
    try {
      const response = await axios.get('/student/studentUniforms', { 
        headers: { token } 
      });
      const uniforms = response.data.studentUniforms;
      setStudentUniforms(uniforms?.[0]?.uniforms || []);
    } catch (error) {
      console.error('Error fetching student uniforms:', error);
    } 
  }, [axios, token]);

  // Uniform Items
  const fetchUniformItems = useCallback(async () => {
    try {
      const response = await axios.get('/student/uniformItems', {
        headers: { token }
      });
      if (response.data.success) {
        setUniformItems(response.data.uniformItems || []);
      }
    } catch (error) {
      console.error('Error fetching uniform items:', error);
    }
  }, [axios, token]);

  useEffect(() => {
    if (!token) {
      setInitialLoading(false);
      return;
    }

    const loadAllData = async () => {
      setInitialLoading(true);
      try {
        await Promise.all([
          fetchStudentProfile(),
          fetchAnnouncements(),
          fetchFeesData(),
          fetchStudentBooks(),
          fetchCatalogBooks(),
          fetchStudentUniforms(),
          fetchUniformItems(),
        ]);
      } finally {
        setInitialLoading(false);
      }
    };
    loadAllData();
  }, [token, fetchStudentProfile, fetchAnnouncements, fetchFeesData, fetchStudentBooks, fetchCatalogBooks, fetchStudentUniforms, fetchUniformItems]);

  const value = {
    // Loading
    initialLoading,

    // Profile
    studentProfile,
    profileLoading,
    fetchStudentProfile,

    // Announcements
    announcements,
    announcementsLoading,
    fetchAnnouncements,

    // Fees
    feesData,
    feesLoading,
    paymentHistory,
    fetchFeesData,

    // Books
    issuedBooks,
    catalogBooks,
    fetchStudentBooks,
    fetchCatalogBooks,

    // Uniforms
    studentUniforms,
    uniformItems,
    fetchStudentUniforms,
    fetchUniformItems,
  };

  return (
    <StudentContext.Provider value={value}>
      {children}
    </StudentContext.Provider>
  );
};