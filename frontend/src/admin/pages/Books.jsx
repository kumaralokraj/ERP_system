import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, Loader ,ArrowRight} from 'lucide-react';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import { useNavigate } from 'react-router-dom';
import GlobalBookStudentSearch from '../components/books/GlobalBookStudentSearch';
import {
  GLOBAL_BOOK_CLASS_NAME,
  allowsRepeatIssue,
  isDiaryItem,
} from '../../lib/bookInventory';

const Books = () => {
  const [selectedClass, setSelectedClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [studentBookState, setStudentBookState] = useState({});
  const [booksByClass, setBooksByClass] = useState({});
  const [issueFieldErrors, setIssueFieldErrors] = useState({});

  // State for API data
  const [classStats, setClassStats] = useState([]);
  const [bookInventory, setBookInventory] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { axios, token } = useAuth();
  const { notify } = useNotifier();

  const navigate = useNavigate();

  const normalizeClassKey = (value) => `${value || ''}`.trim();



  // Fetch class statistics
  const fetchClassStats = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/admin/books/stats', {
        headers: { token }
      });
      console.log("class stats data : ", data);
      if (data.success) {
        setClassStats(data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch class statistics');
      console.error('Error fetching class stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const getAllBooks = async () => {
    try {
      setLoading(true);

      // Fetch all books from all classes
      const response = await axios.get('/admin/books/all', {
        headers: { token }
      });
      console.log(" all books data: ", response.data);
      // Group books by className
      const grouped = {};
      const booksData = response.data.data || [];

      booksData.forEach(book => {
        const className = book.className;
        if (!grouped[className]) {
          grouped[className] = [];
        }
        grouped[className].push(book);
      });

      setBooksByClass(grouped);

      console.log(" All books grouped by class: ", grouped);

    } catch (error) {
      console.error('Error fetching books:', error);
      if (error.response?.status === 404 || error.response?.status === 500) {
        setBooksByClass({});
      } else {
        notify.error('Failed to load books');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch books for selected class
  const fetchBooksForClass = (className) => {
    const classKey = normalizeClassKey(className);
    const classBooks = booksByClass[classKey] || [];
    const globalItems = (booksByClass[GLOBAL_BOOK_CLASS_NAME] || []).filter(isDiaryItem);
    const books = [...new Map([...classBooks, ...globalItems].map((book) => [book._id, book])).values()];
    setBookInventory(books);
    console.log(`Books for class ${classKey}: `, books);
  };

  // Fetch students for selected class
  const fetchStudentsForClass = async (className) => {
    try {
      const classKey = normalizeClassKey(className);
      if (!classKey) {
        setStudents([]);
        return;
      }

      setLoading(true);
      const { data } = await axios.get(`/admin/students/by-class/${encodeURIComponent(classKey)}`, {
        headers: { token }
      });

      console.log("students data for selected class : ", data);

      if (data.success) {
        setError(null);
        // Fetch issued books for each student
        const studentsWithBooks = await Promise.all(
          data.students.map(async (student) => {
            try {
              const bookData = await axios.get(
                `/admin/books/student/${student._id}`,
                { headers: { token } }
              );

              const issuedBooks = bookData.data.success
                ? bookData.data.data.filter(b => b.status === 'issued').map(b => b.bookName)
                : [];

              return {
                id: student._id,
                name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username,
                rollNo: student.studentId,
                issuedBooks,
                status: issuedBooks.length > 0 ? 'issued' : 'pending',
                issueDate: issuedBooks.length > 0 ? bookData.data.data[0]?.issueDate : null,
              };
            } catch {
              return {
                id: student._id,
                name: student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username,
                rollNo: student.studentId,
                issuedBooks: [],
                status: 'pending',
                issueDate: null,
              };
            }
          })
        );
        console.log("students with books: ", studentsWithBooks);
        setStudents(studentsWithBooks);
      }


    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch students');
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load - fetch class stats
  useEffect(() => {
    fetchClassStats();
    getAllBooks();
  }, []);

  // When class is selected, fetch books and students
  useEffect(() => {
    if (selectedClass) {
      fetchBooksForClass(selectedClass);
      fetchStudentsForClass(selectedClass);
    }
  }, [selectedClass]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'issued':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const openStudentBookProfile = (student, { issue = false } = {}) => {
    const studentId = student?.id || student?._id;
    if (!studentId) {
      notify.error('Student ID not found');
      return;
    }

    navigate(`/admin/books/student/${studentId}${issue ? '?issue=1' : ''}`);
  };

  const clearIssueFieldError = (studentId) => {
    setIssueFieldErrors((currentErrors) => {
      if (!currentErrors[studentId]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[studentId];
      return nextErrors;
    });
  };

  const handleBookToggle = (studentId, bookId) => {
    const key = `${studentId}-${bookId}`;
    clearIssueFieldError(studentId);
    setStudentBookState(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getSelectableBooksForStudent = (student) => {
    const issuedBooks = student.issuedBooks || [];

    return bookInventory.filter((book) =>
      (allowsRepeatIssue(book) || !issuedBooks.includes(book.name)) && book.availableStock > 0
    );
  };

  const handleSelectAllBooks = (student) => {
    const selectableBooks = getSelectableBooksForStudent(student);

    if (selectableBooks.length === 0) {
      return;
    }

    clearIssueFieldError(student.id);
    setStudentBookState(prev => {
      const allSelected = selectableBooks.every(
        (book) => prev[`${student.id}-${book._id}`]
      );
      const selectableBookIds = new Set(selectableBooks.map((book) => book._id));
      const nextState = { ...prev };

      bookInventory.forEach((book) => {
        const key = `${student.id}-${book._id}`;

        if (allSelected || !selectableBookIds.has(book._id)) {
          delete nextState[key];
        } else {
          nextState[key] = true;
        }
      });

      return nextState;
    });
  };

  const handleIssueBooks = async (student) => {
    const studentId = student.id;
    const studentName = student.name;

    try {
      // Get selected book IDs for this student
      const selectedBookIds = getSelectableBooksForStudent(student)
        .filter(book => studentBookState[`${studentId}-${book._id}`])
        .map(book => book._id);

      console.log("selected book ids to issue: ", selectedBookIds);

      if (selectedBookIds.length === 0) {
        setIssueFieldErrors((currentErrors) => ({
          ...currentErrors,
          [studentId]: 'Select at least one book to issue',
        }));
        return;
      }

      clearIssueFieldError(studentId);

      setLoading(true);
      const { data } = await axios.post(
        `/admin/books/issue`,
        {
          studentId,
          bookIds: selectedBookIds,
          className: normalizeClassKey(selectedClass),
        },
        { headers: { token } }
      );

      if (data.success) {
        notify.success(`Books issued to ${studentName}. Payment is due.`);

        // Reset checkboxes for this student
        const newState = { ...studentBookState };
        bookInventory.forEach(book => {
          delete newState[`${studentId}-${book._id}`];
        });
        setStudentBookState(newState);
        clearIssueFieldError(studentId);

        // Refresh data
        fetchBooksForClass(selectedClass);
        fetchStudentsForClass(selectedClass);
        openStudentBookProfile(student);
      } else {
        notify.error(data.message || 'Failed to issue books');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to issue books';
      notify.error(errorMsg);
      console.error('Error issuing books:', err);
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading && !selectedClass && classStats.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Error state
  if (error && classStats.length === 0) {
    return (
      <div className="p-3 sm:p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-3 rounded text-sm sm:text-base">
          {error}
        </div>
      </div>
    );
  }

  // CLASS VIEW
  if (!selectedClass) {
    // Calculate totals from class stats
    const totalStudentsFromStats = classStats.reduce((sum, c) => {
      // Fetch student count from API or use a placeholder
      return sum + (c.totalBooks || 0);
    }, 0);

    const totalIssued = classStats.reduce((sum, c) => sum + (c.issuedBooks || 0), 0);
    const totalAvailable = classStats.reduce((sum, c) => sum + (c.availableBooks || 0), 0);

    return (
      <div className="p-3 sm:p-4 md:p-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Books Management</h1>
          <p className="text-sm sm:text-base text-gray-600">Search a student first, or use class cards below for reporting</p>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <GlobalBookStudentSearch
            onSelect={(student) => navigate(`/admin/books/student/${student.id}`)}
          />
        </div>

        {/* Overall Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
            <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Total Books</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{totalStudentsFromStats}</p>
            <p className="text-gray-500 text-xs mt-2">Across all classes</p>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-green-500">
            <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Books Issued</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{totalIssued}</p>
            <p className="text-gray-500 text-xs mt-2">Currently distributed</p>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-yellow-500">
            <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Available</p>
            <p className="text-2xl sm:text-3xl font-bold text-yellow-600">{totalAvailable}</p>
            <p className="text-gray-500 text-xs mt-2">Ready to distribute</p>
          </div>
        </div>

        {/* Classes Grid */}
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Books by Class
            </h2>

            <button
              onClick={() => navigate("/admin/books/inventory")}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5
                         bg-blue-600 text-white rounded-md 
                         hover:bg-blue-700 transition active:bg-blue-800
                         text-xs sm:text-sm font-medium w-full sm:w-auto justify-center sm:justify-start"
            >
              Manage
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {classStats.map((classItem, index) => {
              const issuedPercentage = classItem.totalBooks > 0
                ? ((classItem.issuedBooks / classItem.totalBooks) * 100).toFixed(1)
                : 0;

              return (
                <div
                  key={index}
                  onClick={() => setSelectedClass(normalizeClassKey(classItem._id))}
                  className="bg-white p-4 sm:p-6 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer border border-gray-200 hover:border-blue-500 active:shadow-lg"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{classItem._id}</h3>
                      <p className="text-gray-600 text-xs sm:text-sm">{classItem.totalBooks} Books</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-xl sm:text-2xl font-bold text-blue-600">{issuedPercentage}%</div>
                      <p className="text-gray-500 text-xs">Distributed</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${issuedPercentage}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                    <div>
                      <p className="text-gray-600 text-xs mb-1">Issued</p>
                      <p className="font-bold text-sm sm:text-base text-blue-600">{classItem.issuedBooks}</p>
                    </div>
                    <div>
                      <p className="text-gray-600 text-xs mb-1">Available</p>
                      <p className="font-bold text-sm sm:text-base text-green-600">{classItem.availableBooks}</p>
                    </div>
                  </div>

                  <button className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm sm:text-base font-medium hover:bg-blue-100 active:bg-blue-200 transition">
                    View Details
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // STUDENT BOOKS VIEW
  const filteredData = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.rollNo.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || student.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const classBooksIssued = students.filter(s => s.status === 'issued').length;
  const classBooksPending = students.filter(s => s.status === 'pending').length;

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gray-50 min-h-screen">
      {/* Header with Back Button */}
      <div className="mb-6 sm:mb-8">
        <button
          onClick={() => {
            setSelectedClass(null);
            setSearchTerm('');
            setFilterStatus('all');
            setStudents([]);
            setBookInventory([]);
          }}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 active:text-blue-900 mb-3 sm:mb-4 font-medium text-sm sm:text-base transition"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Classes
        </button>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Class {selectedClass}</h1>
        <p className="text-xs sm:text-base text-gray-600">Book Distribution - {students.length} students</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm sm:text-base">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Total Students</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{students.length}</p>
          <p className="text-gray-500 text-xs mt-2">In this class</p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-green-500">
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Books Issued</p>
          <p className="text-2xl sm:text-3xl font-bold text-green-600">{classBooksIssued}</p>
          <p className="text-gray-500 text-xs mt-2">
            {students.length > 0 ? ((classBooksIssued / students.length) * 100).toFixed(1) : 0}% distributed
          </p>
        </div>

        <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-yellow-500">
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Pending</p>
          <p className="text-2xl sm:text-3xl font-bold text-yellow-600">{classBooksPending}</p>
          <p className="text-gray-500 text-xs mt-2">Awaiting distribution</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-white p-3 sm:p-6 rounded-lg shadow-sm mb-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 sm:top-3 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search by name or roll..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {['all', 'issued', 'pending'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium transition text-xs sm:text-sm ${filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 active:bg-gray-400'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-8 sm:py-12">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* Students and Books */}
      <div className="space-y-4 sm:space-y-6">
        {!loading && filteredData.length > 0 ? (
          filteredData.map((student) => {
            const selectableBooks = getSelectableBooksForStudent(student);
            const hasIssuableBooks = selectableBooks.length > 0;
            const issuedBooks = student.issuedBooks || [];
            const allBooksAlreadyIssued =
              bookInventory.length > 0 &&
              bookInventory.every((book) => !allowsRepeatIssue(book) && issuedBooks.includes(book.name));
            const selectedBookCount = selectableBooks.filter(
              (book) => studentBookState[`${student.id}-${book._id}`]
            ).length;
            const allSelectableBooksSelected =
              hasIssuableBooks && selectedBookCount === selectableBooks.length;
            const hasSelectionError =
              hasIssuableBooks && Boolean(issueFieldErrors[student.id]);
            const noIssuableBooksMessage = bookInventory.length === 0
              ? 'No books are available for this class.'
              : allBooksAlreadyIssued
                ? 'All books are already issued to this student.'
                : 'No books are currently available to issue.';

            return (
              <div key={student.id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
              {/* Student Header */}
              <div className="bg-gray-50 p-3 sm:p-6 border-b border-gray-200">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900">{student.name}</h3>
                      <p className="text-gray-600 text-xs sm:text-sm">Roll No: {student.rollNo}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(student.status)}`}>
                        {getStatusLabel(student.status)}
                      </span>
                      {student.issuedBooks.length > 0 && (
                        <p className="text-xs text-gray-600">
                          <span className="font-semibold">{student.issuedBooks.length}</span> books issued
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openStudentBookProfile(student)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => openStudentBookProfile(student, { issue: true })}
                          className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                        >
                          Issue
                        </button>
                      </div>
                    </div>
                  </div>

                  {student.issuedBooks.length > 0 && (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs font-semibold text-gray-600 mb-2">Currently Issued:</p>
                      <div className="flex flex-wrap gap-2">
                        {student.issuedBooks.map((book, idx) => (
                          <span key={idx} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {book}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Books Selection */}
              <div className="p-3 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                  <h4 className="font-semibold text-sm sm:text-base text-gray-900">Issue Books</h4>
                  {hasIssuableBooks && (
                    <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs sm:text-sm font-medium text-blue-700 transition hover:border-blue-400 hover:bg-blue-100">
                      <input
                        type="checkbox"
                        checked={allSelectableBooksSelected}
                        onChange={() => handleSelectAllBooks(student)}
                        className="w-4 h-4 cursor-pointer accent-blue-600"
                      />
                      <span>Select all ({selectedBookCount}/{selectableBooks.length})</span>
                    </label>
                  )}
                </div>
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-6 ${hasSelectionError ? 'rounded-lg border border-red-200 bg-red-50 p-2' : ''}`}
                  role="group"
                  aria-invalid={hasSelectionError}
                >
                  {bookInventory.map((book) => {
                    const isAlreadyIssued = !allowsRepeatIssue(book) && student.issuedBooks.includes(book.name);
                    const isSelected = studentBookState[`${student.id}-${book._id}`];
                    const outOfStock = book.availableStock <= 0;

                    return (
                      <label
                        key={book._id}
                        className={`flex items-start sm:items-center p-3 sm:p-4 border-2 rounded-lg cursor-pointer transition ${isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : isAlreadyIssued || outOfStock
                            ? 'border-gray-300 bg-gray-50 opacity-60 cursor-not-allowed'
                            : hasSelectionError
                              ? 'border-red-300 bg-red-50 hover:border-red-400 active:border-red-500'
                            : 'border-gray-200 hover:border-blue-300 bg-white active:border-blue-500'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected || false}
                          onChange={() => handleBookToggle(student.id, book._id)}
                          disabled={isAlreadyIssued || outOfStock}
                          className="w-4 h-4 cursor-pointer accent-blue-600 mt-0.5 sm:mt-0 shrink-0"
                        />
                        <div className="ml-2 sm:ml-3 flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-gray-900 truncate">{book.name}</p>
                          <p className="text-xs text-gray-600 truncate">{book.subject}</p>
                          {isDiaryItem(book) && (
                            <p className="mt-1 text-xs font-semibold text-purple-700">Diary - can be issued again</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Available: {book.availableStock}/{book.totalStock}
                          </p>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          {isAlreadyIssued && (
                            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Issued</span>
                          )}
                          {outOfStock && !isAlreadyIssued && (
                            <span className="text-xs text-red-500 font-medium whitespace-nowrap">Out</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {!hasIssuableBooks && (
                  <p className="mb-4 sm:mb-6 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs sm:text-sm text-gray-600">
                    {noIssuableBooksMessage}
                  </p>
                )}

                {hasIssuableBooks && issueFieldErrors[student.id] && (
                  <p className="mb-4 sm:mb-6 text-xs text-red-600">{issueFieldErrors[student.id]}</p>
                )}

                {hasIssuableBooks && (
                  <button
                    onClick={() => handleIssueBooks(student)}
                    disabled={loading}
                    className="w-full sm:w-auto bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 sm:px-6 rounded-lg transition flex items-center justify-center sm:justify-start gap-2 text-sm sm:text-base"
                  >
                    {loading && <Loader className="w-4 h-4 animate-spin" />}
                    Issue Items
                  </button>
                )}
              </div>
              </div>
            );
          })
        ) : !loading ? (
          <div className="bg-white p-8 sm:p-12 rounded-lg shadow-sm text-center border border-gray-200">
            <p className="text-gray-500 text-base sm:text-lg">No students found matching your search criteria.</p>
          </div>
        ) : null}
      </div>

      {/* Summary Footer */}
      {!loading && filteredData.length > 0 && (
        <div className="mt-6 bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600">
            Showing <span className="font-semibold">{filteredData.length}</span> of <span className="font-semibold">{students.length}</span> students
          </p>
        </div>
      )}
    </div>
  );
};

export default Books;
