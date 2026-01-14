import { useState } from "react";
import { signOut } from "firebase/auth";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { auth } from "./lib/firebase";
import { useAuthRole } from "./hooks/useAuth.js";
import { isEmailAllowed, performanceAllowlist, rosterViewAllowlist } from "./lib/access";
import Navbar from "./components/NavBar.jsx";
import LoginModal from "./components/LoginModal.jsx";
import SalesPage from "./pages/SalesPage.jsx";
import KnocksPage from "./pages/KnocksPage.jsx";
import RosterPage from "./pages/RosterPage";
import OnboardingPage from "./pages/Onboarding";
import LeaderboardPage from "./pages/LeaderboardPage.jsx";
import PerformanceDashboardPage from "./pages/PerformanceDashboardPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

export default function App() {
  const { user, isAdmin, isSuperAdmin, loading, isDemo } = useAuthRole();
  const [navHidden, setNavHidden] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const canViewPerformance =
    (isAdmin && isEmailAllowed(performanceAllowlist, user?.email)) ||
    isDemo;
  const canViewRoster = isAdmin || isEmailAllowed(rosterViewAllowlist, user?.email);
  const showNav = isAdmin || isDemo || canViewRoster;

  return (
    <div className="min-h-screen bg-white/30 backdrop-blur-xl backdrop-saturate-150 relative">
      <div className="fixed inset-0 pointer-events-none bg-[url('/noise.png')] opacity-10 mix-blend-soft-light" />
      <BrowserRouter>
        {showNav && (
          <Navbar
            hidden={navHidden}
            setHidden={setNavHidden}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            isDemo={isDemo}
            canViewPerformance={canViewPerformance}
            canViewRoster={canViewRoster}
            onLogout={() => signOut(auth)}
            onOpenLogin={() => setLoginOpen(true)}
          />
        )}
        {!showNav && !loading && (
          <div className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b border-black/10">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 sm:px-4">
              <div className="flex items-center gap-2">
                <img src="/ab-logo.png" className="h-6 sm:h-7" alt="AB" />
                <span className="text-sm sm:text-base font-semibold tracking-tight">
                  Sales Dashboard
                </span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setLoginOpen(true)}>
                Admin Login
              </button>
            </div>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/sales" replace />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route
            path="/performance"
            element={
              loading ? (
                <div className="p-6 text-slate-600">Checking access...</div>
              ) : canViewPerformance ? (
                <PerformanceDashboardPage />
              ) : (
                <Navigate to="/sales" replace />
              )
            }
          />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/knocks" element={<KnocksPage />} />
          <Route
            path="/roster"
            element={isDemo ? <Navigate to="/sales" replace /> : <RosterPage />}
          />
          <Route
            path="/onboarding"
            element={
              isDemo ? <Navigate to="/sales" replace /> : <OnboardingPage />
            }
          />
          <Route
            path="/settings"
            element={
              loading ? (
                <div className="p-6 text-slate-600">Checking access...</div>
              ) : !isDemo && isSuperAdmin ? (
                <SettingsPage />
              ) : (
                <Navigate to="/sales" replace />
              )
            }
          />
        </Routes>

        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </BrowserRouter>
    </div>
  );
}
