import { useAdmin } from "../../context/adminContext/AdminContext";
import { HiOutlineSpeakerphone } from "react-icons/hi";
import { FiClock } from "react-icons/fi";

const Announcements = () => {
  const { announcements } = useAdmin();

  const colors = [
    "bg-sky-50/60 border-l-4 border-l-sky-300",
    "bg-violet-50/60 border-l-4 border-l-violet-300",
    "bg-amber-50/60 border-l-4 border-l-amber-300",
  ];

  return (
    <div className="bg-white p-3 sm:p-4 md:p-5 rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-rose-50 rounded-lg p-1.5 sm:p-2">
            <HiOutlineSpeakerphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
          </div>
          <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-900">Announcements</h1>
        </div>
        <span className="text-xs text-indigo-400 font-medium cursor-pointer hover:text-indigo-500 transition-colors">View All</span>
      </div>
      <div className="flex flex-col gap-2.5 overflow-y-auto scrollbar-hidden flex-1">
        {announcements.length > 0 ? (
          announcements.map((announcement, index) => (
            <div 
              key={announcement._id} 
              className={`${colors[index % colors.length]} rounded-xl p-3 sm:p-4 hover:shadow-md transition-all duration-300`}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-xs sm:text-sm text-gray-900 flex-1 line-clamp-1">{announcement.title}</h2>
                <span className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                  <FiClock className="w-3 h-3" />
                  {new Date(announcement.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
                {announcement.content.substring(0, 150)}...
              </p>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-gray-300">
            <HiOutlineSpeakerphone className="w-8 h-8 mb-2" />
            <p className="text-sm">No announcements</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Announcements;