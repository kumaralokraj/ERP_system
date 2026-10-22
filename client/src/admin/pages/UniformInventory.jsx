// frontend/src/admin/pages/UniformInventory.jsx
import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Loader, AlertCircle, ChevronDown, ChevronUp, ArrowLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/authContext/AuthContext';
import { useNotifier } from '../../context/notificationContext/NotificationContext';
import {
    getApiErrorMessage,
    validateUniformInventoryForm,
} from '../../lib/formValidation';
import {
    calculateUniformStockValue,
    getUniformPriceSummary,
    getUniformSizePrice,
} from '../../lib/uniformPricing';

const UniformInventory = () => {
    const { token, axios } = useAuth();
    const { notify, confirm } = useNotifier();
    const navigate = useNavigate();

    // State management
    const [uniformItems, setUniformItems] = useState([]);
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
        sizes: [{ size: '', stock: 0, pricePerItem: 0 }],
        totalStock: 0,
        description: '',
        reorderLevel: 20
    });

    const uniformNameSuggestions = [...new Set(
        uniformItems
            .map((item) => item.name)
            .filter(Boolean)
    )].sort((firstName, secondName) => firstName.localeCompare(secondName));

    const selectedItemSizeSuggestions = formData.name
        ? [...new Set(
            (uniformItems.find(
                (item) => item.name?.toLowerCase() === formData.name.trim().toLowerCase()
            )?.sizes || [])
                .map((sizeItem) => sizeItem.size)
                .filter(Boolean)
        )].sort((firstSize, secondSize) => firstSize.localeCompare(secondSize))
        : [];

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

    // ============ API CALLS ============

    const getAllUniformItems = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/admin/uniforms/items', {
                headers: { token }
            });
            setUniformItems(response.data.data || []);
        } catch (error) {
            console.error('Error fetching uniform items:', error);
            notify.error('Failed to load uniform items');
        } finally {
            setLoading(false);
        }
    };

    const handleAddUniformItem = async (e) => {
        e.preventDefault();
        setFormError('');

        const validatedForm = validateUniformInventoryForm(formData);
        if (Object.keys(validatedForm.errors).length > 0) {
            setFieldErrors(validatedForm.errors);
            return;
        }

        setFieldErrors({});

        try {
            setLoading(true);

            // ✅ PROPERLY FORMAT THE PAYLOAD
            const payload = {
                name: validatedForm.payload.name,
                sizes: validatedForm.payload.sizes,
                totalStock: validatedForm.payload.totalStock,
                description: validatedForm.payload.description,
                reorderLevel: validatedForm.payload.reorderLevel
            };

            console.log('Sending payload:', JSON.stringify(payload, null, 2));

            if (editingId) {
                // Update existing item
                await axios.put(
                    `/admin/uniforms/items/${editingId}`,
                    payload,
                    {
                        headers: {token}
                    }
                );
                notify.success('Uniform item updated successfully');
            } else {
                // Create new item
                const response = await axios.post(
                    '/admin/uniforms/items',
                    payload,
                    {
                        headers: {token}
                    }
                );
                console.log('Create response:', response);
                notify.success('Uniform item created successfully');
            }

            // Reset form and refresh data
            setFormData({
                name: '',
                sizes: [{ size: '', stock: 0, pricePerItem: 0 }],
                totalStock: 0,
                description: '',
                reorderLevel: 20
            });
            setShowForm(false);
            setEditingId(null);
            setFormError('');
            setFieldErrors({});
            getAllUniformItems();
        } catch (error) {
            console.error('Error saving uniform item:', error);
            const apiMessage = getApiErrorMessage(error, 'Failed to save uniform item');
            const lowerMessage = apiMessage.toLowerCase();

            const fieldMappings = [
                { keyword: 'name', field: 'name' },
                { keyword: 'size', field: 'sizes' },
                { keyword: 'stock', field: 'sizes' },
                { keyword: 'price', field: 'sizes' },
                { keyword: 'reorder', field: 'reorderLevel' },
                { keyword: 'description', field: 'description' },
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

    const handleEditItem = (item) => {
        setFormData({
            name: item.name,
            sizes: item.sizes?.map((sizeItem) => ({
                ...sizeItem,
                pricePerItem: getUniformSizePrice(item, sizeItem),
            })) || [{ size: '', stock: 0, pricePerItem: 0 }],
            totalStock: item.totalStock,
            description: item.description || '',
            reorderLevel: item.reorderLevel || 20
        });
        setEditingId(item._id);
        setShowForm(true);
        setFormError('');
        setFieldErrors({});
    };

    const handleDeleteItem = async (id) => {
        const shouldDelete = await confirm({
            title: 'Delete uniform item',
            message: 'Are you sure you want to delete this uniform item?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            tone: 'danger',
        });

        if (!shouldDelete) {
            return;
        }

        try {
            setLoading(true);
            await axios.delete(`/admin/uniforms/items/${id}`, {
                headers: {token}
            });
            notify.success('Uniform item deleted successfully');
            getAllUniformItems();
        } catch (error) {
            console.error('Error deleting uniform item:', error);
            notify.error(error.response?.data?.message || 'Failed to delete uniform item');
        } finally {
            setLoading(false);
        }
    };

    // ============ LIFECYCLE ============

    useEffect(() => {
        getAllUniformItems();
    }, [token]);

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

    const handleSizeChange = (index, field, value) => {
        const newSizes = [...formData.sizes];
        newSizes[index][field] =
            field === 'stock'
                ? parseInt(value) || 0
                : field === 'pricePerItem'
                    ? parseFloat(value) || 0
                    : value;
        setFormError('');
        clearFieldError(`sizes.${index}.${field}`);
        clearFieldError('sizes');
        setFormData({ ...formData, sizes: newSizes });
    };

    const addSizeField = () => {
        setFormError('');
        clearFieldError('sizes');
        setFormData({
            ...formData,
            sizes: [...formData.sizes, { size: '', stock: 0, pricePerItem: 0 }]
        });
    };

    const removeSizeField = (index) => {
        const newSizes = formData.sizes.filter((_, i) => i !== index);
        setFormError('');
        setFieldErrors((currentErrors) => {
            const nextErrors = {};
            let hasChanges = false;

            Object.entries(currentErrors).forEach(([key, value]) => {
                const match = key.match(/^sizes\.(\d+)\.(size|stock|pricePerItem)$/);
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
                    nextErrors[`sizes.${currentIndex - 1}.${nestedField}`] = value;
                    hasChanges = true;
                    return;
                }

                nextErrors[key] = value;
            });

            return hasChanges ? nextErrors : currentErrors;
        });
        setFormData({ ...formData, sizes: newSizes.length > 0 ? newSizes : [{ size: '', stock: 0, pricePerItem: 0 }] });
    };

    const resetForm = () => {
        setFormData({
            name: '',
            sizes: [{ size: '', stock: 0, pricePerItem: 0 }],
            totalStock: 0,
            description: '',
            reorderLevel: 20
        });
        setShowForm(false);
        setEditingId(null);
        setFormError('');
        setFieldErrors({});
    };

    // Filter items based on search
    const filteredItems = uniformItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const formatCurrency = (value) =>
        Number(value || 0).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    const totalInventoryValue = uniformItems.reduce(
        (sum, item) => sum + calculateUniformStockValue(item),
        0
    );
    const formatPriceRange = (item) => {
        const { minPrice, maxPrice, hasVariablePrices } = getUniformPriceSummary(item);
        return hasVariablePrices
            ? `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`
            : formatCurrency(minPrice);
    };

    // ============ RENDER ============

    if (loading && uniformItems.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <button
                    type="button"
                    onClick={() => navigate('/admin/uniforms')}
                    className="mb-5 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Uniforms
                </button>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Uniform Inventory Management</h1>
                <p className="text-gray-600">Add and manage school uniform items and stock</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
                    <p className="text-gray-600 text-sm font-medium mb-2">Total Items</p>
                    <p className="text-3xl font-bold text-gray-900">{uniformItems.length}</p>
                    <p className="text-gray-500 text-xs mt-2">Uniform types</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
                    <p className="text-gray-600 text-sm font-medium mb-2">Total Stock</p>
                    <p className="text-3xl font-bold text-green-600">
                        {uniformItems.reduce((sum, item) => sum + (item.totalStock || 0), 0)}
                    </p>
                    <p className="text-gray-500 text-xs mt-2">Units in inventory</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-purple-500">
                    <p className="text-gray-600 text-sm font-medium mb-2">Stock Value</p>
                    <p className="break-words text-2xl font-bold text-purple-600">{formatCurrency(totalInventoryValue)}</p>
                    <p className="text-gray-500 text-xs mt-2">Based on size prices</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-yellow-500">
                    <p className="text-gray-600 text-sm font-medium mb-2">Issued</p>
                    <p className="text-3xl font-bold text-yellow-600">
                        {uniformItems.reduce((sum, item) => sum + (item.issued || 0), 0)}
                    </p>
                    <p className="text-gray-500 text-xs mt-2">Units distributed</p>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
                    <p className="text-gray-600 text-sm font-medium mb-2">Damaged</p>
                    <p className="text-3xl font-bold text-red-600">
                        {uniformItems.reduce((sum, item) => sum + (item.damaged || 0), 0)}
                    </p>
                    <p className="text-gray-500 text-xs mt-2">Units damaged</p>
                </div>
            </div>

            {/* Add Form Button */}
            {!showForm && (
                <div className="mb-6">
                    <button
                        type="button"
                        onClick={() => {
                            setFormError('');
                            setFieldErrors({});
                            setShowForm(true);
                        }}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                    >
                        <Plus className="w-5 h-5" />
                        Add Uniform Item
                    </button>
                </div>
            )}

            {/* Add/Edit Form */}
            {showForm && (
                <div className={editingId ? 'fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-6 backdrop-blur-sm' : ''}>
                    <div className={editingId ? 'mx-auto my-4 w-full max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl' : 'bg-white rounded-lg shadow-sm p-6 mb-8 border border-gray-200'}>
                    <div className="mb-6 flex items-start justify-between gap-4">
                        <h2 className="text-2xl font-bold text-gray-900">
                            {editingId ? 'Edit Uniform Item' : 'Add New Uniform Item'}
                        </h2>
                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                                aria-label="Close edit uniform item"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        )}
                    </div>

                    <form onSubmit={handleAddUniformItem} className="space-y-6">
                        {formError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {formError}
                            </div>
                        )}

                        {/* Item Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Uniform Item Name *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormField('name', e.target.value)}
                                list="uniform-name-suggestions"
                                placeholder="Enter uniform item name"
                                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${getInputStateClass('name')}`}
                                aria-invalid={Boolean(fieldErrors.name)}
                            />
                            <datalist id="uniform-name-suggestions">
                                {uniformNameSuggestions.map((name) => (
                                    <option key={name} value={name} />
                                ))}
                            </datalist>
                            {renderFieldError('name')}
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Description
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormField('description', e.target.value)}
                                placeholder="Enter item description"
                                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 resize-none ${getInputStateClass('description')}`}
                                aria-invalid={Boolean(fieldErrors.description)}
                                rows="3"
                            />
                            {renderFieldError('description')}
                        </div>

                        {/* Sizes Section */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <label className="block text-sm font-medium text-gray-700">
                                    Sizes & Stock *
                                </label>
                                <button
                                    type="button"
                                    onClick={addSizeField}
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                    + Add Size
                                </button>
                            </div>

                            {renderFieldError('sizes')}

                            <div className="space-y-3">
                                {formData.sizes.map((sizeObj, index) => (
                                    <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                                        {/* Size */}
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Size
                                            </label>
                                            <input
                                                type="text"
                                                value={sizeObj.size}
                                                onChange={(e) => handleSizeChange(index, 'size', e.target.value)}
                                                list="uniform-size-suggestions"
                                                placeholder="Enter size"
                                                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass(`sizes.${index}.size`)}`}
                                                aria-invalid={Boolean(fieldErrors[`sizes.${index}.size`])}
                                            />
                                            {renderFieldError(`sizes.${index}.size`)}
                                        </div>

                                        {/* Price */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Price (INR)
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={sizeObj.pricePerItem}
                                                onChange={(e) => handleSizeChange(index, 'pricePerItem', e.target.value)}
                                                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass(`sizes.${index}.pricePerItem`)}`}
                                                aria-invalid={Boolean(fieldErrors[`sizes.${index}.pricePerItem`])}
                                                placeholder="0.00"
                                            />
                                            {renderFieldError(`sizes.${index}.pricePerItem`)}
                                        </div>

                                        {/* Stock */}
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Stock
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={sizeObj.stock}
                                                onChange={(e) => handleSizeChange(index, 'stock', e.target.value)}
                                                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 text-sm ${getInputStateClass(`sizes.${index}.stock`)}`}
                                                aria-invalid={Boolean(fieldErrors[`sizes.${index}.stock`])}
                                                placeholder="0"
                                            />
                                            {renderFieldError(`sizes.${index}.stock`)}
                                        </div>

                                        {/* Remove Button */}
                                        {formData.sizes.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeSizeField(index)}
                                                className="px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <datalist id="uniform-size-suggestions">
                                {selectedItemSizeSuggestions.map((size) => (
                                    <option key={size} value={size} />
                                ))}
                            </datalist>
                        </div>

                        {/* Reorder Level */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Reorder Level
                            </label>
                            <input
                                type="number"
                                min="0"
                                value={formData.reorderLevel}
                                onChange={(e) => setFormField('reorderLevel', parseInt(e.target.value) || 0)}
                                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${getInputStateClass('reorderLevel')}`}
                                aria-invalid={Boolean(fieldErrors.reorderLevel)}
                                placeholder="20"
                            />
                            {renderFieldError('reorderLevel')}
                            <p className="text-xs text-gray-500 mt-1">Alert when stock falls below this level</p>
                        </div>

                        {/* Form Actions */}
                        <div className="flex gap-3 pt-6 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : editingId ? 'Update Item' : 'Add Item'}
                            </button>
                        </div>
                    </form>
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
                <div className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search uniform items..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="flex-1 outline-none text-gray-700"
                    />
                </div>
            </div>

            {/* Uniform Items List */}
            <div className="space-y-4">
                {filteredItems.length > 0 ? (
                    filteredItems.map(item => {
                        const available = item.totalStock - (item.issued || 0) - (item.damaged || 0);
                        const isExpanded = expandedItems.has(item._id);

                        return (
                            <div key={item._id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                {/* Item Header */}
                                <div className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <h3 className="text-xl font-bold text-gray-900">{item.name}</h3>
                                            {item.description && (
                                                <p className="text-gray-600 text-sm mt-1">{item.description}</p>
                                            )}
                                        </div>

                                        <div className="flex gap-3 items-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleExpanded(item._id)}
                                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="w-5 h-5 text-gray-600" />
                                                ) : (
                                                    <ChevronDown className="w-5 h-5 text-gray-600" />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleEditItem(item)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-5 h-5" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleDeleteItem(item._id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Summary Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-4">
                                        <div>
                                            <p className="text-gray-600 text-xs font-medium">Total Stock</p>
                                            <p className="text-2xl font-bold text-gray-900">{item.totalStock}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-xs font-medium">Issued</p>
                                            <p className="text-2xl font-bold text-blue-600">{item.issued || 0}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-xs font-medium">Available</p>
                                            <p className="text-2xl font-bold text-green-600">{available}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-xs font-medium">Damaged</p>
                                            <p className="text-2xl font-bold text-red-600">{item.damaged || 0}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-xs font-medium">Size Price Range</p>
                                            <p className="break-words text-base font-bold text-purple-600">{formatPriceRange(item)}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-600 text-xs font-medium">Reorder Level</p>
                                            <p className="text-2xl font-bold text-yellow-600">{item.reorderLevel || 20}</p>
                                        </div>
                                    </div>

                                    {/* Low Stock Alert */}
                                    {available < item.reorderLevel && available > 0 && (
                                        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                                            <AlertCircle className="w-5 h-5 text-orange-600" />
                                            <p className="text-orange-800 text-sm font-medium">
                                                Low stock alert: Only {available} items available
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Expandable Sizes Details */}
                                {isExpanded && (
                                    <div className="border-t border-gray-200 bg-gray-50 p-6">
                                        <h4 className="font-bold text-gray-900 mb-4">Size Breakdown</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                            {item.sizes.map((sizeObj, idx) => (
                                                <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200">
                                                    <p className="text-gray-600 text-xs font-medium">Size</p>
                                                    <p className="text-lg font-bold text-gray-900">{sizeObj.size}</p>
                                                    <p className="text-gray-600 text-xs mt-2">Stock: {sizeObj.stock}</p>
                                                    <p className="text-gray-600 text-xs mt-1">
                                                        Price: {formatCurrency(getUniformSizePrice(item, sizeObj))}
                                                    </p>
                                                    <p className="text-gray-600 text-xs mt-1">
                                                        Value: {formatCurrency(getUniformSizePrice(item, sizeObj) * Number(sizeObj.stock || 0))}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                        <p className="text-gray-500 text-lg">
                            {uniformItems.length === 0 ? 'No uniform items yet. Create one to get started!' : 'No matching items found'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UniformInventory;
