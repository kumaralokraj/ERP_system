import { useMemo } from "react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
} from "recharts";
import { useAdmin } from "../../context/adminContext/AdminContext";
import { HiOutlineUsers } from "react-icons/hi2";
import { IoMale, IoFemale } from "react-icons/io5";

const CountChart = () => {
  const { students } = useAdmin();

  const chartData = useMemo(() => {
    if (!students || students.length === 0) {
      return [
        { name: "Total", count: 0, fill: "white" },
        { name: "Boys", count: 0, fill: "#C3EBFA" },
        { name: "Girls", count: 0, fill: "#FAE27C" },
      ];
    }

    const totalStudents = students.length;
    const boyCount = students.filter(s => s.sex === "Male").length;
    const girlCount = students.filter(s => s.sex === "Female").length;

    return [
      { name: "Total", count: totalStudents, fill: "white" },
      { name: "Boys", count: boyCount, fill: "#C3EBFA" },
      { name: "Girls", count: girlCount, fill: "#FAE27C" },
    ];
  }, [students]);

  const stats = useMemo(() => {
    if (!students || students.length === 0) {
      return {
        total: 0,
        boys: 0,
        girls: 0,
        boysPercentage: "0",
        girlsPercentage: "0",
      };
    }

    const total = students.length;
    const boys = students.filter(s => s.sex === "Male").length;
    const girls = students.filter(s => s.sex === "Female").length;

    return {
      total,
      boys,
      girls,
      boysPercentage: ((boys / total) * 100).toFixed(1),
      girlsPercentage: ((girls / total) * 100).toFixed(1),
    };
  }, [students]);

  // Responsive chart parameters
  const getChartConfig = () => {
    if (typeof window === "undefined") return { barSize: 16, innerRadius: "20%", outerRadius: "70%" };
    
    const width = window.innerWidth;
    
    if (width < 360) {
      return { barSize: 12, innerRadius: "15%", outerRadius: "65%", fontSize: 8 };
    } else if (width < 480) {
      return { barSize: 14, innerRadius: "18%", outerRadius: "68%", fontSize: 9 };
    } else if (width < 640) {
      return { barSize: 16, innerRadius: "20%", outerRadius: "70%", fontSize: 10 };
    } else if (width < 768) {
      return { barSize: 18, innerRadius: "22%", outerRadius: "72%", fontSize: 10 };
    } else if (width < 1024) {
      return { barSize: 20, innerRadius: "24%", outerRadius: "74%", fontSize: 11 };
    } else {
      return { barSize: 24, innerRadius: "26%", outerRadius: "76%", fontSize: 12 };
    }
  };

  const chartConfig = getChartConfig();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-4 md:p-5 lg:p-6 w-full h-full flex flex-col overflow-hidden">
      {/* TITLE */}
      <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3 md:mb-4">
        <div className="bg-indigo-50 rounded-xl p-2 sm:p-2.5">
          <HiOutlineUsers className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm sm:text-base md:text-lg font-bold text-gray-900 truncate">
            Students
          </h1>
          <p className="text-xs text-gray-400 truncate">Gender Distribution</p>
        </div>
      </div>

      {/* CHART CONTAINER */}
      <div className="relative flex-1 flex items-center justify-center min-h-32 xs:min-h-40 sm:min-h-48 md:min-h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius={chartConfig.innerRadius}
            outerRadius={chartConfig.outerRadius}
            barSize={chartConfig.barSize}
            data={chartData}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar
              background
              dataKey="count"
              cornerRadius={4}
              label={{ position: "insideStart", fill: "#111827", fontSize: chartConfig.fontSize }}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* CENTER ICON */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-indigo-100 rounded-full p-2 sm:p-2.5 md:p-3 shadow-sm">
            <HiOutlineUsers className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-indigo-500" />
          </div>
        </div>
      </div>

      {/* STATS SECTION */}
      <div className="mt-2 sm:mt-3 md:mt-4 pt-2 sm:pt-3 md:pt-4 border-t border-gray-100">
        <div className="grid grid-cols-3 gap-1 sm:gap-2 md:gap-3">
          {/* Total */}
          <div className="text-center min-w-0 bg-gray-50 rounded-xl p-2 sm:p-3">
            <p className="text-sm sm:text-lg md:text-xl font-bold text-gray-900">
              {stats.total}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Total</p>
          </div>

          {/* Boys */}
          <div className="text-center min-w-0 bg-blue-50 rounded-xl p-2 sm:p-3">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <IoMale className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" />
              <p className="text-sm sm:text-lg md:text-xl font-bold text-blue-600">
                {stats.boys}
              </p>
            </div>
            <p className="text-xs text-gray-500">Boys</p>
            <p className="text-xs font-semibold text-blue-500">{stats.boysPercentage}%</p>
          </div>

          {/* Girls */}
          <div className="text-center min-w-0 bg-pink-50 rounded-xl p-2 sm:p-3">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <IoFemale className="w-3 h-3 sm:w-4 sm:h-4 text-pink-500" />
              <p className="text-sm sm:text-lg md:text-xl font-bold text-pink-600">
                {stats.girls}
              </p>
            </div>
            <p className="text-xs text-gray-500">Girls</p>
            <p className="text-xs font-semibold text-pink-500">{stats.girlsPercentage}%</p>
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="mt-2 sm:mt-3 flex gap-0.5 h-1.5 sm:h-2 rounded-full overflow-hidden bg-gray-100">
        <div
          className="bg-blue-300 transition-all duration-500 rounded-full"
          style={{ width: `${stats.boysPercentage}%` }}
        />
        <div
          className="bg-pink-300 transition-all duration-500 rounded-full"
          style={{ width: `${stats.girlsPercentage}%` }}
        />
      </div>
    </div>
  );
};

export default CountChart;