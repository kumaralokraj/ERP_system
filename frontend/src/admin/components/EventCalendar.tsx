import React, { useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { BsCalendar3 } from "react-icons/bs";

const EventCalendar = () => {
  const [date, setDate] = useState(new Date());

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handlePrevMonth = () => {
    setDate(new Date(date.getFullYear(), date.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setDate(new Date(date.getFullYear(), date.getMonth() + 1));
  };

  const daysInMonth = getDaysInMonth(date);
  const firstDay = getFirstDayOfMonth(date);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const isCurrentMonth = date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  const currentDay = isCurrentMonth ? today.getDate() : null;

  return (
    <div className="bg-white p-3 sm:p-4 md:p-5 lg:p-6 rounded-2xl border border-gray-100 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-50 rounded-lg p-1.5 sm:p-2">
            <BsCalendar3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
          </div>
          <h2 className="text-sm sm:text-base md:text-lg font-bold text-gray-900">
            {monthNames[date.getMonth()]} {date.getFullYear()}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <FiChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <FiChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-0.5 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="text-center font-semibold text-xs text-gray-400 py-1">
            {day.substring(0, 2)}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-0.5 flex-1">
        {days.map((day, index) => (
          <div
            key={index}
            className={`text-center rounded-lg text-xs sm:text-sm font-medium aspect-square flex items-center justify-center transition-all duration-200 ${
              day === currentDay
                ? "bg-indigo-400 text-white font-bold shadow-sm shadow-indigo-100"
                : day
                ? "text-gray-600 hover:bg-indigo-50 hover:text-indigo-500 cursor-pointer"
                : ""
            }`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventCalendar;