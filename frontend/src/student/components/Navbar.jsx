import { useStudent } from "../../context/studentContext/StudentContext";
import { useNavigate } from "react-router-dom";
import { FiBell } from 'react-icons/fi';

const Navbar = () => {
  const navigate = useNavigate();
  const { studentProfile, announcements } = useStudent();
  return (
    <div className="flex items-center justify-between p-4 sm:p-3 md:p-4 gap-4">
      {/* LEFT - USER INFO */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 shrink-0">
        <img
          src={studentProfile?.photo||"/avatar.png"}
          alt="User Avatar"
          width={32}
          height={32}
          className="rounded-full w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 object-cover"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-xs sm:text-sm font-medium text-gray-900 truncate">{studentProfile?.username}</span>
          <span className="text-[10px] sm:text-xs text-gray-500">Student</span>
        </div>
      </div>

      {/* RIGHT - ICONS */}
      <div className="flex items-center gap-2 ml-2 sm:gap-3 md:gap-4 shrink-0">
        <div onClick={() => navigate('/student/announcements')} className="bg-white rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition relative">
          <FiBell className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          {announcements?.length > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-purple-500 text-white rounded-full text-[10px] font-semibold">
              {announcements.length}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Navbar;