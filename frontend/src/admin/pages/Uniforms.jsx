// frontend/src/admin/pages/Uniforms.jsx
import React, { useState, useEffect } from 'react';
import { Search, ChevronLeft, AlertCircle, Loader, Filter, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import {
  ClassCardShimmer,
} from '../components/ShimmerLoader';
import {
  getApiErrorMessage,
  validateUniformConditionForm,
  validateUniformIssueForm,
} from '../../lib/formValidation';
import GlobalUniformStudentSearch from '../components/uniforms/GlobalUniformStudentSearch';
import { getUniformSizePrice } from '../../lib/uniformPricing';

const initialIssueFormData = {
  uniforms: [{ itemName: '', size: '', quantity: 1 }]
};

const initialConditionFormData = {
  itemKey: '',
  itemName: '',
  size: '',
  condition: 'good'
};

const isSameId = (leftId, rightId) => String(leftId ?? '') === String(rightId ?? '');

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const normalizeClassSummaryRecord = (classItem = {}) => {
  const totalStudents = Number(
    classItem.students ?? classItem.totalStudents ?? classItem.studentCount ?? 0
  ) || 0;

  const uniformsIssued = Number(
    classItem.uniformsIssued ?? classItem.uniformsDistributed ?? classItem.uniformsFullyIssued ?? 0
  ) || 0;

  const uniformsPending = Number(
    classItem.uniformsPending ?? Math.max(totalStudents - uniformsIssued, 0)
  ) || 0;

  const uniformsPartial = Number(classItem.uniformsPartial ?? 0) || 0;

  return {
    ...classItem,
    students: totalStudents,
    uniformsIssued,
    uniformsPending,
    uniformsPartial,
    issuedPercentage:
      totalStudents > 0
        ? ((uniformsIssued / totalStudents) * 100).toFixed(1)
        : '0.0',
  };
};

const Uniforms = () => {
  const { token, axios, role } = useAuth();
  const { notify } = useNotifier();
  const [selectedClass, setSelectedClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  // State management
  const [classes, setClasses] = useState([]);
  const [uniformItems, setUniformItems] = useState([]);
  const [studentUniforms, setStudentUniforms] = useState([]);
  const [classStats, setClassStats] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showConditionModal, setShowConditionModal] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [classesLoading, setClassesLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [uniformsLoading, setUniformsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [issueLoading, setIssueLoading] = useState(false);

  // Form states
  const [issueFormData, setIssueFormData] = useState(initialIssueFormData);
  const [conditionFormData, setConditionFormData] = useState(initialConditionFormData);
  const [issueFormError, setIssueFormError] = useState('');
  const [conditionFormError, setConditionFormError] = useState('');
  const [issueFieldErrors, setIssueFieldErrors] = useState({});
  const [conditionFieldErrors, setConditionFieldErrors] = useState({});

  const clearIssueFieldError = (fieldName) => {
    setIssueFieldErrors((currentErrors) => {
      if (!currentErrors[fieldName]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
  };

  const clearConditionFieldError = (fieldName) => {
    setConditionFieldErrors((currentErrors) => {
      if (!currentErrors[fieldName]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
  };

  const getIssueInputStateClass = (fieldName) =>
    issueFieldErrors[fieldName]
      ? 'border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300 focus:ring-blue-500';

  const getConditionInputStateClass = (fieldName) =>
    conditionFieldErrors[fieldName]
      ? 'border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500'
      : 'border-gray-300 focus:ring-blue-500';

  const renderIssueFieldError = (fieldName) =>
    issueFieldErrors[fieldName] ? (
      <p className="mt-1 text-xs text-red-600">{issueFieldErrors[fieldName]}</p>
    ) : null;

  const renderConditionFieldError = (fieldName) =>
    conditionFieldErrors[fieldName] ? (
      <p className="mt-1 text-xs text-red-600">{conditionFieldErrors[fieldName]}</p>
    ) : null;

  // ============ API CALLS ============

  const getFallbackClassList = async () => {
    try {
      setClassesLoading(true);
      const response = await axios.get('/admin/classes', {
        headers: { token }
      });

      const fallbackClassList = response.data?.classes || response.data?.classSessions || response.data?.data || [];

      if (!Array.isArray(fallbackClassList)) {
        return [];
      }

      return fallbackClassList.map((classItem) =>
        normalizeClassSummaryRecord({
          ...classItem,
          uniformsIssued: 0,
          uniformsPending: Number(classItem.students ?? classItem.totalStudents ?? 0) || 0,
          uniformsPartial: 0,
        })
      );
    } catch (error) {
      console.error('Error fetching classes:', error);
      return [];
    } finally {
      setClassesLoading(false);
    }
  };

  const getAllUniformItems = async () => {
    try {
      setItemsLoading(true);
      const response = await axios.get('/admin/uniforms/items', {
        headers: { token }
      });
      setUniformItems(response.data.data || []);
    } catch (error) {
      console.error('Error fetching uniform items:', error);
      notify.error('Failed to load uniform items');
    } finally {
      setItemsLoading(false);
    }
  };

  const getStudentUniformsByClass = async (classId) => {
    try {
      setUniformsLoading(true);
      const response = await axios.get(`/admin/uniforms/class/${classId}`, {
        headers: { token }
      });
      setStudentUniforms(response.data.data || []);
    } catch (error) {
      console.error('Error fetching student uniforms:', error);
      notify.error('Failed to load student uniforms');
      setStudentUniforms([]);
    } finally {
      setUniformsLoading(false);
    }
  };

  const getClassUniformStats = async (classId) => {
    try {
      setStatsLoading(true);
      const response = await axios.get(`/admin/uniforms/stats/class/${classId}`, {
        headers: { token }
      });
      setClassStats(response.data.data || null);
    } catch (error) {
      console.error('Error fetching class stats:', error);
      notify.error('Failed to load class statistics');
    } finally {
      setStatsLoading(false);
    }
  };

  const getAllClassesWithUniformSummary = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/admin/uniforms/stats/all-classes', {
        headers: { token }
      });

      const summaryData = Array.isArray(response.data?.data)
        ? response.data.data.map((classItem) => normalizeClassSummaryRecord(classItem))
        : [];

      if (summaryData.length > 0) {
        setClasses(summaryData);
        return;
      }

      const fallbackClassList = await getFallbackClassList();
      setClasses(fallbackClassList);

      if (fallbackClassList.length === 0) {
        notify.warning('No class sessions available yet.');
      }
    } catch (error) {
      console.error('Error fetching classes:', error);

      const fallbackClassList = await getFallbackClassList();

      if (fallbackClassList.length > 0) {
        notify.warning('Loaded class list without uniform summary data.');
        setClasses(fallbackClassList);
      } else {
        notify.error('Failed to load classes');
        setClasses([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIssueUniform = async (e) => {
    e.preventDefault();
    setIssueFormError('');

    if (!selectedStudent) {
      setIssueFormError('Please select a student');
      return;
    }

    const { errors, payload } = validateUniformIssueForm(issueFormData, uniformItems);
    if (Object.keys(errors).length > 0) {
      setIssueFieldErrors(errors);
      return;
    }

    setIssueFieldErrors({});

    try {
      setIssueLoading(true);
      const classData = classes.find((classItem) => isSameId(classItem?._id, selectedClass));
      const classId = classData?._id;

      if (!classId) {
        setIssueFormError('Class ID not found');
        return;
      }

      await axios.post(
        '/admin/uniforms/issue',
        {
          studentId: selectedStudent.student?._id,
          classId: classId,
          uniforms: payload
        },
        {
          headers: { token }
        }
      );

      notify.success('Uniforms issued successfully. Payment is due.');
      setShowIssueModal(false);
      const invoiceStudent = selectedStudent;
      setSelectedStudent(null);
      setIssueFormData(initialIssueFormData);
      setIssueFormError('');
      setIssueFieldErrors({});

      if (classId) {
        getStudentUniformsByClass(classId);
        getClassUniformStats(classId);
      }
      openStudentUniformProfile(invoiceStudent);
    } catch (error) {
      console.error('Error issuing uniforms:', error);
      const apiMessage = getApiErrorMessage(error, 'Failed to issue uniforms');
      const lowerMessage = apiMessage.toLowerCase();

      if (lowerMessage.includes('item') || lowerMessage.includes('size') || lowerMessage.includes('quantity') || lowerMessage.includes('stock')) {
        setIssueFieldErrors({ uniforms: apiMessage });
        setIssueFormError('');
      } else {
        setIssueFormError(apiMessage);
      }
    } finally {
      setIssueLoading(false);
    }
  };

  const handleUpdateCondition = async (e) => {
    e.preventDefault();
    setConditionFormError('');

    if (!selectedStudent) {
      setConditionFormError('Please select a student');
      return;
    }

    const { errors, payload } = validateUniformConditionForm(conditionFormData);
    if (Object.keys(errors).length > 0) {
      setConditionFieldErrors(errors);
      return;
    }

    setConditionFieldErrors({});

    try {
      setIssueLoading(true);
      await axios.put(
        '/admin/uniforms/condition',
        {
          studentId: selectedStudent.student?._id || selectedStudent._id,
          itemName: payload.itemName,
          size: payload.size,
          condition: payload.condition
        },
        {
          headers: { token }
        }
      );

      notify.success('Uniform condition updated successfully');
      setShowConditionModal(false);
      setSelectedStudent(null);
      setConditionFormData(initialConditionFormData);
      setConditionFormError('');
      setConditionFieldErrors({});

      const classData = classes.find((classItem) => isSameId(classItem?._id, selectedClass));
      if (classData?._id) {
        getStudentUniformsByClass(classData._id);
      }
    } catch (error) {
      console.error('Error updating condition:', error);
      const apiMessage = getApiErrorMessage(error, 'Failed to update condition');
      const lowerMessage = apiMessage.toLowerCase();

      if (lowerMessage.includes('item')) {
        setConditionFieldErrors({ itemKey: apiMessage });
        setConditionFormError('');
      } else if (lowerMessage.includes('condition')) {
        setConditionFieldErrors({ condition: apiMessage });
        setConditionFormError('');
      } else {
        setConditionFormError(apiMessage);
      }
    } finally {
      setIssueLoading(false);
    }
  };

  // ============ LIFECYCLE ============

  useEffect(() => {
    if (token) {
      getAllClassesWithUniformSummary();
      getAllUniformItems();
    }
  }, [token]);

  useEffect(() => {
    if (selectedClass && classes.length > 0) {
      const classData = classes.find((classItem) => isSameId(classItem?._id, selectedClass));
      if (classData?._id) {
        getStudentUniformsByClass(classData._id);
        getClassUniformStats(classData._id);
      }
    }
  }, [selectedClass, classes]);

  useEffect(() => {
    setIssueFormError('');
    setConditionFormError('');
    setIssueFieldErrors({});
    setConditionFieldErrors({});
  }, [selectedStudent]);

  // ============ HELPER FUNCTIONS ============

  const getStatusColor = (status) => {
    switch (status) {
      case 'issued':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'damaged':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConditionColor = (condition) => {
    switch (condition) {
      case 'good':
        return 'bg-green-100 text-green-800';
      case 'worn':
        return 'bg-blue-100 text-blue-800';
      case 'damaged':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    const normalizedStatus = `${status || 'pending'}`.toLowerCase();
    return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
  };

  const getUniformStudentId = (studentUniformRecord) =>
    studentUniformRecord?.student?._id || studentUniformRecord?.student || studentUniformRecord?._id;

  const openStudentUniformProfile = (studentUniformRecord, { issue = false } = {}) => {
    const studentId = getUniformStudentId(studentUniformRecord);
    if (!studentId) {
      notify.error('Student ID not found');
      return;
    }

    navigate(`/admin/uniforms/student/${studentId}${issue ? '?issue=1' : ''}`);
  };

  // ============ CLASS VIEW ============

  if (!selectedClass) {
    // Calculate overall statistics
    let totalStudents = 0;
    let totalIssued = 0;
    let totalPending = 0;



    // Ensure classes is an array
    if (Array.isArray(classes) && classes.length > 0) {
      classes.forEach((classItem) => {
        const classStudentCount = Number(classItem.students) || 0;
        const classIssuedCount = Number(classItem.uniformsIssued) || 0;
        const classPendingCount = Number(classItem.uniformsPending) || 0;

        totalStudents += classStudentCount;
        totalIssued += classIssuedCount;
        totalPending += classPendingCount;
      });
    }

    const issuedPercentage = totalStudents > 0 ? ((totalIssued / totalStudents) * 100).toFixed(1) : 0;

    if (classesLoading || itemsLoading || loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-blue-600" />
        </div>
      );
    }

    return (
      <div className="p-3 sm:p-4 md:p-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Uniform Management</h1>
          <p className="text-xs sm:text-sm text-gray-600">Search a student first, or use class cards below for reporting</p>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <GlobalUniformStudentSearch
            onSelect={(student) => navigate(`/admin/uniforms/student/${student.id}`)}
          />
        </div>

        {/* Overall Summary - Responsive */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
            <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Total Students</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{totalStudents}</p>
            <p className="text-gray-500 text-xs mt-2">Across all classes</p>
          </div>

          <div className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm border-l-4 border-green-500">
            <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Uniforms Issued</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{totalIssued}</p>
            <p className="text-gray-500 text-xs mt-2">{issuedPercentage}% distributed</p>
          </div>

          <div className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm border-l-4 border-yellow-500 sm:col-span-2 lg:col-span-1">
            <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Pending</p>
            <p className="text-2xl sm:text-3xl font-bold text-yellow-600">{totalPending}</p>
            <p className="text-gray-500 text-xs mt-2">Awaiting distribution</p>
          </div>
        </div>

        {/* Inventory Overview - Responsive */}
        <div className="mb-6 md:mb-8">

          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              Uniform Items Inventory
            </h2>

            <button
              onClick={() => navigate("/admin/uniforms/inventory")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 
               bg-blue-600 text-white rounded-md 
               hover:bg-blue-700 transition 
               text-[11px] sm:text-xs font-medium"
            >
              Manage
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>


          {itemsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 animate-pulse">
                  <div className="h-5 bg-gray-200 rounded mb-3 w-3/4"></div>
                  <div className="h-2 bg-gray-200 rounded mb-3"></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-8 bg-gray-200 rounded"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                    <div className="h-8 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : uniformItems.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 text-center">
              <p className="text-sm sm:text-base text-gray-600">
                No uniform items in inventory yet.
              </p>
              <button
                onClick={() => navigate('/admin/uniforms/inventory')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                Open Inventory Manager
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {uniformItems.map((item) => {
                const available = item.totalStock - item.issued - item.damaged;
                const issuedPercentage =
                  item.totalStock > 0
                    ? ((item.issued / item.totalStock) * 100).toFixed(1)
                    : 0;

                return (
                  <div
                    key={item._id}
                    className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                          {item.name}
                        </h3>
                        <p className="text-gray-600 text-xs">
                          Total: {item.totalStock}
                        </p>
                      </div>
                      {available < 10 && available > 0 && (
                        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                      )}
                    </div>

                    <div className="mb-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{ width: `${issuedPercentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-600">Issued</p>
                        <p className="font-bold text-green-600">{item.issued}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Available</p>
                        <p className="font-bold text-blue-600">{available}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Damaged</p>
                        <p className="font-bold text-red-600">{item.damaged}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Classes Grid - Responsive */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 md:mb-4">Uniforms by Class</h2>

          {loading ? (
            <ClassCardShimmer />
          ) : !Array.isArray(classes) || classes.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-8 sm:p-12 text-center">
              <p className="text-gray-500 text-sm sm:text-base md:text-lg">
                {role === 'staff'
                  ? 'No class sessions are available yet. Please ask an administrator to create class sessions.'
                  : 'No class sessions found yet. Create class sessions first to manage uniforms.'}
              </p>
              {role !== 'staff' && (
                <button
                  onClick={() => navigate('/admin/classes')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  Go to Classes
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {classes.map((classItem) => {
                const students = classItem.students || 0;
                const issued = classItem.uniformsIssued || 0;
                const issuedPercentage = students > 0 ? ((issued / students) * 100).toFixed(1) : 0;

                return (
                  <div
                    key={classItem._id}
                    onClick={() => setSelectedClass(String(classItem._id))}
                    className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm hover:shadow-md transition cursor-pointer border border-gray-200 hover:border-blue-500"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{classItem.displayName || classItem.name}</h3>
                        <p className="text-gray-600 text-xs sm:text-sm">{students} Students</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl sm:text-2xl font-bold text-green-600">{issuedPercentage}%</div>
                        <p className="text-gray-500 text-xs">Distributed</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all"
                          style={{ width: `${issuedPercentage}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-gray-600 text-xs mb-1">Issued</p>
                        <p className="font-bold text-green-600 text-sm sm:text-base">{issued}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 text-xs mb-1">Pending</p>
                        <p className="font-bold text-yellow-600 text-sm sm:text-base">{(students - issued) || 0}</p>
                      </div>
                    </div>

                    <button className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 transition text-xs sm:text-sm">
                      View Details →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ STUDENT UNIFORMS VIEW ============

  const currentClass = classes.find((classItem) => isSameId(classItem?._id, selectedClass));
  const filteredData = studentUniforms.filter(student => {
    const studentName = `${student.student?.firstName || ''} ${student.student?.lastName || ''}`.toLowerCase();
    const matchesSearch = studentName.includes(searchTerm.toLowerCase()) ||
      (student.student?.studentId || '').includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || student.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const classUniformsIssued = studentUniforms.filter((studentUniform) => {
    const status = `${studentUniform.status || ''}`.toLowerCase();
    return status === 'issued' || status === 'partial';
  }).length;
  const classUniformsPending = Math.max(studentUniforms.length - classUniformsIssued, 0);
  //const classUniformsPartial = studentUniforms.filter(s => s.status === 'partial').length;

  if (uniformsLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // ============ STUDENT DETAILS MODAL ============
  const StudentUniformModal = ({ student, onClose }) => {
    if (!student) return null;

    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">

          {/* Modal Header */}
          <div className="bg-white border-b border-gray-200 p-4 sm:p-6 flex justify-between items-start sm:items-center gap-3 shrink-0">
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                {student.student?.firstName} {student.student?.lastName}
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">ID: {student.student?.studentId}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition shrink-0"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>

          {/* Modal Body - Scrollable */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">

            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-gray-600">Uniform Status:</span>
              <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(student.status)}`}>
                {getStatusLabel(student.status)}
              </span>
            </div>

            {/* Uniform Items */}
            <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Issued Uniforms</h3>
              {student.uniforms && student.uniforms.length > 0 ? (
                <div className="space-y-3">
                  {student.uniforms.map((uniform, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{uniform.itemName}</p>
                          <p className="text-xs text-gray-600">Size: {uniform.size}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getConditionColor(uniform.condition)}`}>
                          {uniform.condition}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-600">Quantity</p>
                          <p className="font-semibold">{uniform.quantity}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Issue Date</p>
                          <p className="font-semibold">{new Date(uniform.issueDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-gray-500 text-center py-4">No uniforms issued yet</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setSelectedStudent(student);
                  setIssueFormData(initialIssueFormData);
                  setIssueFormError('');
                  setIssueFieldErrors({});
                  setShowIssueModal(true);
                }}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition text-sm"
              >
                {student.status === 'pending' ? 'Issue Uniforms' : 'Issue More'}
              </button>
              {student.uniforms && student.uniforms.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedStudent(student);
                    setConditionFormData(initialConditionFormData);
                    setConditionFormError('');
                    setConditionFieldErrors({});
                    setShowConditionModal(true);
                  }}
                  className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-purple-700 transition text-sm"
                >
                  Update Condition
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-gray-50 min-h-screen">
      {/* Header with Back Button */}
      <div className="mb-6 md:mb-8">
        <button
          onClick={() => {
            setSelectedClass(null);
            setSearchTerm('');
            setFilterStatus('all');
            setClassStats(null);
          }}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-3 md:mb-4 font-medium text-sm"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Classes
        </button>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
          {currentClass?.displayName || currentClass?.name || "Class"} - Uniform Distribution
        </h1>
        <p className="text-xs sm:text-sm text-gray-600">{studentUniforms.length} students in this class</p>
      </div>

      {/* Summary Cards - Responsive */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Total Students</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{classStats?.totalStudents || studentUniforms.length}</p>
          <p className="text-gray-500 text-xs mt-2">In this class</p>
        </div>

        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm border-l-4 border-green-500">
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Issued</p>
          <p className="text-2xl sm:text-3xl font-bold text-green-600">{classUniformsIssued}</p>
          <p className="text-gray-500 text-xs mt-2">
            {studentUniforms.length > 0
              ? ((classUniformsIssued / studentUniforms.length) * 100).toFixed(1)
              : 0}% complete
          </p>
        </div>



        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-lg shadow-sm border-l-4 border-yellow-500">
          <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Pending</p>
          <p className="text-2xl sm:text-3xl font-bold text-yellow-600">{classUniformsPending}</p>
          <p className="text-gray-500 text-xs mt-2">Awaiting distribution</p>
        </div>
      </div>

      {/* Search and Filter - Responsive */}
      <div className="bg-white p-3 sm:p-4 md:p-6 rounded-lg shadow-sm mb-6">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 sm:top-3 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search by student name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Filter Button - Mobile */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="md:hidden flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition text-sm"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>

          {/* Filter Buttons - Desktop */}
          <div className="hidden md:flex gap-2 flex-wrap">
            {['all', 'issued', 'pending', 'partial'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition text-xs sm:text-sm ${filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Filter Buttons */}
        {showFilters && (
          <div className="md:hidden flex gap-2 flex-wrap mt-3 pt-3 border-t border-gray-200">
            {['all', 'issued', 'pending', 'partial'].map(status => (
              <button
                key={status}
                onClick={() => {
                  setFilterStatus(status);
                  setShowFilters(false);
                }}
                className={`px-3 py-2 rounded-lg font-medium transition text-xs ${filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Student Uniforms - Mobile Card View + Desktop Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3 p-3">
          {filteredData.length > 0 ? (
            filteredData.map((student) => (
              <div key={student._id} className="border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {student.student?.firstName} {student.student?.lastName}
                    </p>
                    <p className="text-xs text-gray-600">{student.student?.studentId}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(student.status)}`}>
                    {getStatusLabel(student.status)}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Uniforms:</span>
                    <span className="font-semibold">{student.uniforms?.length || 0} items</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Issue Date:</span>
                    <span className="font-semibold">
                      {student.uniforms?.[0]?.issueDate
                        ? new Date(student.uniforms[0].issueDate).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => openStudentUniformProfile(student)}
                  className="w-full mt-3 bg-blue-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  View Details
                </button>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 py-8 text-sm">No students found</p>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-4 md:px-6 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Student Name</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Student ID</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Uniforms Count</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Issue Date</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs md:text-sm font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((student) => (
                  <tr key={student._id} className="border-b border-gray-200 hover:bg-gray-50 transition">
                    <td className="px-4 md:px-6 py-4 text-xs md:text-sm font-medium text-gray-900">
                      {student.student?.firstName} {student.student?.lastName}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs md:text-sm text-gray-600">
                      {student.student?.studentId}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs md:text-sm text-gray-600">
                      {student.uniforms?.length || 0} items
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs md:text-sm">
                      <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(student.status)}`}>
                        {getStatusLabel(student.status)}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs md:text-sm text-gray-600">
                      {student.uniforms?.[0]?.issueDate
                        ? new Date(student.uniforms[0].issueDate).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 md:px-6 py-4 text-xs md:text-sm">
                      <button
                        onClick={() => openStudentUniformProfile(student)}
                        className="text-blue-600 hover:text-blue-800 font-medium transition mr-3"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openStudentUniformProfile(student, { issue: true })}
                        className="text-green-600 hover:text-green-800 font-medium transition"
                      >
                        Issue
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500 text-sm">
                    No students found matching your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Footer */}
      <div className="mt-4 md:mt-6 bg-white p-3 sm:p-4 md:p-6 rounded-lg shadow-sm">
        <p className="text-xs sm:text-sm text-gray-600">
          Showing <span className="font-semibold">{filteredData.length}</span> of{' '}
          <span className="font-semibold">{studentUniforms.length}</span> students
        </p>
      </div>

      {/* Student Details Modal */}
      <StudentUniformModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />

      {/* ============ ISSUE UNIFORM MODAL ============ */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">

            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center shrink-0 bg-white">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Issue Uniforms</h2>
              <button
                onClick={() => {
                  setShowIssueModal(false);
                  setSelectedStudent(null);
                  setIssueFormData(initialIssueFormData);
                  setIssueFormError('');
                  setIssueFieldErrors({});
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <form
              id="issue-uniform-form"
              onSubmit={handleIssueUniform}
              className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1"
            >
              {/* Student Info */}
              <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600">Student:</p>
                <p className="text-base sm:text-lg font-semibold text-gray-900">
                  {selectedStudent?.student?.firstName} {selectedStudent?.student?.lastName}
                </p>
                <p className="text-xs sm:text-sm text-gray-600">ID: {selectedStudent?.student?.studentId}</p>
              </div>

              {issueFormError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {issueFormError}
                </div>
              )}

              {/* Uniform Items */}
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Add Uniforms</h3>
                {renderIssueFieldError('uniforms')}
                <div className="space-y-3 sm:space-y-4">
                  {issueFormData.uniforms.map((uniform, index) => (
                    <div key={index} className="p-3 sm:p-4 border border-gray-200 rounded-lg space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Item Name */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Uniform Item
                          </label>
                          <select
                            value={uniform.itemName}
                            onChange={(e) => {
                              const newUniforms = [...issueFormData.uniforms];
                              newUniforms[index].itemName = e.target.value;
                              newUniforms[index].size = '';
                              setIssueFormError('');
                              clearIssueFieldError(`uniforms.${index}.itemName`);
                              clearIssueFieldError(`uniforms.${index}.size`);
                              clearIssueFieldError('uniforms');
                              setIssueFormData({ uniforms: newUniforms });
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getIssueInputStateClass(`uniforms.${index}.itemName`)}`}
                            aria-invalid={Boolean(issueFieldErrors[`uniforms.${index}.itemName`])}
                          >
                            <option value="">Select Item</option>
                            {uniformItems.map(item => (
                              <option key={item._id} value={item.name}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                          {renderIssueFieldError(`uniforms.${index}.itemName`)}
                        </div>

                        {/* Size */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Size
                          </label>
                          <select
                            value={uniform.size}
                            onChange={(e) => {
                              const newUniforms = [...issueFormData.uniforms];
                              newUniforms[index].size = e.target.value;
                              setIssueFormError('');
                              clearIssueFieldError(`uniforms.${index}.size`);
                              clearIssueFieldError('uniforms');
                              setIssueFormData({ uniforms: newUniforms });
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getIssueInputStateClass(`uniforms.${index}.size`)}`}
                            aria-invalid={Boolean(issueFieldErrors[`uniforms.${index}.size`])}
                          >
                            <option value="">Select Size</option>
                            {uniform.itemName && uniformItems
                              .find(item => item.name === uniform.itemName)
                              ?.sizes.map((sizeObj, idx) => (
                                <option key={idx} value={sizeObj.size}>
                                  {sizeObj.size} ({sizeObj.stock} available) - {formatCurrency(getUniformSizePrice(
                                    uniformItems.find(item => item.name === uniform.itemName),
                                    sizeObj
                                  ))}
                                </option>
                              ))}
                          </select>
                          {renderIssueFieldError(`uniforms.${index}.size`)}
                        </div>

                        {/* Quantity */}
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={uniform.quantity}
                            onChange={(e) => {
                              const newUniforms = [...issueFormData.uniforms];
                              newUniforms[index].quantity = parseInt(e.target.value) || 1;
                              setIssueFormError('');
                              clearIssueFieldError(`uniforms.${index}.quantity`);
                              clearIssueFieldError('uniforms');
                              setIssueFormData({ uniforms: newUniforms });
                            }}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getIssueInputStateClass(`uniforms.${index}.quantity`)}`}
                            aria-invalid={Boolean(issueFieldErrors[`uniforms.${index}.quantity`])}
                          />
                          {renderIssueFieldError(`uniforms.${index}.quantity`)}
                        </div>
                      </div>

                      {uniform.itemName && uniform.size && (
                        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs sm:text-sm font-medium text-gray-700">
                          Price for {uniform.size}: {formatCurrency(getUniformSizePrice(
                            uniformItems.find(item => item.name === uniform.itemName),
                            uniform.size
                          ))}
                        </p>
                      )}

                      {/* Remove Button */}
                      {issueFormData.uniforms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newUniforms = issueFormData.uniforms.filter((_, i) => i !== index);
                            setIssueFormError('');
                            setIssueFieldErrors((currentErrors) => {
                              const nextErrors = {};
                              let hasChanges = false;

                              Object.entries(currentErrors).forEach(([key, value]) => {
                                const match = key.match(/^uniforms\.(\d+)\.(itemName|size|quantity)$/);
                                if (!match) {
                                  nextErrors[key] = value;
                                  return;
                                }

                                const currentIndex = Number(match[1]);
                                const nestedField = match[2];

                                if (currentIndex === index) {
                                  hasChanges = true;
                                  return;
                                }

                                if (currentIndex > index) {
                                  nextErrors[`uniforms.${currentIndex - 1}.${nestedField}`] = value;
                                  hasChanges = true;
                                  return;
                                }

                                nextErrors[key] = value;
                              });

                              return hasChanges ? nextErrors : currentErrors;
                            });
                            setIssueFormData({ uniforms: newUniforms });
                          }}
                          className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium"
                        >
                          Remove This Item
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add More Button */}
                <button
                  type="button"
                  onClick={() => {
                    const newUniforms = [
                      ...issueFormData.uniforms,
                      { itemName: '', size: '', quantity: 1 }
                    ];
                    setIssueFormError('');
                    clearIssueFieldError('uniforms');
                    setIssueFormData({ uniforms: newUniforms });
                  }}
                  className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                >
                  + Add Another Item
                </button>
              </div>
            </form>

            {/* Submit and Cancel */}
            <div className="flex gap-3 justify-end p-4 sm:p-6 border-t border-gray-200 shrink-0 bg-white">
              <button
                type="button"
                onClick={() => {
                  setShowIssueModal(false);
                  setSelectedStudent(null);
                  setIssueFormData(initialIssueFormData);
                  setIssueFormError('');
                  setIssueFieldErrors({});
                }}
                className="px-4 sm:px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="issue-uniform-form"
                disabled={issueLoading}
                className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 text-sm"
              >
                {issueLoading ? 'Issuing...' : 'Issue Items'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ UPDATE CONDITION MODAL ============ */}
      {showConditionModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Update Condition</h2>
              <button
                onClick={() => {
                  setShowConditionModal(false);
                  setSelectedStudent(null);
                  setConditionFormData(initialConditionFormData);
                  setConditionFormError('');
                  setConditionFieldErrors({});
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateCondition} noValidate className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Student Info */}
              <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-600">Student:</p>
                <p className="text-base sm:text-lg font-semibold text-gray-900">
                  {selectedStudent?.student?.firstName} {selectedStudent?.student?.lastName}
                </p>
              </div>

              {conditionFormError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {conditionFormError}
                </div>
              )}

              {/* Uniform Item Selection */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Select Uniform Item
                </label>
                <select
                  value={conditionFormData.itemKey}
                  onChange={(e) => {
                    const selectedValue = e.target.value;
                    const [itemName = '', size = ''] = selectedValue.split('::');
                    setConditionFormError('');
                    clearConditionFieldError('itemKey');
                    setConditionFormData({
                      ...conditionFormData,
                      itemKey: selectedValue,
                      itemName,
                      size,
                    });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getConditionInputStateClass('itemKey')}`}
                  aria-invalid={Boolean(conditionFieldErrors.itemKey)}
                >
                  <option value="">Choose Item</option>
                  {selectedStudent?.uniforms?.map((uniform, idx) => (
                    <option key={idx} value={`${uniform.itemName}::${uniform.size}`}>
                      {uniform.itemName} - Size {uniform.size}
                    </option>
                  ))}
                </select>
                {renderConditionFieldError('itemKey')}
              </div>

              {/* Condition Selection */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Condition
                </label>
                <select
                  value={conditionFormData.condition}
                  onChange={(e) => {
                    setConditionFormError('');
                    clearConditionFieldError('condition');
                    setConditionFormData({ ...conditionFormData, condition: e.target.value });
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getConditionInputStateClass('condition')}`}
                  aria-invalid={Boolean(conditionFieldErrors.condition)}
                >
                  <option value="good">Good</option>
                  <option value="worn">Worn</option>
                  <option value="damaged">Damaged</option>
                </select>
                {renderConditionFieldError('condition')}
              </div>

              {/* Submit and Cancel */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowConditionModal(false);
                    setSelectedStudent(null);
                    setConditionFormData(initialConditionFormData);
                    setConditionFormError('');
                    setConditionFieldErrors({});
                  }}
                  className="px-4 sm:px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={issueLoading}
                  className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 text-sm"
                >
                  {issueLoading ? 'Updating...' : 'Update Condition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Uniforms;
