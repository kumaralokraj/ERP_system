const buildPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  if (currentPage > 1) pages.add(currentPage - 1);
  if (currentPage < totalPages) pages.add(currentPage + 1);

  const sortedPages = [...pages].sort((left, right) => left - right);
  const pageItems = [];

  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (index > 0 && page - previousPage > 1) {
      pageItems.push(`ellipsis-${previousPage}-${page}`);
    }
    pageItems.push(page);
  });

  return pageItems;
};

const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = "items",
  onPageChange,
  onPageSizeChange,
}) => {
  if (!totalItems || totalPages <= 0) {
    return null;
  }

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const startItem = (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);
  const pageItems = buildPageItems(safeCurrentPage, totalPages);
  const canGoPrev = safeCurrentPage > 1;
  const canGoNext = safeCurrentPage < totalPages;

  const changePage = (nextPage) => {
    if (!onPageChange || nextPage < 1 || nextPage > totalPages || nextPage === safeCurrentPage) {
      return;
    }

    onPageChange(nextPage);
  };

  return (
    <div className="shrink-0 flex flex-col gap-3 border-t border-gray-100 p-3 text-gray-600 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <p className="text-xs sm:text-sm">
        Showing <span className="font-semibold text-gray-900">{startItem}</span>-
        <span className="font-semibold text-gray-900">{endItem}</span> of{" "}
        <span className="font-semibold text-gray-900">{totalItems}</span> {itemLabel}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs sm:text-sm">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#CFCEFF] sm:text-sm"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1 text-sm">
          <button
            type="button"
            disabled={!canGoPrev}
            onClick={() => changePage(safeCurrentPage - 1)}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>

          <div className="flex items-center gap-1">
            {pageItems.map((item) =>
              typeof item === "number" ? (
                <button
                  type="button"
                  key={item}
                  onClick={() => changePage(item)}
                  className={`min-w-8 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                    item === safeCurrentPage
                      ? "bg-[#CFCEFF] text-white"
                      : "bg-white text-gray-600 hover:bg-slate-100"
                  }`}
                  aria-current={item === safeCurrentPage ? "page" : undefined}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="px-1 text-xs text-gray-400">
                  ...
                </span>
              )
            )}
          </div>

          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => changePage(safeCurrentPage + 1)}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default Pagination;
