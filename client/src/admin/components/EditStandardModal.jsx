import React, { useState, useEffect } from "react";

const EditStandardModal = ({ isOpen, onClose, onSave, selectedStandard }) => {
  const [formData, setFormData] = useState({
    standard: "",
    programFee: "0.0",
    feeDueDay: "10",
  });

  useEffect(() => {
    if (selectedStandard) {
      setFormData({
        standard: selectedStandard.standard,
        programFee: selectedStandard.programFee.toString(),
        feeDueDay: selectedStandard.feeDueDay || "10",
      });
    }
  }, [selectedStandard]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSave = () => {
    if (formData.standard && formData.programFee && formData.feeDueDay) {
      onSave(formData);
      resetForm();
    }
  };

  const handleSaveAndContinue = () => {
    if (formData.standard && formData.programFee && formData.feeDueDay) {
      onSave(formData);
      // Keep form open for editing
    }
  };

  const resetForm = () => {
    setFormData({
      standard: "",
      programFee: "0.0",
      feeDueDay: "10",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Edit Standard</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Fields */}
            <div className="lg:col-span-2 space-y-6">
              {/* Standard Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Standard <span className="text-red-500">*</span>
                </label>
                <select
                  name="standard"
                  value={formData.standard}
                  onChange={handleChange}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none bg-gray-100 text-gray-700 cursor-not-allowed"
                >
                  <option value="">{formData.standard}</option>
                </select>
              </div>

              {/* Program Fee Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Program fee <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="programFee"
                  value={formData.programFee}
                  onChange={handleChange}
                  placeholder="0.0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
                />
              </div>

              {/* Fee Due Day Field */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Fee due day <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="feeDueDay"
                  value={formData.feeDueDay}
                  onChange={handleChange}
                  placeholder="10"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 justify-start">
              <button
                onClick={handleSave}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                Save
              </button>
              <button
                onClick={handleSaveAndContinue}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                Save and continue editing
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditStandardModal;