import React from "react";

const FeeSummaryCard = ({ label, value, helper, tone = "blue" }) => {
  const toneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-green-200 bg-green-50 text-green-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-red-200 bg-red-50 text-red-700",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
  }[tone] || "border-gray-200 bg-gray-50 text-gray-700";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-950">{value}</p>
      {helper && <p className="mt-0.5 text-xs font-medium text-gray-500">{helper}</p>}
    </div>
  );
};

export default FeeSummaryCard;
