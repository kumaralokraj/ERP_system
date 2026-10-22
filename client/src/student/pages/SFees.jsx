import { useStudent } from "../../context/studentContext/StudentContext";

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const getInstallmentBadgeClass = (status) => {
  switch (String(status || "").toUpperCase()) {
    case "PAID":
      return "bg-green-100 text-green-700";
    case "PARTIAL":
      return "bg-orange-100 text-orange-700";
    case "OVERDUE":
      return "bg-red-100 text-red-700";
    default:
      return "bg-amber-100 text-amber-700";
  }
};

const formatDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getInstallmentDisplayStatus = (installment = {}) => {
  const status = String(installment.status || "PENDING").toUpperCase();
  if (status !== "PENDING" || !installment.dueDate) return status.toLowerCase();

  const dueDate = new Date(installment.dueDate);
  const now = new Date();
  const isCurrentMonth =
    dueDate.getFullYear() === now.getFullYear() && dueDate.getMonth() === now.getMonth();

  if (!isCurrentMonth && dueDate > now) return "upcoming";
  return "pending";
};

const getInstallmentDisplayStatusClass = (installment = {}) => {
  const displayStatus = getInstallmentDisplayStatus(installment);
  if (displayStatus === "upcoming") return "bg-gray-100 text-gray-600";
  return getInstallmentBadgeClass(installment.status);
};

const SFees = () => {
  const { feesData, feesLoading, paymentHistory } = useStudent();

  if (feesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="text-sm font-semibold text-gray-600">Loading fees information...</p>
        </div>
      </div>
    );
  }

  if (!feesData) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="mx-auto max-w-7xl rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-2xl font-bold text-gray-900">Fees</h1>
          <div className="py-8 text-center text-gray-500">No fees data found</div>
        </div>
      </div>
    );
  }

  const totalFees = Number(feesData.totalFees || 0);
  const paidAmount = Number(feesData.paidAmount || 0);
  const pendingAmount = Math.max(totalFees - paidAmount, 0);
  const monthlyInstallments = (feesData.feeInstallments || []).filter(
    (installment) => installment.frequency === "MONTHLY"
  );
  const examInstallments = (feesData.feeInstallments || []).filter(
    (installment) => installment.feeType === "exam" && installment.frequency === "SCHEDULED"
  );
  const status = paidAmount >= totalFees ? "Paid" : paidAmount > 0 ? "Partial" : "Pending";
  const progress = totalFees > 0 ? Math.min(Math.round((paidAmount / totalFees) * 100), 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">Fees & Payments</h1>
          <p className="mt-2 text-sm text-gray-600">View monthly fee status and payment history</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="mb-2 text-sm font-medium text-gray-600">Total Fees</p>
            <h3 className="text-3xl font-bold text-gray-900">{formatCurrency(totalFees)}</h3>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
            <p className="mb-2 text-sm font-medium text-gray-600">Paid Amount</p>
            <h3 className="text-3xl font-bold text-green-600">{formatCurrency(paidAmount)}</h3>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="mb-2 text-sm font-medium text-gray-600">Pending Amount</p>
            <h3 className="text-3xl font-bold text-red-600">{formatCurrency(pendingAmount)}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-600">Payment Status</p>
              <h3 className="text-2xl font-bold text-gray-900">{status}</h3>
            </div>
            <span className={`rounded-full px-4 py-2 text-sm font-semibold ${getInstallmentBadgeClass(status)}`}>
              {status}
            </span>
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">Payment Progress</span>
              <span className="text-xs font-medium text-gray-600">{progress}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {monthlyInstallments.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Monthly Fee Status</h2>
              <p className="text-sm text-gray-500">Tuition and transport months for this academic session.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Fee Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Month</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Paid</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Remaining</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {monthlyInstallments.map((installment) => {
                    const remaining = Math.max(
                      Number(installment.amount || 0) - Number(installment.paidAmount || 0),
                      0
                    );
                    return (
                      <tr key={`${installment.feeType}-${installment.monthKey}`} className="bg-white">
                        <td className="px-6 py-4 text-sm font-semibold capitalize text-gray-900">
                          {installment.feeType}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{installment.monthLabel}</td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                          {installment.feeType === "tuition" && Number(installment.concessionAmount || 0) > 0 ? (
                            <div>
                              <p className="text-xs text-gray-500 line-through">
                                {formatCurrency(installment.originalAmount)}
                              </p>
                              <p className="text-xs font-semibold text-green-700">
                                -{formatCurrency(installment.concessionAmount)} concession
                              </p>
                              <p>{formatCurrency(installment.amount)}</p>
                            </div>
                          ) : (
                            formatCurrency(installment.amount)
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-green-700">
                          {formatCurrency(installment.paidAmount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-red-700">
                          {formatCurrency(remaining)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${getInstallmentDisplayStatusClass(installment)}`}>
                            {getInstallmentDisplayStatus(installment)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {examInstallments.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Exam Fee Schedule</h2>
              <p className="text-sm text-gray-500">Term-wise exam fee status for this academic session.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Exam Term</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Due Month</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Paid</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Remaining</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {examInstallments.map((installment) => {
                    const remaining = Math.max(
                      Number(installment.amount || 0) - Number(installment.paidAmount || 0),
                      0
                    );

                    return (
                      <tr key={`${installment.feeType}-${installment.installmentKey || installment.monthKey}`} className="bg-white">
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          {installment.installmentLabel || installment.monthLabel}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{installment.monthLabel}</td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                          {formatCurrency(installment.amount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-green-700">
                          {formatCurrency(installment.paidAmount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-red-700">
                          {formatCurrency(remaining)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${getInstallmentDisplayStatusClass(installment)}`}>
                            {getInstallmentDisplayStatus(installment)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-gray-900">Payment History</h2>
          </div>
          {paymentHistory?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Fee Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Amount</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Mode</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Transaction ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Paid Months</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paymentHistory.map((payment, index) => (
                    <tr key={payment.transactionId || index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatDate(payment.paymentDate)}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {payment.feeLabel || payment.feeType || "Fees"}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold capitalize text-blue-800">
                          {payment.mode?.replace("_", " ") || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">
                        {payment.transactionId || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {payment.installments?.length
                          ? payment.installments
                              .map((installment) => installment.installmentLabel || installment.monthLabel)
                              .join(", ")
                          : payment.note || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-gray-500">No payment history available</div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Fee Details</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="mb-1 text-sm font-medium text-gray-600">Due Date</p>
              <p className="text-lg font-semibold text-gray-900">{formatDate(feesData.dueDate)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="mb-1 text-sm font-medium text-gray-600">Last Updated</p>
              <p className="text-lg font-semibold text-gray-900">{formatDate(feesData.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SFees;
