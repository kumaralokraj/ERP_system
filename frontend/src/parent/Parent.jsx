import { useEffect, useState } from "react";
import { useAuth } from "../context/authContext/AuthContext";

const Parent = () => {
  const { axios, token, user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios.get("/parent/profile", { headers: { token } })
      .then((response) => {
        if (active && response.data?.success) setProfile(response.data);
      })
      .catch(() => {
        if (active) setError("Unable to load your family profile");
      });

    return () => { active = false; };
  }, [axios, token]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-600">Parent portal</p>
            <h1 className="text-3xl font-bold text-slate-900">
              {profile?.family?.displayName || user?.name || "Your family"}
            </h1>
            <p className="mt-1 text-slate-500">
              Family code: {profile?.family?.familyCode || user?.familyCode || "..."}
            </p>
          </div>
          <button type="button" onClick={logout} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Logout
          </button>
        </header>

        {error && <p className="rounded-md bg-red-50 p-4 text-red-700">{error}</p>}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Children</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {(profile?.students || []).map((student) => (
              <div key={student._id} className="flex flex-wrap items-center justify-between gap-2 py-4">
                <div>
                  <p className="font-medium text-slate-900">{student.name || `${student.firstName} ${student.lastName}`}</p>
                  <p className="text-sm text-slate-500">Student ID: {student.studentId}</p>
                </div>
                <p className="text-sm text-slate-600">{student.class?.displayName || student.class?.name || "Class not assigned"}</p>
              </div>
            ))}
            {profile && !profile.students?.length && <p className="py-4 text-slate-500">No children are linked to this family yet.</p>}
            {!profile && !error && <p className="py-4 text-slate-500">Loading family profile...</p>}
          </div>
        </section>
      </div>
    </main>
  );
};

export default Parent;