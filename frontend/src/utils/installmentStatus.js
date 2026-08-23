export const normalizeInstallmentStatus = (status) => String(status || "PENDING").toUpperCase();

export const getInstallmentStatusLabel = (status, monthState = "") => {
  const normalizedStatus = normalizeInstallmentStatus(status);
  if (normalizedStatus === "PENDING" && monthState === "UPCOMING") return "Upcoming";
  if (normalizedStatus === "PENDING" && monthState === "CURRENT") return "Current due";
  return normalizedStatus.charAt(0) + normalizedStatus.slice(1).toLowerCase();
};

export const getInstallmentStatusClass = (status, monthState = "") => {
  const normalizedStatus = normalizeInstallmentStatus(status);

  if (normalizedStatus === "PAID") return "border-green-200 bg-green-50 text-green-700";
  if (normalizedStatus === "PARTIAL") return "border-orange-200 bg-orange-50 text-orange-700";
  if (normalizedStatus === "OVERDUE" || monthState === "OVERDUE") return "border-red-200 bg-red-50 text-red-700";
  if (monthState === "CURRENT") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-gray-200 bg-gray-50 text-gray-500";
};
