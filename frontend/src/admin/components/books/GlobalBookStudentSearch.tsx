import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, Loader2, Phone, Search, X } from "lucide-react";
import { useAuth } from "../../../context/authContext/AuthContext";

export type BookStudentSearchResult = {
  id: string;
  name: string;
  admissionNo?: string;
  className?: string;
  fatherName?: string;
  motherName?: string;
  phone?: string;
  bookStatus?: string;
  pendingBooks?: number;
  issuedBooks?: number;
};

type GlobalBookStudentSearchProps = {
  onSelect: (student: BookStudentSearchResult) => void;
  className?: string;
};

const resultCache = new Map<string, BookStudentSearchResult[]>();
const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightMatch = (value: string | undefined, query: string) => {
  const displayValue = value?.trim() || "N/A";
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

const getStatusClass = (status = "") => {
  switch (status.toLowerCase()) {
    case "complete":
      return "bg-green-50 text-green-700 border-green-200";
    case "partial":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
};

const GlobalBookStudentSearch = ({ onSelect, className = "" }: GlobalBookStudentSearchProps) => {
  const { axios, token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookStudentSearchResult[]>([]);
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

        const response = await axios.get("/api/students/book-search", {
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

  const handleSelect = (student: BookStudentSearchResult) => {
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

    if (!isOpen || results.length === 0) return;

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
            if (shouldSearch) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search student, parent, phone, admission no..."
          className="h-14 w-full rounded-lg border border-gray-300 bg-white pl-12 pr-12 text-sm font-medium text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 sm:text-base"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-student-book-search-results"
          aria-activedescendant={
            activeIndex >= 0 ? `book-student-search-option-${activeIndex}` : undefined
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
          id="global-student-book-search-results"
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
              const pendingBooks = Number(student.pendingBooks || 0);
              const status = student.bookStatus || "Pending";

              return (
                <button
                  key={student.id}
                  type="button"
                  id={`book-student-search-option-${index}`}
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
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(status)}`}
                      >
                        {status}
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
                    <BookOpen className="h-4 w-4 text-blue-600" />
                    Pending Books: {pendingBooks}
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default GlobalBookStudentSearch;
