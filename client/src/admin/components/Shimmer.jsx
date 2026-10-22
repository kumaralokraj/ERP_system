import React from 'react';

const Shimmer = () => {
  return (
    <style>{`
      @keyframes shimmer {
        0% {
          background-position: -1000px 0;
        }
        100% {
          background-position: 1000px 0;
        }
      }
      .shimmer {
        animation: shimmer 2s infinite;
        background: linear-gradient(
          90deg,
          #f0f0f0 25%,
          #e0e0e0 50%,
          #f0f0f0 75%
        );
        background-size: 1000px 100%;
      }
    `}</style>
  );
};

// TABLE ROW SHIMMER (for Teachers, Students, Classes tables)
export const TableRowShimmer = ({ rows = 5, columns = 5 }) => (
  <>
    <Shimmer />
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              {[...Array(columns)].map((_, i) => (
                <th key={i} className="px-4 md:px-6 py-3 text-left">
                  <div className="h-4 bg-gray-200 shimmer rounded w-3/4"></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(rows)].map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-gray-200 even:bg-slate-50">
                {[...Array(columns)].map((_, colIndex) => (
                  <td key={colIndex} className="px-4 md:px-6 py-4">
                    <div className="h-4 bg-gray-200 shimmer rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </>
);

// MOBILE CARD SHIMMER (for Teachers, Students, Classes mobile view)
export const MobileCardShimmer = ({ cards = 4 }) => (
  <>
    <Shimmer />
    <div className="md:hidden p-2 sm:p-3 space-y-3">
      {[...Array(cards)].map((_, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
          <div className="flex justify-between items-start gap-2 mb-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 shimmer rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 shimmer rounded w-1/2"></div>
            </div>
            <div className="h-6 bg-gray-200 shimmer rounded w-20 flex-shrink-0"></div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="space-y-1">
              <div className="h-3 bg-gray-200 shimmer rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 shimmer rounded w-1/2"></div>
            </div>
            <div className="space-y-1">
              <div className="h-3 bg-gray-200 shimmer rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 shimmer rounded w-1/2"></div>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 h-10 bg-gray-200 shimmer rounded"></div>
            <div className="flex-1 h-10 bg-gray-200 shimmer rounded"></div>
          </div>
        </div>
      ))}
    </div>
  </>
);

// MODAL FORM SHIMMER
export const ModalFormShimmer = () => (
  <>
    <Shimmer />
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 sm:p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="h-6 bg-gray-200 shimmer rounded w-48"></div>
          <div className="h-6 bg-gray-200 shimmer rounded w-6"></div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Section 1 */}
          <div>
            <div className="h-4 bg-gray-200 shimmer rounded w-40 mb-4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i}>
                  <div className="h-4 bg-gray-200 shimmer rounded w-24 mb-2"></div>
                  <div className="h-10 bg-gray-200 shimmer rounded"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <div className="h-4 bg-gray-200 shimmer rounded w-48 mb-4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i}>
                  <div className="h-4 bg-gray-200 shimmer rounded w-24 mb-2"></div>
                  <div className="h-10 bg-gray-200 shimmer rounded"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3 */}
          <div>
            <div className="h-4 bg-gray-200 shimmer rounded w-48 mb-4"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i}>
                  <div className="h-4 bg-gray-200 shimmer rounded w-24 mb-2"></div>
                  <div className="h-10 bg-gray-200 shimmer rounded"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <div className="flex-1 h-11 bg-gray-200 shimmer rounded"></div>
            <div className="flex-1 h-11 bg-gray-200 shimmer rounded"></div>
          </div>
        </div>
      </div>
    </div>
  </>
);

// LIST HEADER SHIMMER
export const ListHeaderShimmer = () => (
  <>
    <Shimmer />
    <div className="bg-white rounded-lg m-2 sm:m-3 md:m-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="h-6 bg-gray-200 shimmer rounded w-48"></div>
        <div className="flex gap-2">
          <div className="h-8 bg-gray-200 shimmer rounded w-8"></div>
          <div className="h-8 bg-gray-200 shimmer rounded w-8"></div>
        </div>
      </div>
    </div>
  </>
);

export default Shimmer;