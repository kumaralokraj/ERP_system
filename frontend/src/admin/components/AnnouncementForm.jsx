import React, { useState } from "react";
import { validateAnnouncementForm } from "../../lib/formValidation";

const AnnouncementForm = ({ onSubmit, onCancel }) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFieldError = (fieldName) => {
    setErrors((currentErrors) => {
      if (!currentErrors[fieldName]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
  };

  const getInputStateClass = (fieldName) =>
    errors[fieldName]
      ? "border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500"
      : "border-gray-300 focus:ring-purple-500";

  const renderFieldError = (fieldName) =>
    errors[fieldName] ? <p className="mt-1 text-sm text-red-600">{errors[fieldName]}</p> : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { errors: nextErrors, payload } = validateAnnouncementForm({ title, content });

    if (Object.keys(nextErrors).length === 0) {
      try {
        setIsSubmitting(true);
        setSubmitError("");
        await onSubmit(payload);
        setTitle("");
        setContent("");
        setErrors({});
      } catch (error) {
        setSubmitError(error.message || "Failed to publish announcement");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setSubmitError("");
      setErrors(nextErrors);
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Create New Announcement</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {/* Title Input */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSubmitError("");
              clearFieldError("title");
            }}
            placeholder="Enter announcement title"
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${getInputStateClass("title")}`}
            aria-invalid={Boolean(errors.title)}
            maxLength={100}
          />
          <p className="text-xs text-gray-500 mt-1">{title.length}/100</p>
          {renderFieldError("title")}
        </div>

        {/* Content Textarea */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSubmitError("");
              clearFieldError("content");
            }}
            placeholder="Enter announcement content"
            rows={6}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 resize-none ${getInputStateClass("content")}`}
            aria-invalid={Boolean(errors.content)}
            maxLength={1000}
          />
          <p className="text-xs text-gray-500 mt-1">{content.length}/1000</p>
          {renderFieldError("content")}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {isSubmitting ? "Publishing..." : "Publish Announcement"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AnnouncementForm;
