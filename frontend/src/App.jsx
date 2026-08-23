import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider from './context/authContext/AuthProvider';
import { AdminProvider } from './context/adminContext/AdminProvider';
import { StudentProvider } from './context/studentContext/StudentProvider';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import PermissionProtectedRoute from './components/PermissionProtectedRoute';
import Login from './components/Login';
import Signup from './components/Signup';


// Admin Components
import Admin from './admin/Admin';
import Dashboard from './admin/pages/Dashboard';
import TeacherListPage from './admin/pages/Teachers';
import StudentListPage from './admin/pages/Students';
import Fees from './admin/pages/Fees';
import StudentFeeProfile from './admin/pages/StudentFeeProfile';
import FamilyFeeProfile from './admin/pages/FamilyFeeProfile';
import Books from './admin/pages/Books';
import Uniforms from './admin/pages/Uniforms';
import StudentUniformProfile from './admin/pages/StudentUniformProfile';
import Profile from './admin/pages/Profile';
import ClassListPage from './admin/pages/Classes';
import Promotions from './admin/pages/Promotions';
import StudentProfile from "./admin/pages/StudentProfile";
import ClassDetails from "./admin/pages/ClassDetails";
import TeacherProfile from './admin/pages/TeacherProfile';
import Settings from './admin/pages/Settings'
import UniformInventory from './admin/pages/UniformInventory';
import BookInventory from './admin/pages/BookInventory';
import StudentBookProfile from './admin/pages/StudentBookProfile';
import CreateUser from './admin/pages/CreateUser';
import ManageUsers from './admin/pages/ManageUsers';


// Student Components
import Student from './student/Student';
import StudentHome from './student/pages/Home';
import SProfile from './student/pages/SProfile';
import SFees from './student/pages/SFees';
import SBooks from './student/pages/SBooks';
import SUniforms from './student/pages/SUniforms';
import SAnnouncements from './student/pages/SAnnouncements';
import SSettings from './student/pages/SSettings';
import Parent from './parent/Parent';

const App = () => {
  useEffect(() => {
    const preventFocusedNumberWheel = (event) => {
      const target = event.target;

      if (
        !(target instanceof HTMLInputElement) ||
        target.type !== 'number' ||
        document.activeElement !== target
      ) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener('wheel', preventFocusedNumberWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener('wheel', preventFocusedNumberWheel, {
        capture: true,
      });
    };
  }, []);

  return (
    <AuthProvider>
          <Routes>
            {/* Universal Login */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route
              path="parent"
              element={
                <RoleProtectedRoute requiredRole="parent">
                  <Parent />
                </RoleProtectedRoute>
              }
            />

            {/* Admin Routes - Protected */}
            <Route
              path="admin"
              element={
                <RoleProtectedRoute requiredRoles={["admin", "manager", "staff"]}>
                  <AdminProvider>
                    <Admin />
                  </AdminProvider>
                </RoleProtectedRoute>
              }
            >
              <Route
                index
                element={
                  <PermissionProtectedRoute permission="dashboard.view">
                    <Dashboard />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/teachers"
                element={
                  <PermissionProtectedRoute permission="teachers.view">
                    <TeacherListPage />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/teacher/:id"
                element={
                  <PermissionProtectedRoute permission="teachers.view">
                    <TeacherProfile />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/students"
                element={
                  <PermissionProtectedRoute permission="students.view">
                    <StudentListPage />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/student/:id"
                element={
                  <PermissionProtectedRoute permission="students.view">
                    <StudentProfile />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/fees"
                element={
                  <PermissionProtectedRoute permission="fees.view">
                    <Fees />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/fees/student/:studentId"
                element={
                  <PermissionProtectedRoute permission="fees.view">
                    <StudentFeeProfile />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/fees/family/:familyId"
                element={
                  <PermissionProtectedRoute permission="fees.view">
                    <FamilyFeeProfile />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/classes"
                element={
                  <PermissionProtectedRoute permission="classes.view">
                    <ClassListPage />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/promotions"
                element={
                  <PermissionProtectedRoute permission="promotions.view">
                    <Promotions />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/class/:id"
                element={
                  <PermissionProtectedRoute permission="classes.view">
                    <ClassDetails />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/uniforms"
                element={
                  <PermissionProtectedRoute permission="uniforms.view">
                    <Uniforms />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/uniforms/student/:studentId"
                element={
                  <PermissionProtectedRoute permission="uniforms.view">
                    <StudentUniformProfile />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/uniforms/inventory"
                element={
                  <PermissionProtectedRoute permission="uniforms.view">
                    <UniformInventory />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/books"
                element={
                  <PermissionProtectedRoute permission="books.view">
                    <Books />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path='/admin/books/inventory'
                element={
                  <PermissionProtectedRoute permission="books.view">
                    <BookInventory />
                  </PermissionProtectedRoute>
                }
              />
              <Route
                path="/admin/books/student/:studentId"
                element={
                  <PermissionProtectedRoute permission="books.view">
                    <StudentBookProfile />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/users/manage"
                element={
                  <RoleProtectedRoute requiredRoles={["admin"]}>
                    <PermissionProtectedRoute permission="users.view">
                      <ManageUsers />
                    </PermissionProtectedRoute>
                  </RoleProtectedRoute>
                }
              />

              <Route
                path="/admin/users/create"
                element={
                  <RoleProtectedRoute requiredRoles={["admin"]}>
                    <PermissionProtectedRoute permission="users.create">
                      <CreateUser />
                    </PermissionProtectedRoute>
                  </RoleProtectedRoute>
                }
              />

              <Route
                path="/admin/profile"
                element={
                  <PermissionProtectedRoute permission="profile.view">
                    <Profile />
                  </PermissionProtectedRoute>
                }
              />

              <Route
                path="/admin/settings"
                element={
                  <PermissionProtectedRoute permission="settings.view">
                    <Settings />
                  </PermissionProtectedRoute>
                }
              />
            </Route>
            

            {/* Student Routes - Protected */}
            <Route
              path="student"
              element={
                <RoleProtectedRoute requiredRole="student">
                  <StudentProvider>
                    <Student />
                  </StudentProvider>
                </RoleProtectedRoute>
              }
            >
              <Route index element={<StudentHome />} />
              <Route path="/student/profile" element={<SProfile />} />
              <Route path="/student/fees" element={<SFees />} />
              <Route path="/student/books" element={<SBooks />} />
              <Route path="/student/uniforms" element={<SUniforms />} />
              <Route path="/student/announcements" element={<SAnnouncements />} />
              <Route path='/student/settings' element={<SSettings />} />
            </Route>



            {/* Redirect root to login */}
            <Route path="/" element={<Navigate to="/login" replace />} />

          </Routes>
    </AuthProvider>
  );
};

export default App;
