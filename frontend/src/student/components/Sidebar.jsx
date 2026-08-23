import { Link } from "react-router-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";
import { FiHome, FiUser, FiDollarSign, FiBook, FiShield, FiBell, FiSettings, FiLogOut } from 'react-icons/fi';

const menuItems = [
    {
        title: "MENU",
        items: [
            {
                label: "Home",
                path: "/student",
                icon: FiHome,
                visible: ["student"],
            },
            {
                label: "Profile",
                path: "/student/profile",
                icon: FiUser,
                visible: ["student"],
            },
            {
                label: "Fees",
                path: "/student/fees",
                icon: FiDollarSign,
                visible: ["student"],
            },
            {
                label: "Books",
                path: "/student/books",
                icon: FiBook,
                visible: ["student"],
            },
            {
                label: "Uniforms",
                path: "/student/uniforms",
                icon: FiShield,
                visible: ["student"],
            },
            {
                label: "Announcements",
                path: "/student/announcements",
                icon: FiBell,
                visible: ["student"],
            },
        ],
    },
    {
        title: "OTHER",
        items: [
            {
                label: "Settings",
                path: "/student/settings",
                icon: FiSettings,
                visible: ["student"],
            },
            {
                label: "Logout",
                path: "/logout",
                icon: FiLogOut,
                visible: ["student"],
            },
        ],
    },
];

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout } = useAuth();

    const role = "student";

    const isActive = (path) => location.pathname === path;

    const handleItemClick = async (item) => {
        if (item.label === "Logout") {
            const didLogout = await logout();
            if (didLogout) {
                navigate("/login");
            }
            return;
        }

        navigate(item.path);
    };

    return (
        <div className="flex flex-col h-screen bg-white shadow-md 
                    w-16 md:w-72 transition-all duration-300">

            {/* LOGO */}
            <Link
                to="/student"
                className="flex items-center gap-2 m-4 justify-center md:justify-start"
            >
                <img src="/logo.png" className="w-8 h-8" />
                <span className="font-bold hidden md:block">
                    Golden Public School
                </span>
            </Link>

            {/* MENU */}
            <div className="flex-1 overflow-y-auto px-2 md:px-4 py-1">
                {menuItems.map((section) => (
                    <div key={section.title} className="mb-4">

                        {/* SECTION TITLE */}
                        <p className="text-xs font-bold text-gray-500 px-4 mb-3 uppercase hidden md:block">
                            {section.title}
                        </p>

                        <div className="space-y-2">
                            {section.items.map(
                                (item) =>
                                    item.visible.includes(role) && (
                                        <div
                                            key={item.label}
                                            onClick={() => handleItemClick(item)}
                                            className={`flex items-center gap-3 px-3 md:px-4 py-3 
                                                      rounded-lg cursor-pointer transition
                                                      justify-center md:justify-start
                                                      ${
                                                          isActive(item.path)
                                                              ? "bg-[#EEF2FF] text-blue-600"
                                                              : "text-gray-600 hover:bg-gray-200"
                                                      }`}
                                        >
                                            <item.icon className="w-5 h-5" />

                                            {/* LABEL */}
                                            <span className="text-sm font-medium hidden md:block">
                                                {item.label}
                                            </span>
                                        </div>
                                    )
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Sidebar;