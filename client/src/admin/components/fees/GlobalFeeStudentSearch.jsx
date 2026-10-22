import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Phone, ReceiptText, Search, X } from "lucide-react";

const MIN_SEARCH_LENGTH = 2;

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightMatch = (value, query) => {
  const displayValue = String(value || "").trim() || "N/A";
  const trimmedQuery = query.trim();

  if (!trimmedQuery) return displayValue;

  const matcher = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "ig");
  const parts = displayValue.split(matcher);

  return parts.map((part, index) => {
    if (part.toLowerCase() !== trimmedQuery.toLowerCase()) {
      return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    }

    return (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-100 px-0.5 text-gray-950">
        {part}
      </mark>
    );
  });
};

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const getStatusClass = (status = "") => {
  switch (String(status).toLowerCase()) {
    case "paid":
      return "bg-green-50 text-green-700 border-green-200";
    case "partial":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "overdue":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
};

const getStatusLabel = (status = "") => {
  const normalizedStatus = String(status || "pending").toLowerCase();
  return normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
};

const getStudentSearchText = (student = {}) =>
  [
    student.name,
    student.admissionNo,
    student.studentId,
    student.className,
    student.fatherName,
    student.motherName,
    student.phone,
    student.parentPhone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const GlobalFeeStudentSearch = ({ students = [], onSelect, className = "" }) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);

  const normalizedQuery = useMemo(() => query.trim().replace(/\s+/g, " "), [query]);
  const shouldSearch = normalizedQuery.length >= MIN_SEARCH_LENGTH;

  const results = useMemo(() => {
    if (!shouldSearch) return [];
    const loweredQuery = normalizedQuery.toLowerCase();
    return students
      .filter((student) => getStudentSearchText(student).includes(loweredQuery))
      .slice(0, 20);
  }, [normalizedQuery, shouldSearch, students]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!shouldSearch) {
      setActiveIndex(-1);
      return;
    }

    setIsOpen(true);
    setActiveIndex(results.length ? 0 : -1);
  }, [results.length, shouldSearch]);

  const handleSelect = (student) => {
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(student);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (currentIndex + 1) % results.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (currentIndex <= 0 ? results.length - 1 : currentIndex - 1));
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(results[activeIndex]);
    }
  };

  const showDropdown = isOpen && shouldSearch;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (shouldSearch) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search student, parent, phone, admission no..."
          className="h-14 w-full rounded-lg border border-gray-300 bg-white pl-12 pr-24 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:text-base"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-student-fee-search-results"
          aria-activedescendant={activeIndex >= 0 ? `fee-student-search-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
        />
        {query && (
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setIsOpen(false);
                setActiveIndex(-1);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Clear student search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {showDropdown && (
        <div
          id="global-student-fee-search-results"
          role="listbox"
          className="absolute z-30 mt-2 max-h-[32rem] w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
        >
          {results.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-4 text-sm text-gray-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>No students found</span>
            </div>
          ) : (
            results.map((student, index) => {
              const isActive = index === activeIndex;
              const pendingAmount = Number(student.pendingAmount || 0);

              return (
                <button
                  key={student.id}
                  type="button"
                  id={`fee-student-search-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(student)}
                  className={`flex w-full flex-col gap-3 border-b border-gray-100 px-4 py-4 text-left transition last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${
                    isActive ? "bg-blue-50" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-base font-semibold text-gray-950">
                        {highlightMatch(student.name, normalizedQuery)}
                      </p>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(student.status)}`}
                      >
                        {getStatusLabel(student.status)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-gray-600 sm:grid-cols-2">
                      <p>Class: {highlightMatch(student.className, normalizedQuery)}</p>
                      <p>Admission No: {highlightMatch(student.admissionNo, normalizedQuery)}</p>
                      <p>Father: {highlightMatch(student.fatherName, normalizedQuery)}</p>
                      <p>Mother: {highlightMatch(student.motherName, normalizedQuery)}</p>
                      <p className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        {highlightMatch(student.phone, normalizedQuery)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
                    <ReceiptText className="h-4 w-4 text-blue-600" />
                    Pending Fees: {formatCurrency(pendingAmount)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalFeeStudentSearch;
