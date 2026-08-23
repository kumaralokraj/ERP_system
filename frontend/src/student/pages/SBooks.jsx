import { useState } from 'react'
import { useStudent } from '../../context/studentContext/StudentContext';
import { FiBook, FiBookOpen, FiAlertTriangle } from 'react-icons/fi';
import { isDiaryItem } from '../../lib/bookInventory';

const SBooks = () => {
  const [activeTab, setActiveTab] = useState('assigned');
  const { issuedBooks, catalogBooks, initialLoading } = useStudent();


  const getConditionColor = (condition) => {
    switch (condition) {
      case "good":
        return "text-green-600 bg-green-50";
      case "damaged":
        return "text-yellow-600 bg-yellow-50";
      case "lost":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-3 sm:p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
          <p className="text-gray-600 font-semibold text-xs sm:text-sm">Loading books...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-6 px-3 sm:px-4">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Books & Diaries</h1>
          <p className="text-gray-600 text-xs sm:text-sm mt-1 sm:mt-2">View assigned books, diaries, and curriculum materials</p>
        </div>

        {/* Error Message */}
        {!issuedBooks.length && !catalogBooks.length && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm flex items-center gap-2">
            <FiAlertTriangle className="w-4 h-4 shrink-0" /> No books data available
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
            <p className="text-gray-600 text-xs sm:text-sm font-medium">Items Assigned</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">
              {issuedBooks.filter(b => b.status === 'issued').length}
            </h3>
          </div>

          <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
            <p className="text-gray-600 text-xs sm:text-sm font-medium">Curriculum Books</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-green-600 mt-2">
              {catalogBooks.length}
            </h3>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('assigned')}
              className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm transition flex items-center justify-center gap-1.5 ${activeTab === 'assigned'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-700 hover:text-gray-900'
                }`}
            >
              <FiBookOpen className="w-4 h-4" /> Assigned ({issuedBooks.filter(b => b.status === 'issued').length})
            </button>
            <button
              onClick={() => setActiveTab('curriculum')}
              className={`flex-1 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm transition flex items-center justify-center gap-1.5 ${activeTab === 'curriculum'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-700 hover:text-gray-900'
                }`}
            >
              <FiBook className="w-4 h-4" /> Curriculum ({catalogBooks.length})
            </button>
          </div>

          {/* ASSIGNED BOOKS TAB */}
          {activeTab === 'assigned' && (
            <div className="p-3 sm:p-6">
              {issuedBooks.filter(b => b.status === 'issued').length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                  {issuedBooks
                    .filter(b => b.status === 'issued')
                    .map((book) => {
                      return (
                        <div
                          key={book._id}
                          className="bg-white rounded-lg sm:rounded-xl border border-gray-200 overflow-hidden hover:shadow-md sm:hover:shadow-lg transition-shadow"
                        >
                          {/* Header */}
                          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                            <h3 className="text-sm sm:text-base font-bold text-gray-900 line-clamp-2">
                              {book.bookName || book.bookId?.name || "N/A"}
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">
                              {book.bookId?.subject || "N/A"}
                            </p>
                            {isDiaryItem({ itemType: book.itemType || book.bookId?.itemType }) && (
                              <span className="mt-2 inline-block rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700">
                                Diary - final issue
                              </span>
                            )}
                          </div>

                          {/* Body */}
                          <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                            {/* Class Info */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs sm:text-sm text-gray-600 font-medium">Class</span>
                              <span className="bg-blue-100 text-blue-800 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-semibold">
                                {book.className}
                              </span>
                            </div>

                            {/* Issue & Condition */}
                            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2 sm:pt-3 border-t border-gray-100">
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-0.5 sm:mb-1">Issued</p>
                                <p className="text-xs sm:text-sm font-semibold text-gray-900">
                                  {new Date(book.issueDate).toLocaleDateString("en-US", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 font-medium mb-0.5 sm:mb-1">Condition</p>
                                <span className={`inline-block px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold capitalize ${getConditionColor(book.condition)}`}>
                                  {book.condition}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <FiBookOpen className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 sm:mb-4 text-gray-300" />
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">No Items Assigned</h3>
                  <p className="text-xs sm:text-sm text-gray-600">You don't have any books or diaries assigned yet.</p>
                </div>
              )}
            </div>
          )}

          {/* CURRICULUM BOOKS TAB */}
          {activeTab === 'curriculum' && (
            <div className="p-3 sm:p-6">
              {catalogBooks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                  {catalogBooks.map((book) => (
                    <div
                      key={book._id}
                      className="bg-white rounded-lg sm:rounded-xl border border-gray-200 overflow-hidden hover:shadow-md sm:hover:shadow-lg transition-shadow"
                    >
                      {/* Header */}
                      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
                        <h3 className="text-sm sm:text-base font-bold text-gray-900 line-clamp-2">
                          {book.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">
                          {book.subject}
                        </p>
                        {isDiaryItem(book) && (
                          <span className="mt-2 inline-block rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700">
                            Diary - available to all students
                          </span>
                        )}
                      </div>

                      {/* Body */}
                      <div className="px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                        <div className="pt-2 sm:pt-3 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600 font-medium">Class</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-900">{book.className}</span>
                        </div>

                        {/* Price */}
                        <div className="pt-2 sm:pt-3 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-gray-600 font-medium">Price</span>
                          <span className="text-base sm:text-lg font-bold text-gray-900">₹{book.price.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <FiBook className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 sm:mb-4 text-gray-300" />
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 sm:mb-2">No Books in Curriculum</h3>
                  <p className="text-xs sm:text-sm text-gray-600">No books are available for your class.</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default SBooks;
