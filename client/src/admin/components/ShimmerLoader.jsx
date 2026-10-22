// src/components/ShimmerLoader.jsx
import React from 'react';

const ShimmerLoader = () => {
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

// CLASS CARDS SHIMMER
export const ClassCardShimmer = () => (
  <>
    <ShimmerLoader />
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div key={item} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm">
          <div className="flex justify-between items-start mb-4 gap-2">
            <div className="flex-1">
              <div className="h-6 bg-gray-200 shimmer rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 shimmer rounded w-1/2"></div>
            </div>
            <div className="h-6 bg-gray-200 shimmer rounded w-20"></div>
          </div>

          <div className="mb-4 space-y-2">
            <div className="h-3 bg-gray-200 shimmer rounded"></div>
            <div className="h-3 bg-gray-200 shimmer rounded"></div>
            <div className="h-2 bg-gray-200 shimmer rounded mt-2"></div>
          </div>

          <div className="flex justify-between mb-3">
            <div className="h-3 bg-gray-200 shimmer rounded w-1/3"></div>
            <div className="h-3 bg-gray-200 shimmer rounded w-1/4"></div>
          </div>

          <div className="h-10 bg-gray-200 shimmer rounded"></div>
        </div>
      ))}
    </div>
  </>
);

// SUMMARY CARDS SHIMMER
export const SummaryCardsShimmer = () => (
  <>
    <ShimmerLoader />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
      {[1, 2, 3].map((item) => (
        <div key={item} className="bg-white p-4 sm:p-6 rounded-lg shadow-sm">
          <div className="h-4 bg-gray-200 shimmer rounded w-1/2 mb-3"></div>
          <div className="h-8 bg-gray-200 shimmer rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 shimmer rounded w-1/2"></div>
        </div>
      ))}
    </div>
  </>
);

// STUDENTS TABLE SHIMMER (Desktop)
export const StudentTableShimmer = () => (
  <>
    <ShimmerLoader />
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-200">
            <th className="px-6 py-3 text-left"><div className="h-4 bg-gray-200 shimmer rounded w-3/4"></div></th>
            <th className="px-6 py-3 text-left"><div className="h-4 bg-gray-200 shimmer rounded w-1/2"></div></th>
            <th className="px-6 py-3 text-right"><div className="h-4 bg-gray-200 shimmer rounded w-1/3"></div></th>
            <th className="px-6 py-3 text-right"><div className="h-4 bg-gray-200 shimmer rounded w-1/3"></div></th>
            <th className="px-6 py-3 text-right"><div className="h-4 bg-gray-200 shimmer rounded w-1/3"></div></th>
            <th className="px-6 py-3 text-left"><div className="h-4 bg-gray-200 shimmer rounded w-1/4"></div></th>
            <th className="px-6 py-3 text-left"><div className="h-4 bg-gray-200 shimmer rounded w-1/3"></div></th>
            <th className="px-6 py-3 text-left"><div className="h-4 bg-gray-200 shimmer rounded w-1/4"></div></th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5].map((row) => (
            <tr key={row} className="border-b border-gray-200">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((col) => (
                <td key={col} className="px-6 py-4">
                  <div className="h-4 bg-gray-200 shimmer rounded w-3/4"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// STUDENTS CARDS SHIMMER (Mobile)
export const StudentCardsShimmer = () => (
  <>
    <ShimmerLoader />
    <div className="space-y-3 p-3">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start gap-2 mb-2">
            <div className="flex-1">
              <div className="h-4 bg-gray-200 shimmer rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 shimmer rounded w-1/2"></div>
            </div>
            <div className="h-6 bg-gray-200 shimmer rounded w-20"></div>
          </div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 shimmer rounded"></div>
            <div className="h-3 bg-gray-200 shimmer rounded"></div>
            <div className="h-3 bg-gray-200 shimmer rounded"></div>
          </div>
          <div className="h-10 bg-gray-200 shimmer rounded"></div>
        </div>
      ))}
    </div>
  </>
);

export default ShimmerLoader;