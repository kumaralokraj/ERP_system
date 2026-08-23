export const calculateSelectedInstallmentsTotal = (selectedInstallmentKeys = [], installments = []) => {
  const selectedKeys = new Set(selectedInstallmentKeys);

  return installments.reduce((total, installment) => {
    const installmentKey = installment.installmentKey || installment.monthKey;
    if (!selectedKeys.has(installmentKey)) return total;

    return total + Math.max(Number(installment.amount || 0) - Number(installment.paidAmount || 0), 0);
  }, 0);
};
