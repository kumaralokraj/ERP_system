import React from "react";

const AnnouncementsList = ({ announcements, onDelete }) => {
  if (announcements.length === 0) {
    return (
      <div className="text-center py-8 sm:py-12">
        <p className="text-xs sm:text-sm md:text-base text-gray-500">
          No announcements yet. Create one to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:space-y-4">
      {announcements.map((announcement) => (
        <div
          key={announcement._id}
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 md:p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 break-words">
                {announcement.title}
              </h3>
              <p className="text-gray-700 mt-2 text-xs sm:text-sm md:text-base leading-relaxed line-clamp-3">
                {announcement.content}
              </p>
              <div className="flex items-center gap-2 sm:gap-4 mt-2 sm:mt-3 text-xs text-gray-500">
                <span>{new Date(announcement.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <button
              onClick={() => onDelete(announcement._id)}
              className="text-red-500 hover:text-red-700 font-semibold text-xs sm:text-sm cursor-pointer flex-shrink-0 mt-2 sm:mt-0"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AnnouncementsList;