import Announcements from "../components/Announcements";
import CountChart from "../components/CountChart";
import EventCalendar from "../components/EventCalendar";
import FeesChart from "../components/FeesChart.jsx";
import UserCard from '../components/UserCard.jsx';
import { useAdmin } from "../../context/adminContext/AdminContext.js";
import { HiOutlineAcademicCap } from "react-icons/hi2";
import { useEffect } from "react";

const DashboardSkeleton = () => (
  <div className="min-h-full bg-gray-50/50 animate-pulse">
    <div className="p-3 sm:p-4 md:p-5 lg:p-6 flex gap-3 sm:gap-4 md:gap-5 lg:gap-6 flex-col lg:flex-row">
      <div className="w-full lg:w-2/3 flex flex-col gap-4 sm:gap-5 lg:gap-6 min-w-0">
        {/* Banner skeleton */}
        <div className="bg-gray-200 rounded-2xl h-24 sm:h-28" />
        {/* Cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-200 rounded-xl h-28 sm:h-32" />
          ))}
        </div>
        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          <div className="lg:col-span-1 bg-gray-200 rounded-2xl h-72 sm:h-80 md:h-96" />
          <div className="lg:col-span-2 bg-gray-200 rounded-2xl h-72 sm:h-80 md:h-96" />
        </div>
      </div>
      <div className="w-full lg:w-1/3 flex flex-col gap-4 sm:gap-5 lg:gap-6 min-w-0">
        <div className="bg-gray-200 rounded-2xl h-80" />
        <div className="bg-gray-200 rounded-2xl h-44" />
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const {
    students,
    teachers,
    classes,
    initialLoading,
  } = useAdmin();

  useEffect(() => {
  }, [students, teachers, classes]);

  if (initialLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="p-3 sm:p-4 md:p-5 lg:p-6 flex gap-3 sm:gap-4 md:gap-5 lg:gap-6 flex-col lg:flex-row">
        {/* LEFT SECTION */}
        <div className="w-full lg:w-2/3 flex flex-col gap-4 sm:gap-5 lg:gap-6 min-w-0">

          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 rounded-2xl p-4 sm:p-6 text-white relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 sm:w-48 sm:h-48 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-1/2 w-24 h-24 bg-white/5 rounded-full translate-y-1/2" />
            <div className="relative z-10 flex items-center gap-3 sm:gap-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5 sm:p-3 hidden sm:block">
                <HiOutlineAcademicCap className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold">Welcome back!</h1>
                <p className="text-white/80 text-xs sm:text-sm mt-1">Here's your school overview for today</p>
              </div>
            </div>
          </div>

          {/* USER CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <UserCard type="student" count={students.length} />
            <UserCard type="teacher" count={teachers.length} />
            <UserCard type="parent" count={0} />
            <UserCard type="staff" count={classes.length} />
          </div>

          {/* CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            <div className="lg:col-span-1 h-72 sm:h-80 md:h-96 lg:h-[450px] min-w-0">
              <CountChart />
            </div>
            <div className="lg:col-span-2 h-72 sm:h-80 md:h-96 lg:h-[450px] min-w-0">
              <FeesChart />
            </div>
          </div>
        </div>

        {/* RIGHT SECTION */}
        <div className="w-full lg:w-1/3 flex flex-col gap-4 sm:gap-5 lg:gap-6 min-w-0">
          <div className="h-auto lg:h-96 min-h-[280px]">
            <EventCalendar />
          </div>
          <div className="lg:flex-1 max-h-[350px] min-w-0">
            <Announcements />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;