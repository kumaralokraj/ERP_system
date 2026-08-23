import React from "react";

const Table = ({ columns, renderRow, data }) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="w-full">
      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-gray-600 text-xs md:text-sm bg-gray-50 border-b-2 border-gray-300 sticky top-0 z-10">
              {columns.map((col) => (
                <th 
                  key={col.accessor} 
                  className={`px-3 md:px-4 lg:px-4 py-3 md:py-4 font-semibold text-gray-700 whitespace-nowrap ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data && data.length > 0 ? (
              data.map((item) => renderRow(item))
            ) : (
              <tr>
                <td 
                  colSpan={columns.length} 
                  className="px-3 md:px-4 lg:px-6 py-8 md:py-10 text-center text-gray-500 text-xs md:text-sm"
                >
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Responsive Wrapper */}
      <div className="sm:hidden">
        {data && data.length > 0 ? (
          <div className="space-y-3 p-2">
            {data.map((item) => (
              <div key={item._id} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition">
                {renderRow(item)}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-8 text-center text-gray-500 text-sm">
            No data available
          </div>
        )}
      </div>

      {/* Scroll Indicator */}
      <div className="hidden sm:block md:hidden text-center text-xs text-gray-400 py-2">
        ← Scroll to see more →
      </div>
    </div>
  );
};

export default Table;