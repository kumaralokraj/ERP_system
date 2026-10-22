import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Edit2, Trash2, Loader, AlertCircle, ChevronDown, ChevronUp, BookOpen, ArrowLeft, X } from 'lucide-react';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import {
    getApiErrorMessage,
    validateBookInventoryForm,
} from '../../lib/formValidation';
import {
    GLOBAL_BOOK_CLASS_NAME,
    isDiaryItem,
} from '../../lib/bookInventory';

const BookInventory = () => {
    const { token, axios } = useAuth();
    const { notify, confirm } = useNotifier();
    const navigate = useNavigate();

    // State management
    const [booksByClass, setBooksByClass] = useState({});
    const [selectedClass, setSelectedClass] = useState(GLOBAL_BOOK_CLASS_NAME);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedItems, setExpandedItems] = useState(new Set());
    const [formError, setFormError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        subject: 'Diary',
        className: GLOBAL_BOOK_CLASS_NAME,
        itemType: 'diary',
        totalStock: 0,
        issuedCount: 0,
        damagedCount: 0,
        price: 0
    });

    const classes = [GLOBAL_BOOK_CLASS_NAME, 'Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

    const subjectSuggestions = [...new Set(
        Object.values(booksByClass)
            .flat()
            .map((book) => book.subject)
            .filter(Boolean)
    )].sort((firstSubject, secondSubject) => firstSubject.localeCompare(secondSubject));

    const clearFieldError = (fieldName) => {
        setFieldErrors((currentErrors) => {
            if (!currentErrors[fieldName]) {
                return currentErrors;
            }

            const nextErrors = { ...currentErrors };
            delete nextErrors[fieldName];
            return nextErrors;
        });
    };

    const getInputStateClass = (fieldName) =>
        fieldErrors[fieldName]
            ? 'border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500'
            : 'border-gray-300 focus:ring-blue-500';

    const renderFieldError = (fieldName) =>
        fieldErrors[fieldName] ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors[fieldName]}</p>
        ) : null;

    const setFormField = (fieldName, value) => {
        setFormError('');
        clearFieldError(fieldName);
        setFormData((currentFormData) => ({
            ...currentFormData,
            [fieldName]: value,
        }));
    };

    const handleClassSelect = (className) => {
        setSelectedClass(className);

        if (!editingId) {
            setFormData((currentFormData) => {
                const nextItemType = className === GLOBAL_BOOK_CLASS_NAME ? 'diary' : 'book';
                const shouldResetDiarySubject =
                    nextItemType === 'book' &&
                    currentFormData.itemType === 'diary' &&
                    currentFormData.subject === 'Diary';

                return {
                    ...currentFormData,
                    className,
                    itemType: nextItemType,
                    subject:
                        nextItemType === 'diary'
                            ? currentFormData.subject || 'Diary'
                            : shouldResetDiarySubject
                                ? ''
                                : currentFormData.subject,
                };
            });
            clearFieldError('className');
        }
    };

    // ============ API CALLS ============

    const getAllBooks = useCallback(async () => {
        try {
            setLoading(true);

            // Fetch all books from all classes
            const response = await axios.get('/admin/books/all', {
                headers: { token }
            });

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

            // Auto-select first class with books if current selection has none
            setSelectedClass((currentSelectedClass) => {
                if (currentSelectedClass === GLOBAL_BOOK_CLASS_NAME) {
                    return currentSelectedClass;
                }

                if (Object.keys(grouped).length > 0 && !grouped[currentSelectedClass]) {
                    return Object.keys(grouped)[0];
                }

                return currentSelectedClass;
            });
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
    }, [axios, notify, token]);

    const handleAddBook = async (e) => {
        e.preventDefault();
        setFormError('');

        const formDataToSubmit = editingId
            ? formData
            : {
                ...formData,
                className: selectedClass,
                itemType: selectedClass === GLOBAL_BOOK_CLASS_NAME ? 'diary' : 'book',
            };

        if (!editingId && formData.className !== selectedClass) {
            setFormData(formDataToSubmit);
        }

        const { errors, payload } = validateBookInventoryForm(formDataToSubmit);
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        setFieldErrors({});

        try {
            setLoading(true);

            if (editingId) {
                // Update existing book
                await axios.put(
                    `/admin/books/update/${editingId}`,
                    payload,
                    {
                        headers: { token }
                    }
                );
                notify.success(`${formIsDiary ? 'Diary' : 'Book'} updated successfully`);
            } else {
                // Create new book
                await axios.post(
                    '/admin/books/add',
                    payload,
                    {
                        headers: { token }
                    }
                );
                notify.success(`${formIsDiary ? 'Diary' : 'Book'} created successfully`);
            }

            // Reset form and refresh data
            resetForm();
            getAllBooks();
        } catch (error) {
            console.error('Error saving book:', error);
            const apiMessage = getApiErrorMessage(error, `Failed to save ${formIsDiary ? 'diary' : 'book'}`);
            const lowerMessage = apiMessage.toLowerCase();

            const fieldMappings = [
                { keyword: 'name', field: 'name' },
                { keyword: 'subject', field: 'subject' },
                { keyword: 'class', field: 'className' },
                { keyword: 'stock', field: 'totalStock' },
                { keyword: 'issued', field: 'issuedCount' },
                { keyword: 'damaged', field: 'damagedCount' },
                { keyword: 'price', field: 'price' },
            ];

            const mappedField = fieldMappings.find(({ keyword }) => lowerMessage.includes(keyword))?.field;

            if (mappedField) {
                setFieldErrors({ [mappedField]: apiMessage });
                setFormError('');
            } else {
                setFormError(apiMessage);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEditBook = (book) => {
        setFormData({
            name: book.name,
            subject: book.subject,
            className: book.className,
            itemType: isDiaryItem(book) ? 'diary' : 'book',
            totalStock: book.totalStock,
            issuedCount: book.issuedCount || 0,
            damagedCount: book.damagedCount || 0,
            price: book.price || 0
        });
        setEditingId(book._id);
        setShowForm(true);
        setFormError('');
        setFieldErrors({});
    };

    const handleDeleteBook = async (id) => {
        const shouldDelete = await confirm({
            title: 'Delete inventory item',
            message: 'Are you sure you want to delete this inventory item?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            tone: 'danger',
        });

        if (!shouldDelete) {
            return;
        }

        try {
            setLoading(true);
            await axios.delete(`/admin/books/delete/${id}`, {
                headers: { token }
            });
            notify.success('Inventory item deleted successfully');
            getAllBooks();
        } catch (error) {
            console.error('Error deleting book:', error);
            notify.error(error.response?.data?.message || 'Failed to delete book');
        } finally {
            setLoading(false);
        }
    };

    // ============ LIFECYCLE ============

    useEffect(() => {
        getAllBooks();
    }, [getAllBooks]);

    // ============ HELPER FUNCTIONS ============

    const toggleExpanded = (id) => {
        const newExpanded = new Set(expandedItems);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedItems(newExpanded);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            subject: selectedClass === GLOBAL_BOOK_CLASS_NAME ? 'Diary' : '',
            className: selectedClass,
            itemType: selectedClass === GLOBAL_BOOK_CLASS_NAME ? 'diary' : 'book',
            totalStock: 0,
            issuedCount: 0,
            damagedCount: 0,
            price: 0
        });
        setShowForm(false);
        setEditingId(null);
        setFormError('');
        setFieldErrors({});
    };

    // Get books for selected class
    const currentClassBooks = booksByClass[selectedClass] || [];
    const formClassName = editingId ? formData.className : selectedClass;
    const formIsDiary = formData.itemType === 'diary';
    const selectedClassLabel = selectedClass === GLOBAL_BOOK_CLASS_NAME ? 'All Students' : `Class ${selectedClass}`;

    // Filter books based on search
    const filteredBooks = currentClassBooks.filter(book => {
        const search = searchTerm.toLowerCase();
        return (
            (book.name?.toLowerCase() || '').includes(search) ||
            (book.subject?.toLowerCase() || '').includes(search)
        );
    });

    console.log("Filtered Books : ", filteredBooks);

    // Calculate overall statistics
    const allBooks = Object.values(booksByClass).flat();
    const totalBooks = allBooks.length;
    const totalStock = allBooks.reduce((sum, book) => sum + (book.totalStock || 0), 0);
    const totalIssued = allBooks.reduce((sum, book) => sum + (book.issuedCount || 0), 0);
    const totalDamaged = allBooks.reduce((sum, book) => sum + (book.damagedCount || 0), 0);

    // ============ RENDER ============

    if (loading && Object.keys(booksByClass).length === 0) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-6 sm:mb-8 lg:mb-10">
                <button
                    type="button"
                    onClick={() => navigate('/admin/books')}
                    className="mb-5 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Books
                </button>
                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                    <BookOpen className="w-6 sm:w-8 h-6 sm:h-8 text-blue-600 shrink-0" />
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
                        Book & Diary Inventory
                    </h1>
                </div>
                <p className="text-sm sm:text-base text-gray-600 mt-2">Manage class books and repeat-issuable diaries for all students</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8 lg:mb-10">
                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
                    <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Inventory Items</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">{totalBooks}</p>
                    <p className="text-gray-500 text-xs mt-2">Across all classes</p>
                </div>

                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-green-500">
                    <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Total Stock</p>
                    <p className="text-2xl sm:text-3xl font-bold text-green-600">{totalStock}</p>
                    <p className="text-gray-500 text-xs mt-2">Books in inventory</p>
                </div>

                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-yellow-500">
                    <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Issued</p>
                    <p className="text-2xl sm:text-3xl font-bold text-yellow-600">{totalIssued}</p>
                    <p className="text-gray-500 text-xs mt-2">Books distributed</p>
                </div>

                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border-l-4 border-red-500">
                    <p className="text-gray-600 text-xs sm:text-sm font-medium mb-2">Damaged</p>
                    <p className="text-2xl sm:text-3xl font-bold text-red-600">{totalDamaged}</p>
                    <p className="text-gray-500 text-xs mt-2">Books damaged</p>
                </div>
            </div>

            {/* Class Tabs */}
            {/* Class Tabs */}
            <div className="bg-white rounded-lg shadow-sm p-3 sm:p-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-0">
                    <span className="text-xs sm:text-sm font-medium text-gray-700">Inventory Scope:</span>
                    <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                        {classes.map(cls => {
                            const classBooks = booksByClass[cls] || [];
                            const hasBooks = classBooks.length > 0;

                            return (
                                <button
                                    type="button"
                                    key={cls}
                                    onClick={() => handleClassSelect(cls)}
                                    className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition whitespace-nowrap text-sm ${selectedClass === cls
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : hasBooks
                                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                        }`}
                                >
                                    {cls}
                                    {hasBooks && (
                                        <span className="ml-1 text-xs opacity-75">
                                            ({classBooks.length})
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Class Summary for Selected Class */}
            <div className="bg-linear-to-r from-blue-50 to-purple-50 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 border border-blue-100">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">
                    {selectedClassLabel} - Inventory Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white bg-opacity-50 p-3 sm:p-4 rounded-lg">
                        <p className="text-gray-600 text-xs sm:text-sm">Items</p>
                        <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{currentClassBooks.length}</p>
                    </div>
                    <div className="bg-white bg-opacity-50 p-3 sm:p-4 rounded-lg">
                        <p className="text-gray-600 text-xs sm:text-sm">Total Stock</p>
                        <p className="text-xl sm:text-2xl font-bold text-green-600 mt-1">
                            {currentClassBooks.reduce((sum, book) => sum + (book.totalStock || 0), 0)}
                        </p>
                    </div>
                    <div className="bg-white bg-opacity-50 p-3 sm:p-4 rounded-lg">
                        <p className="text-gray-600 text-xs sm:text-sm">Issued</p>
                        <p className="text-xl sm:text-2xl font-bold text-yellow-600 mt-1">
                            {currentClassBooks.reduce((sum, book) => sum + (book.issuedCount || 0), 0)}
                        </p>
                    </div>
                    <div className="bg-white bg-opacity-50 p-3 sm:p-4 rounded-lg">
                        <p className="text-gray-600 text-xs sm:text-sm">Available</p>
                        <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">
                            {currentClassBooks.reduce((sum, book) => {
                                const available = book.totalStock - (book.issuedCount || 0) - (book.damagedCount || 0);
                                return sum + available;
                            }, 0)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Add Form Button */}
            {!showForm && (
                <div className="mb-6 sm:mb-8">
                    <button
                        type="button"
                        onClick={() => {
                            setFormData({
                                ...formData,
                                className: selectedClass,
                                itemType: selectedClass === GLOBAL_BOOK_CLASS_NAME ? 'diary' : 'book',
                                subject:
                                    selectedClass === GLOBAL_BOOK_CLASS_NAME
                                        ? formData.subject || 'Diary'
                                        : formData.subject,
                            });
                            setFormError('');
                            setFieldErrors({});
                            setShowForm(true);
                        }}
                        className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm sm:text-base"
                    >
                        <Plus className="w-4 sm:w-5 h-4 sm:h-5 shrink-0" />
                        <span>
                            {selectedClass === GLOBAL_BOOK_CLASS_NAME
                                ? 'Add Diary for All Students'
                                : `Add Book to Class ${selectedClass}`}
                        </span>
                    </button>
                </div>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <div className={editingId ? 'fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-6 backdrop-blur-sm' : ''}>
                    <div className={editingId ? 'mx-auto my-4 w-full max-w-4xl rounded-lg border border-gray-200 bg-white p-4 shadow-xl sm:p-6' : 'bg-white rounded-lg shadow-sm p-4 sm:p-6 mb-8 border border-gray-200'}>
                    <div className="mb-4 flex items-start justify-between gap-4 sm:mb-6">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                            {editingId
                                ? `Edit ${formIsDiary ? 'Diary' : 'Book'}`
                                : formIsDiary
                                    ? 'Add New Diary for All Students'
                                    : `Add New Book to Class ${formClassName}`}
                        </h2>
                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                                aria-label="Close edit book"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleAddBook} noValidate className="space-y-6">
                        {formError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {formError}
                            </div>
                        )}

                        {formIsDiary && (
                            <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
                                Diaries are available to every student, may be issued repeatedly to the same student, and are not returned.
                            </div>
                        )}

                        {/* Basic Information */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {formIsDiary ? 'Diary Name' : 'Book Name'} *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormField('name', e.target.value)}
                                    placeholder={formIsDiary ? 'Enter diary name' : 'Enter book name'}
                                    className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass('name')}`}
                                    aria-invalid={Boolean(fieldErrors.name)}
                                    required
                                />
                                {renderFieldError('name')}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {formIsDiary ? 'Category' : 'Subject'} *
                                </label>
                                <input
                                    type="text"
                                    value={formData.subject}
                                    onChange={(e) => setFormField('subject', e.target.value)}
                                    list="book-subject-suggestions"
                                    placeholder={formIsDiary ? 'Diary' : 'Enter subject'}
                                    className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass('subject')}`}
                                    aria-invalid={Boolean(fieldErrors.subject)}
                                    required
                                />
                                <datalist id="book-subject-suggestions">
                                    {subjectSuggestions.map((subject) => (
                                        <option key={subject} value={subject} />
                                    ))}
                                </datalist>
                                {renderFieldError('subject')}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Available To *
                                </label>
                                <input
                                    type="text"
                                    value={formClassName}
                                    readOnly
                                    className={`w-full px-3 sm:px-4 py-2 border rounded-lg bg-gray-100 cursor-not-allowed text-sm ${getInputStateClass('className')}`}
                                    aria-invalid={Boolean(fieldErrors.className)}
                                />
                                {renderFieldError('className')}
                                {formIsDiary && (
                                    <p className="mt-1 text-xs text-purple-700">This diary appears for students in every class.</p>
                                )}
                            </div>

                            {/* Price */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Price (₹)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.price}
                                    onChange={(e) => setFormField('price', parseFloat(e.target.value) || 0)}
                                    placeholder="0.00"
                                    className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass('price')}`}
                                    aria-invalid={Boolean(fieldErrors.price)}
                                />
                                {renderFieldError('price')}
                            </div>
                        </div>

                        {/* Stock Information */}
                        <div className="border-t border-gray-200 pt-6">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Stock Information</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                                {/* Total Stock */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Total Stock *
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.totalStock}
                                        onChange={(e) => setFormField('totalStock', parseInt(e.target.value) || 0)}
                                        placeholder="0"
                                        className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass('totalStock')}`}
                                        aria-invalid={Boolean(fieldErrors.totalStock)}
                                        required
                                    />
                                    {renderFieldError('totalStock')}
                                </div>

                                {/* Issued Count */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Issued Count
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.issuedCount}
                                        onChange={(e) => setFormField('issuedCount', parseInt(e.target.value) || 0)}
                                        placeholder="0"
                                        className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass('issuedCount')}`}
                                        aria-invalid={Boolean(fieldErrors.issuedCount)}
                                    />
                                    {renderFieldError('issuedCount')}
                                </div>

                                {/* Damaged Count */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Damaged Count
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.damagedCount}
                                        onChange={(e) => setFormField('damagedCount', parseInt(e.target.value) || 0)}
                                        placeholder="0"
                                        className={`w-full px-3 sm:px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass('damagedCount')}`}
                                        aria-invalid={Boolean(fieldErrors.damagedCount)}
                                    />
                                    {renderFieldError('damagedCount')}
                                </div>
                            </div>
                        </div>

                        {/* Form Actions */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 sm:px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 text-sm"
                            >
                                {loading
                                    ? 'Saving...'
                                    : editingId
                                        ? `Update ${formIsDiary ? 'Diary' : 'Book'}`
                                        : `Add ${formIsDiary ? 'Diary' : 'Book'}`}
                            </button>
                        </div>
                    </form>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm mb-6">
                <div className="flex items-center gap-2">
                    <Search className="w-4 sm:w-5 h-4 sm:h-5 text-gray-400 shrink-0" />
                    <input
                        type="text"
                        placeholder="Search inventory by name or subject..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 outline-none text-gray-700 text-sm bg-transparent"
                    />
                </div>
            </div>

            {/* Books List */}
            <div className="space-y-4 sm:space-y-6">
                {filteredBooks.length > 0 ? (
                    filteredBooks.map(book => {
                        const available = book.availableStock || (book.totalStock - (book.issuedCount || 0) - (book.damagedCount || 0));
                        const isExpanded = expandedItems.has(book._id);
                        const stockPercentage = book.totalStock > 0 ? (available / book.totalStock) * 100 : 0;

                        return (
                            <div key={book._id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                {/* Book Header */}
                                <div className="p-4 sm:p-6">
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                                                <h3 className="text-lg sm:text-xl font-bold text-gray-900 wrap-break-word">{book.name}</h3>
                                                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full whitespace-nowrap">
                                                    {book.subject}
                                                </span>
                                                {isDiaryItem(book) && (
                                                    <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full whitespace-nowrap">
                                                        Diary - All Students - Repeat Issue
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-2 sm:gap-3 items-center shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(book._id)}
                                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                                                title={isExpanded ? 'Collapse' : 'Expand'}
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="w-4 sm:w-5 h-4 sm:h-5 text-gray-600" />
                                                ) : (
                                                    <ChevronDown className="w-4 sm:w-5 h-4 sm:h-5 text-gray-600" />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleEditBook(book)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-4 sm:w-5 h-4 sm:h-5" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleDeleteBook(book._id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 sm:w-5 h-4 sm:h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Summary Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
                                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                                            <p className="text-gray-600 text-xs font-medium">Total Stock</p>
                                            <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{book.totalStock}</p>
                                        </div>
                                        <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                                            <p className="text-gray-600 text-xs font-medium">
                                                {isDiaryItem(book) ? 'Distributed' : 'Issued'}
                                            </p>
                                            <p className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">{book.issuedCount || 0}</p>
                                        </div>
                                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                                            <p className="text-gray-600 text-xs font-medium">Available</p>
                                            <p className="text-xl sm:text-2xl font-bold text-green-600 mt-1">{available}</p>
                                        </div>
                                        <div className="bg-red-50 p-3 sm:p-4 rounded-lg">
                                            <p className="text-gray-600 text-xs font-medium">Damaged</p>
                                            <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1">{book.damagedCount || 0}</p>
                                        </div>
                                    </div>

                                    {/* Stock Progress Bar */}
                                    <div className="mt-4">
                                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                                            <span>Stock Status</span>
                                            <span>{stockPercentage.toFixed(0)}% Available</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className={`h-2 rounded-full transition-all ${stockPercentage > 50
                                                    ? 'bg-green-500'
                                                    : stockPercentage > 20
                                                        ? 'bg-yellow-500'
                                                        : 'bg-red-500'
                                                    }`}
                                                style={{ width: `${stockPercentage}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Low Stock Alert */}
                                    {available < 10 && available > 0 && (
                                        <div className="mt-4 p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-start sm:items-center gap-2">
                                            <AlertCircle className="w-4 sm:w-5 h-4 sm:h-5 text-orange-600 shrink-0 mt-0.5 sm:mt-0" />
                                            <p className="text-orange-800 text-xs sm:text-sm font-medium">
                                                Low stock alert: Only {available} books available
                                            </p>
                                        </div>
                                    )}

                                    {available === 0 && (
                                        <div className="mt-4 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg flex items-start sm:items-center gap-2">
                                            <AlertCircle className="w-4 sm:w-5 h-4 sm:h-5 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
                                            <p className="text-red-800 text-xs sm:text-sm font-medium">
                                                Out of stock - Please reorder
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Expandable Book Details */}
                                {isExpanded && (
                                    <div className="border-t border-gray-200 bg-gray-50 p-4 sm:p-6">
                                        <h4 className="font-bold text-gray-900 mb-4 text-sm sm:text-base">Inventory Details</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                            {book.price > 0 && (
                                                <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
                                                    <p className="text-gray-600 text-xs font-medium">Price</p>
                                                    <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-1">₹{book.price.toFixed(2)}</p>
                                                </div>
                                            )}
                                            {book.createdAt && (
                                                <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
                                                    <p className="text-gray-600 text-xs font-medium">Added On</p>
                                                    <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-1">
                                                        {new Date(book.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            )}
                                            {book.updatedAt && (
                                                <div className="bg-white p-3 sm:p-4 rounded-lg border border-gray-200">
                                                    <p className="text-gray-600 text-xs font-medium">Last Updated</p>
                                                    <p className="text-xs sm:text-sm font-semibold text-gray-900 mt-1">
                                                        {new Date(book.updatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="bg-white rounded-lg shadow-sm p-8 sm:p-12 text-center">
                        <BookOpen className="w-12 sm:w-16 h-12 sm:h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 text-base sm:text-lg">
                            {currentClassBooks.length === 0
                                ? selectedClass === GLOBAL_BOOK_CLASS_NAME
                                    ? 'No diary has been added yet. Add a diary to make it available to every student.'
                                    : `No books added for Class ${selectedClass} yet. Add your first book to get started!`
                                : 'No matching inventory items found'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookInventory;
