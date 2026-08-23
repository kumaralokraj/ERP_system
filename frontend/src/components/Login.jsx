import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext/AuthContext";
import {
  getApiErrorMessage,
  validateLoginForm,
} from "../lib/formValidation";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState("admin");
  const [formError, setFormError] = useState("");

  const initialTokenRef = useRef(localStorage.getItem("token"));
  const initialRoleRef = useRef(localStorage.getItem("role"));

  const {
    login,
    isLoading,
    error,
    token,
    role,
    getDefaultAdminRoute,
    isRestoringSession,
    resetAuthState,
  } = useAuth();

  const navigate = useNavigate();

  // Reset old authentication state when opening login page
  useEffect(() => {
    if (initialTokenRef.current || initialRoleRef.current) {
      resetAuthState();
    }
  }, [resetAuthState]);

  // Redirect after successful login
  useEffect(() => {
    if (isRestoringSession) return;
    if (!token || !role) return;

    // Student dashboard
    if (role === "student") {
      navigate("/student", { replace: true });
      return;
    }

    // Admin / Manager / Staff dashboard
    navigate(getDefaultAdminRoute(role), {
      replace: true,
    });
  }, [
    isRestoringSession,
    token,
    role,
    navigate,
    getDefaultAdminRoute,
  ]);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();

    setFormError("");

    const { errors, payload } = selectedRole === "parent"
      ? {
          errors: {
            email: email.trim() ? "" : "Family code is required",
            password: password ? "" : "Password is required",
          },
          payload: { email: email.trim().toUpperCase(), password },
        }
      : validateLoginForm({ email, password });

    if (errors.email || errors.password) {
      setFormError(errors.email || errors.password);
      return;
    }

    try {
      await login(
        payload.email,
        payload.password,
        selectedRole
      );
    } catch (loginError) {
      setFormError(
        getApiErrorMessage(loginError, "Login failed")
      );
    }
  };

  // Hide login while restoring existing session
  if (isRestoringSession) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">

      <div className="bg-white shadow-lg rounded-lg px-8 py-6 w-full max-w-md">

        {/* Heading */}
        <h2 className="text-2xl font-bold text-center mb-6">
          School Management System
        </h2>

        {/* Login Form */}
        <form
          onSubmit={handleLogin}
          className="space-y-4"
        >

          {/* Role Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Login As
            </label>

            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                setFormError("");
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black"
            >
              <option value="admin">
                Admin
              </option>

              <option value="manager">
                Manager
              </option>

              <option value="staff">
                Staff
              </option>

              <option value="student">
                Student
              </option>

              <option value="parent">
                Parent
              </option>
            </select>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {selectedRole === "parent" ? "Family Code" : "Email Address"}
            </label>

            <input
              type={selectedRole === "parent" ? "text" : "email"}
              placeholder={selectedRole === "parent" ? "FAM-..." : "your@gmail.com"}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFormError("");
              }}
              required
              autoComplete={selectedRole === "parent" ? "username" : "email"}
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFormError("");
              }}
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-black text-white py-2 font-medium hover:bg-gray-900 transition disabled:opacity-60"
          >
            {isLoading
              ? "Logging in..."
              : "Login"}
          </button>

        </form>

        {/* Error Message */}
        {(formError || error) && (
          <p className="mt-4 text-sm text-red-600 text-center">
            {formError || error}
          </p>
        )}

        {/* Signup Section */}
        <div className="mt-6 border-t pt-5">

          <p className="text-center text-sm text-gray-600">
            Don't have an account?
          </p>

          <button
            type="button"
            onClick={() => navigate("/signup")}
            className="w-full mt-2 rounded-md border border-black text-black py-2 font-medium hover:bg-black hover:text-white transition"
          >
            Create Account
          </button>

        </div>

      </div>

    </div>
  );
};

export default Login;