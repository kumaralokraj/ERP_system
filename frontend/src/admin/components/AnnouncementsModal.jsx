import React, { useState } from "react";
import AnnouncementForm from "./AnnouncementForm";
import AnnouncementsList from "./AnnouncementsList";
import { useAuth } from '../../context/authContext/AuthContext';
import { useAdmin } from "../../context/adminContext/AdminContext";
import { useNotifier } from "../../context/notificationContext/NotificationContext";
import { getApiErrorMessage } from "../../lib/formValidation";

const AnnouncementsModal = ({ onClose }) => {
    const [showForm, setShowForm] = useState(false);
    const { token, axios } = useAuth();
    const { notify, confirm } = useNotifier();
    const {announcements,setAnnouncements,announcementsLoading} = useAdmin();
    

    const handleAddAnnouncement = async (newAnnouncement) => {
        try {
            const response = await axios.post('/admin/announcement/create', newAnnouncement, { headers: { token } });
            setAnnouncements([response.data.announcement, ...announcements]);
            setShowForm(false);
            return response.data.announcement;
        } catch (error) {
            console.error("Error creating announcement:", error);
            throw new Error(getApiErrorMessage(error, "Failed to create announcement"));
        }
    };

    const handleDeleteAnnouncement = async (id) => {
        const shouldDelete = await confirm({
            title: 'Delete announcement',
            message: 'Are you sure you want to delete this announcement?',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            tone: 'danger',
        });

        if (!shouldDelete) {
            return;
        }

        try {
            await axios.delete(`/admin/announcement/${id}`, { headers: { token } });
            setAnnouncements(announcements.filter(ann => ann._id !== id));
            notify.success('Announcement deleted successfully');
        } catch (error) {
            console.error("Error deleting announcement:", error);
            notify.error(getApiErrorMessage(error, 'Failed to delete announcement'));
        }
    };

    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm sm:max-w-md md:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                        Announcements
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-xl sm:text-2xl font-light flex-shrink-0"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 scrollbar-hidden overflow-y-auto p-3 sm:p-4 md:p-6">
                    {announcementsLoading ? (
                        <div className="flex justify-center items-center h-40">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-blue-500"></div>
                        </div>
                    ) : (
                        <>
                            {!showForm ? (
                                <>
                                    <button
                                        onClick={() => setShowForm(true)}
                                        className="mb-4 sm:mb-6 w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 sm:py-3 px-3 sm:px-4 rounded-lg transition text-sm sm:text-base"
                                    >
                                        + Create New Announcement
                                    </button>
                                    <AnnouncementsList
                                        announcements={announcements}
                                        onDelete={handleDeleteAnnouncement}
                                    />
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setShowForm(false)}
                                        className="mb-3 sm:mb-4 text-purple-500 hover:text-purple-700 font-semibold text-sm sm:text-base"
                                    >
                                        ← Back to Announcements
                                    </button>
                                    <AnnouncementForm
                                        onSubmit={handleAddAnnouncement}
                                        onCancel={() => setShowForm(false)}
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnnouncementsModal;
