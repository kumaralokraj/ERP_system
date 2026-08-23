export const DEFAULT_EXAM_FEE_SCHEDULE = [
  { key: "HALF_YEARLY_EXAM", label: "Half Yearly Exam", dueMonth: "SEPTEMBER" },
  { key: "WINTER_EXAM", label: "Winter Exam", dueMonth: "DECEMBER" },
  { key: "FINAL_EXAM", label: "Final Exam", dueMonth: "MARCH" },
];

const normalizeInstallmentKey = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const generateExamFeeSchedule = (schedule = DEFAULT_EXAM_FEE_SCHEDULE) =>
  (Array.isArray(schedule) ? schedule : DEFAULT_EXAM_FEE_SCHEDULE)
    .map((installment, index) => {
      const fallbackLabel = `Exam Installment ${index + 1}`;
      const label =
        String(installment?.label || installment?.installmentLabel || installment?.name || "").trim() ||
        fallbackLabel;
      const dueMonth = normalizeInstallmentKey(
        installment?.dueMonth || installment?.monthKey || installment?.month
      );
      const key = normalizeInstallmentKey(installment?.key || installment?.installmentKey || label);

      return {
        key: key || normalizeInstallmentKey(`${fallbackLabel}_${dueMonth}`),
        label,
        dueMonth,
      };
    })
    .filter((installment) => installment.key && installment.dueMonth);
