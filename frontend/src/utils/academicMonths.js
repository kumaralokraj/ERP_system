export const ACADEMIC_MONTHS = [
  { key: "APRIL", label: "April", shortLabel: "Apr", calendarMonth: 3 },
  { key: "MAY", label: "May", shortLabel: "May", calendarMonth: 4 },
  { key: "JUNE", label: "June", shortLabel: "Jun", calendarMonth: 5 },
  { key: "JULY", label: "July", shortLabel: "Jul", calendarMonth: 6 },
  { key: "AUGUST", label: "August", shortLabel: "Aug", calendarMonth: 7 },
  { key: "SEPTEMBER", label: "September", shortLabel: "Sep", calendarMonth: 8 },
  { key: "OCTOBER", label: "October", shortLabel: "Oct", calendarMonth: 9 },
  { key: "NOVEMBER", label: "November", shortLabel: "Nov", calendarMonth: 10 },
  { key: "DECEMBER", label: "December", shortLabel: "Dec", calendarMonth: 11 },
  { key: "JANUARY", label: "January", shortLabel: "Jan", calendarMonth: 0 },
  { key: "FEBRUARY", label: "February", shortLabel: "Feb", calendarMonth: 1 },
  { key: "MARCH", label: "March", shortLabel: "Mar", calendarMonth: 2 },
];

export const parseAcademicYear = (academicYear) => {
  const match = String(academicYear || "").match(/^(\d{4})-(\d{2}|\d{4})$/);
  if (!match) return null;

  const startYear = Number(match[1]);
  const rawEndYear = Number(match[2]);
  const endYear = rawEndYear < 100 ? Number(`${String(startYear).slice(0, 2)}${String(rawEndYear).padStart(2, "0")}`) : rawEndYear;

  return Number.isFinite(startYear) && Number.isFinite(endYear) ? { startYear, endYear } : null;
};

export const generateAcademicMonths = (academicYear) => {
  const parsedYear =
    typeof academicYear === "number"
      ? { startYear: academicYear, endYear: academicYear + 1 }
      : parseAcademicYear(academicYear);
  const startYear = parsedYear?.startYear || new Date().getFullYear();

  return ACADEMIC_MONTHS.map((month, index) => {
    const calendarYear = index <= 8 ? startYear : startYear + 1;
    const dueDate = new Date(calendarYear, month.calendarMonth + 1, 0, 23, 59, 59, 999);

    return {
      ...month,
      index,
      academicYear: parsedYear ? `${parsedYear.startYear}-${String(parsedYear.endYear).slice(-2)}` : String(academicYear || ""),
      calendarYear,
      dueDate,
    };
  });
};

export const getCurrentAcademicMonth = (academicYear, date = new Date()) =>
  generateAcademicMonths(academicYear).find(
    (month) => month.calendarYear === date.getFullYear() && month.calendarMonth === date.getMonth()
  ) || null;

export const getAcademicMonthState = (month, date = new Date()) => {
  const dueDate = new Date(month.dueDate);
  const isCurrent =
    dueDate.getFullYear() === date.getFullYear() && dueDate.getMonth() === date.getMonth();

  if (isCurrent) return "CURRENT";
  if (dueDate < date) return "OVERDUE";
  return "UPCOMING";
};
