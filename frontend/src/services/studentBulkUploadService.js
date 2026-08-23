const TEMPLATE_COLUMNS = [
  "username",
  "email",
  "password",
  "firstName",
  "lastName",
  "phone",
  "address",
  "bloodType",
  "birthday",
  "sex",
  "studentId",
  "classSession",
  "section",
  "parentName",
  "parentPhone",
  "parentEmail",
];

const TEMPLATE_ROWS = [
  [
    "john.doe",
    "john.doe@example.com",
    "password123",
    "John",
    "Doe",
    "9876543210",
    "123 Main Street",
    "O+",
    "2015-04-10",
    "Male",
    "STU001",
    "LKG-A (2026-27)",
    "A",
    "Robert Doe",
    "9876543211",
    "robert.doe@example.com",
  ],
  [
    "jane.smith",
    "jane.smith@example.com",
    "password123",
    "Jane",
    "Smith",
    "9876543220",
    "45 Park Road",
    "A+",
    "2015-08-22",
    "Female",
    "STU002",
    "UKG-B (2026-27)",
    "B",
    "Mary Smith",
    "9876543221",
    "mary.smith@example.com",
  ],
];

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

const escapeCsvValue = (value) => {
  const stringValue = String(value ?? "");
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const buildCsv = (rows) => rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");

const downloadCsvFile = (fileName, rows) => {
  const blob = new Blob([`${buildCsv(rows)}\n`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const isAllowedStudentBulkFile = (file) => {
  if (!file?.name) {
    return false;
  }

  const lowerName = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
};

export const downloadStudentTemplate = () => {
  downloadCsvFile("student-bulk-upload-template.csv", [TEMPLATE_COLUMNS, ...TEMPLATE_ROWS]);
};

export const downloadStudentErrorReport = (errors = []) => {
  const rows = [
    ["row", "message"],
    ...errors.map((error) => [error.row ?? "", error.message || ""]),
  ];

  downloadCsvFile("student-bulk-upload-errors.csv", rows);
};

export const previewStudentBulkUpload = async ({ axios, token, file }) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post("/api/students/bulk-preview", formData, {
    headers: { token },
  });

  return response.data;
};

export const importStudentBulkUpload = async ({ axios, token, file, skipDuplicates = true }) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("skipDuplicates", String(Boolean(skipDuplicates)));

  const response = await axios.post("/api/students/bulk-import", formData, {
    headers: { token },
  });

  return response.data;
};
