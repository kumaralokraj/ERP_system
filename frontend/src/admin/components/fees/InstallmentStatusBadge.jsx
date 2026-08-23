import React from "react";
import FeeStatusBadge from "./FeeStatusBadge";

const InstallmentStatusBadge = ({ status, monthState }) => (
  <FeeStatusBadge status={status} monthState={monthState} />
);

export default InstallmentStatusBadge;
