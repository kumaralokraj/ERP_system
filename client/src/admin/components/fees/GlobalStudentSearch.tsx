import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Phone, Search, X } from "lucide-react";
import { useAuth } from "../../../context/authContext/AuthContext";

export type StudentSearchResult = {
  id: string;
  name: string;
  admissionNo?: string;
  className?: string;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  pendingFees?: number;
  totalFees?: number;
  paidAmount?: number;
  status?: string;
};

type GlobalStudentSearchProps = {
  onSelect: (student: StudentSearchResult) => void;
  className?: string;
};

const resultCache = new Map<string, StudentSearchResult[]>();
const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const highlightMatch = (value: string | undefined, query: string) => {
  const displayValue = value?.trim() || "N/A";
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return displayValue;
  }

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

const GlobalStudentSearch = ({ onSelect, className = "" }: GlobalStudentSearchProps) => {
  const { axios, token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const normalizedQuery = useMemo(() => query.trim().replace(/\s+/g, " "), [query]);
  const shouldSearch = normalizedQuery.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!shouldSearch) {
      abortControllerRef.current?.abort();
      setResults([]);
      setLoading(false);
      setError("");
      setActiveIndex(-1);
      return;
    }

    setIsOpen(true);

    const cacheKey = normalizedQuery.toLowerCase();
    const cachedResults = resultCache.get(cacheKey);
    if (cachedResults) {
      abortControllerRef.current?.abort();
      setResults(cachedResults);
      setLoading(false);
      setError("");
      setActiveIndex(cachedResults.length ? 0 : -1);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;

    const debounceTimer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError("");

        const response = await axios.get("/api/students/search", {
          params: { q: normalizedQuery },
          headers: { token },
          signal: controller.signal,
        });

        const nextResults = Array.isArray(response.data)
          ? response.data
          : response.data?.students || response.data?.results || [];

        resultCache.set(cacheKey, nextResults);
        setResults(nextResults);
        setActiveIndex(nextResults.length ? 0 : -1);
      } catch (requestError: any) {
        if (requestError?.code === "ERR_CANCELED" || controller.signal.aborted) {
          return;
        }

        setResults([]);
        setActiveIndex(-1);
        setError(requestError?.response?.data?.message || "Unable to search students");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [axios, normalizedQuery, shouldSearch, token]);

  const handleSelect = (student: StudentSearchResult) => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(student);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen || results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) => (currentIndex + 1) % results.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) =>
        currentIndex <= 0 ? results.length - 1 : currentIndex - 1
      );
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
            if (shouldSearch) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search student, parent, phone, admission no..."
          className="h-14 w-full rounded-lg border border-gray-300 bg-white pl-12 pr-12 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:text-base"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-student-fee-search-results"
          aria-activedescendant={
            activeIndex >= 0 ? `student-search-option-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              setError("");
            }}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Clear student search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          id="global-student-fee-search-results"
          role="listbox"
          className="absolute z-30 mt-2 max-h-[28rem] w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
        >
          {loading && (
            <div className="flex items-center gap-3 px-4 py-4 text-sm font-medium text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Searching students...
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-3 px-4 py-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-4 text-sm font-medium text-gray-500">No students found</div>
          )}

          {!loading &&
            !error &&
            results.map((student, index) => {
              const isActive = index === activeIndex;
              const parentName =
                student.fatherName || student.motherName || "Parent details not available";

              return (
                <button
                  key={student.id}
                  id={`student-search-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(student)}
                  className={`w-full border-b border-gray-100 px-4 py-4 text-left transition last:border-b-0 ${
                    isActive ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-gray-950">
                        {highlightMatch(student.name, normalizedQuery)}
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs font-medium text-gray-600 sm:grid-cols-2">
                        <span>Class: {highlightMatch(student.className, normalizedQuery)}</span>
                        <span>Admission No: {highlightMatch(student.admissionNo, normalizedQuery)}</span>
                        <span>Father: {highlightMatch(parentName, normalizedQuery)}</span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {highlightMatch(student.phone, normalizedQuery)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 rounded-md bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                      Pending: {formatCurrency(student.pendingFees || 0)}
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default GlobalStudentSearch;
