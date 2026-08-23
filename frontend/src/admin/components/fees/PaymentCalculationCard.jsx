import React from "react";
import FeeSummaryCard from "./FeeSummaryCard";

const PaymentCalculationCard = ({
  selectedLabel = "Selected Months",
  selectedHelper = "Months being collected",
  selectedCount,
  totalDue,
  payingNow,
  remaining,
  formatCurrency,
}) => (
  <div className="space-y-3">
    <FeeSummaryCard label={selectedLabel} value={selectedCount} helper={selectedHelper} tone="gray" />
    <FeeSummaryCard label="Total Due" value={formatCurrency(totalDue)} helper="Selected balance" tone="amber" />
    <FeeSummaryCard label="Paying Now" value={formatCurrency(payingNow)} helper="Receipt amount" tone="blue" />
    <FeeSummaryCard label="Remaining" value={formatCurrency(remaining)} helper="After this payment" tone="green" />
  </div>
);

export default PaymentCalculationCard;
