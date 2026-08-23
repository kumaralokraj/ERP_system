import React, { useMemo } from "react";
import { useAdmin } from "../../context/adminContext/AdminContext";
import { TbTargetArrow } from "react-icons/tb";
import { BsCashCoin } from "react-icons/bs";
import { MdPendingActions } from "react-icons/md";
import { AiOutlinePercentage } from "react-icons/ai";
import { calculateExpectedStudentFeeTotal } from "../../utils/feeCalculations";

const FeesChart = () => {
  const { feesData, students, classes } = useAdmin();

  const stats = useMemo(() => {
    if (!students || students.length === 0) {
      return {
        totalExpected: 0,
        totalCollected: 0,
        collectionRate: "0",
        pendingAmount: 0,
      };
    }

    const classById = new Map(
      (classes || []).map((classRecord) => [String(classRecord?._id || ""), classRecord])
    );

    const totals = students.reduce(
      (summary, student) => {
        const studentId = String(student?._id || "");
        const storedFeeRecord = feesData?.[studentId] || null;
        const studentClassId = String(student?.class?._id || student?.class || "");
        const classRecord =
          student?.classSession ||
          (student?.class?.fees ? student.class : null) ||
          classById.get(studentClassId) ||
          student?.class ||
          null;
        const expectedAmount = Number.isFinite(Number(storedFeeRecord?.totalFees))
          ? Number(storedFeeRecord.totalFees)
          : calculateExpectedStudentFeeTotal(classRecord, student);
        const collectedAmount = Number(storedFeeRecord?.paidAmount || 0);

        return {
          totalExpected: summary.totalExpected + expectedAmount,
          totalCollected: summary.totalCollected + collectedAmount,
        };
      },
      { totalExpected: 0, totalCollected: 0 }
    );

    const totalExpected = totals.totalExpected;
    const totalCollected = totals.totalCollected;
    const pendingAmount = Math.max(totalExpected - totalCollected, 0);
    const rate = totalExpected > 0 ? ((totalCollected / totalExpected) * 100).toFixed(1) : "0";

    return {
      totalExpected,
      totalCollected,
      collectionRate: rate,
      pendingAmount,
    };
  }, [classes, feesData, students]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sm:p-4 md:p-5 lg:p-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 md:mb-5 shrink-0">
        <div className="bg-emerald-50 rounded-xl p-2 sm:p-2.5">
          <BsCashCoin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base md:text-lg font-bold text-gray-800 truncate">Fees Overview</h2>
          <p className="text-xs text-gray-400 mt-0.5">Collection Summary</p>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 gap-2 xs:gap-2.5 sm:gap-3 md:gap-4 flex-1 min-h-0 auto-rows-fr">
        {/* Total Expected */}
        <div className="bg-gray-50/80 rounded-xl p-2 sm:p-3 md:p-4 border border-gray-100 hover:shadow-sm transition-all duration-300 flex flex-col items-center justify-center text-center min-h-0 overflow-hidden group">
          <div className="bg-gray-100 rounded-lg p-1.5 sm:p-2 mb-1.5 sm:mb-2 group-hover:scale-105 transition-transform">
            <TbTargetArrow className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-gray-500" />
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Expected</p>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-gray-700 mt-0.5 truncate w-full">
            ₹{(stats.totalExpected / 100000).toFixed(2)}L
          </p>
        </div>

        {/* Total Collected */}
        <div className="bg-blue-50/60 rounded-xl p-2 sm:p-3 md:p-4 border border-blue-100 hover:shadow-sm transition-all duration-300 flex flex-col items-center justify-center text-center min-h-0 overflow-hidden group">
          <div className="bg-blue-100/80 rounded-lg p-1.5 sm:p-2 mb-1.5 sm:mb-2 group-hover:scale-105 transition-transform">
            <BsCashCoin className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-blue-400" />
          </div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Collected</p>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-blue-600 mt-0.5 truncate w-full">
            ₹{(stats.totalCollected / 100000).toFixed(2)}L
          </p>
        </div>

        {/* Pending Amount */}
        <div className="bg-amber-50/60 rounded-xl p-2 sm:p-3 md:p-4 border border-amber-100 hover:shadow-sm transition-all duration-300 flex flex-col items-center justify-center text-center min-h-0 overflow-hidden group">
          <div className="bg-amber-100/80 rounded-lg p-1.5 sm:p-2 mb-1.5 sm:mb-2 group-hover:scale-105 transition-transform">
            <MdPendingActions className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-amber-400" />
          </div>
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Pending</p>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-amber-600 mt-0.5 truncate w-full">
            ₹{(stats.pendingAmount / 100000).toFixed(2)}L
          </p>
        </div>

        {/* Collection Rate */}
        <div className="bg-emerald-50/60 rounded-xl p-2 sm:p-3 md:p-4 border border-emerald-100 hover:shadow-sm transition-all duration-300 flex flex-col items-center justify-center text-center min-h-0 overflow-hidden group">
          <div className="bg-emerald-100/80 rounded-lg p-1.5 sm:p-2 mb-1.5 sm:mb-2 group-hover:scale-105 transition-transform">
            <AiOutlinePercentage className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-emerald-400" />
          </div>
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Rate</p>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-emerald-600 mt-0.5 truncate w-full">
            {stats.collectionRate}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeesChart;
