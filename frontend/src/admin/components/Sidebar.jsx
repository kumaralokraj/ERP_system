import { Link } from "react-router-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/authContext/AuthContext";

const menuSections = [
    {
        title: "MENU",
        items: [
            {
                label: "Dashboard",
                path: "/admin",
                icon: '/home.png',
        permission: "dashboard.view",
            },
            {
                label: "Fees",
                path: "/admin/fees",
                icon: '/finance.png',
        permission: "fees.view",
            },
            {
                label: "Classes",
        path: "/admin/classes",
                icon: '/class.png',
        permission: "classes.view",
            },
            {
                label: "Promotions",
        path: "/admin/promotions",
                icon: '/class.png',
        permission: "promotions.view",
            },
            {
                label: "Teachers",
                path: "/admin/teachers",
                icon: '/teacher.png',
        permission: "teachers.view",
            },
            {
                label: "Students",
                path: "/admin/students",
                icon: '/student.png',
        permission: "students.view",
            },

        ],
    },
    {
        title: "INVENTORY",
        items: [
            {
                label: "Uniforms",
                path: "/admin/uniforms",
                icon: '/uniform.png',
              permission: "uniforms.view",
            },
            {
                label: "Books",
                path: "/admin/books",
                icon: '/books.png',
              permission: "books.view",
            },
        ],
    },
    {
        title: "OTHER",
        items: [
            {
              label: "Manage Users",
              path: "/admin/users/manage",
              icon: '/profile.png',
              permission: "users.view",
              adminOnly: true,
            },
            {
              label: "Create User",
              path: "/admin/users/create",
              icon: '/profile.png',
              permission: "users.create",
              adminOnly: true,
            },
            {
                label: "Profile",
                path: "/admin/profile",
                icon: '/profile.png',
              permission: "profile.view",
            },
            {
                label: "Settings",
                path: "/admin/settings",
                icon: '/setting.png',
              permission: "settings.view",
            },
            {
                label: "Logout",
                path: "/logout",
                icon: '/logout.png',
            },
        ],
    },
];

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
        const { logout, hasPermission, role } = useAuth();

        const visibleSections = menuSections
          .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              (!item.permission || hasPermission(item.permission)) &&
              (!item.adminOnly || role === 'admin')
          ),
          }))
          .filter((section) => section.items.length > 0);

        const isActive = (path) => {
          if (path === '/admin') {
          return location.pathname === '/admin' || location.pathname === '/admin/';
          }
          return location.pathname === path || location.pathname.startsWith(`${path}/`);
        };

    const handleItemClick = async (item) => {
        // Logout logic
        if (item.label === "Logout") {
            const didLogout = await logout();
            if (didLogout) {
              navigate("/login");
            }
            return;
        }

        // Normal navigation
        navigate(item.path);
    };

    return (
        <div className="flex flex-col h-screen bg-white shadow-md 
                    w-16 md:w-72 transition-all duration-300">

      {/* LOGO */}
      <Link
        to="/admin"
        className="flex items-center gap-2 m-4 justify-center md:justify-start"
      >
        <img src="/logo.png" className="w-8 h-8" />
        <span className="font-bold hidden md:block">
          Gulzar Group of institues
        </span>
      </Link>

      {/* MENU */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4 py-1">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-4">

            {/* SECTION TITLE */}
            <p className="text-xs font-bold text-gray-500 px-4 mb-3 uppercase hidden md:block">
              {section.title}
            </p>

            <div className="space-y-2">
              {section.items.map((item) => (
                <div
                  key={item.label}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-center gap-3 px-3 md:px-4 py-3 
                              rounded-lg cursor-pointer transition
                              justify-center md:justify-start
                              ${
                                isActive(item.path)
                                  ? "bg-[#EEF2FF]"
                                  : "hover:bg-gray-200"
                              }`}
                >
                  <img src={item.icon} className="w-5 h-5" />

                  {/* LABEL */}
                  <span className="text-sm font-medium hidden md:block">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
    );
};

export default Sidebar;
