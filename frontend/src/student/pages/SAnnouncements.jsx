import { useStudent } from "../../context/studentContext/StudentContext";
const SAnnouncements = () => {
  const {announcements , announcementsLoading} = useStudent();

  const colors = [
    "border-blue-500",
    "border-purple-500",
    "border-green-500",
    "border-orange-500",
    "border-pink-500",
  ];

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
          Announcements
        </h1>
        <p className="text-xs sm:text-sm md:text-base text-gray-600">
          Stay updated with important school notices
        </p>
      </div>

      {/* Loading State */}
      {announcementsLoading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Announcements List */}
      {!announcementsLoading && announcements.length > 0 ? (
        <div className="space-y-3 sm:space-y-4">
          {announcements.map((announcement, index) => (
            <div
              key={announcement._id}
              className={`bg-white rounded-lg shadow p-3 sm:p-4 md:p-6 border-l-4 ${colors[index % colors.length]}`}
            >
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-gray-900 break-words">
                    {announcement.title}
                  </h3>
                </div>
                <span className="text-xs sm:text-sm text-gray-500 flex-shrink-0">
                  {formatDate(announcement.createdAt)}
                </span>
              </div>
              <p className="text-xs sm:text-sm md:text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                {announcement.content}
              </p>
            </div>
          ))}
        </div>
      ) : (
        !announcementsLoading && (
          <div className="text-center py-8 sm:py-12">
            <p className="text-sm sm:text-base md:text-lg text-gray-500">
              No announcements available
            </p>
          </div>
        )
      )}
    </div>
  )
}

export default SAnnouncements