import React from "react";
import { getInstallmentStatusClass, getInstallmentStatusLabel } from "../../../utils/installmentStatus";

const FeeStatusBadge = ({ status, monthState = "" }) => (
  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${getInstallmentStatusClass(status, monthState)}`}>
    {getInstallmentStatusLabel(status, monthState)}
  </span>
);

export default FeeStatusBadge;
