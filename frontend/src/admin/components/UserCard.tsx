import React from "react";
import { PiStudentBold } from "react-icons/pi";
import { LiaChalkboardTeacherSolid } from "react-icons/lia";
import { RiParentFill } from "react-icons/ri";
import { SiGoogleclassroom } from "react-icons/si";

const UserCard = ({ type, count = 0 }) => {
  let icon = null;
  let cardBg = "";
  let iconBg = "";
  let iconColor = "";
  let labelColor = "";
  let countColor = "";
  let label = "";

  switch (type) {
    case "student":
      icon = <PiStudentBold className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
      cardBg = "bg-blue-50";
      iconBg = "bg-blue-100";
      iconColor = "text-blue-500";
      labelColor = "text-blue-400";
      countColor = "text-blue-700";
      label = "Students";
      break;
    case "teacher":
      icon = <LiaChalkboardTeacherSolid className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
      cardBg = "bg-violet-50";
      iconBg = "bg-violet-100";
      iconColor = "text-violet-500";
      labelColor = "text-violet-400";
      countColor = "text-violet-700";
      label = "Teachers";
      break;
    case "parent":
      icon = <RiParentFill className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
      cardBg = "bg-rose-50";
      iconBg = "bg-rose-100";
      iconColor = "text-rose-400";
      labelColor = "text-rose-400";
      countColor = "text-rose-700";
      label = "Parents";
      break;
    case "staff":
      icon = <SiGoogleclassroom className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />;
      cardBg = "bg-amber-50";
      iconBg = "bg-amber-100";
      iconColor = "text-amber-500";
      labelColor = "text-amber-400";
      countColor = "text-amber-700";
      label = "Classes";
      break;
    default:
      break;
  }

  return (
    <div className={`${cardBg} rounded-xl sm:rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 md:p-5 relative overflow-hidden group`}>
      {/* Decorative circle */}
      <div className="absolute -top-4 -right-4 w-16 h-16 sm:w-20 sm:h-20 bg-white/40 rounded-full group-hover:scale-110 transition-transform duration-500" />

      <div className="relative z-10 flex flex-col gap-2 sm:gap-3">
        <div className={`${iconBg} ${iconColor} w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-lg sm:rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        <div>
          <p className={`text-xs sm:text-sm font-medium ${labelColor}`}>{label}</p>
          <p className={`text-xl sm:text-2xl md:text-3xl font-bold mt-0.5 ${countColor}`}>{count}</p>
        </div>
      </div>
    </div>
  );
};

export default UserCard;