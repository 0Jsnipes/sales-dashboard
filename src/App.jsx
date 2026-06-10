import { Suspense, lazy, useState } from "react";
import { signOut } from "firebase/auth";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { auth } from "./lib/firebase";
import { useAuthRole } from "./hooks/useAuth.js";
import { isEmailAllowed, performanceAllowlist } from "./lib/access";
import { useRosterAccess } from "./hooks/useRosterAccess.js";
import Navbar from "./components/NavBar.jsx";
import InstallAppBanner from "./components/InstallAppBanner.jsx";
import LoginModal from "./components/LoginModal.jsx";
import SalesPage from "./pages/SalesPage.jsx";
import KnocksPage from "./pages/KnocksPage.jsx";
import RosterPage from "./pages/RosterPage";
import OnboardingPage from "./pages/Onboarding";
import LeaderboardPage from "./pages/LeaderboardPage.jsx";
import PerformanceDashboardPage from "./pages/PerformanceDashboardPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

const CoverageMapPage = lazy(() => import("./pages/CoverageMapPage.jsx"));

export default function App() {
  const { user, isAdmin, isSuperAdmin, loading, isDemo } = useAuthRole();
  const [navHidden, setNavHidden] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { canViewRoster, loading: rosterAccessLoading } = useRosterAccess(
    user?.email,
    isAdmin
  );
  const canViewPerformance =
    (isAdmin && isEmailAllowed(performanceAllowlist, user?.email)) ||
    isDemo;
  const appLoading = loading || rosterAccessLoading;
  const showNav = isAdmin || isDemo || canViewRoster;

  return (
    <div className="app-chrome">
      <div className="app-chrome__mesh" />
      <div className="app-chrome__grid" />
      <BrowserRouter>
        <InstallAppBanner />
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
        {!showNav && !appLoading && (
          <div className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[28px] border border-white/60 bg-white/70 px-4 py-3 shadow-[0_18px_40px_rgba(9,20,35,0.08)] backdrop-blur-xl sm:px-5">
              <div className="flex items-center gap-2">
                <div className="rounded-2xl bg-slate-950/95 p-2 shadow-lg shadow-slate-950/10">
                  <img src="/ab-logo.png" className="h-6 w-6 object-contain sm:h-7 sm:w-7" alt="AB" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
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
                <div className="px-6 py-10 text-sm text-slate-600">Checking access...</div>
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
            path="/coverage-map"
            element={
              <Suspense fallback={<div className="px-6 py-10 text-sm text-slate-600">Loading map tools...</div>}>
                <CoverageMapPage />
              </Suspense>
            }
          />
          <Route
            path="/roster"
            element={
              isDemo ? (
                <Navigate to="/sales" replace />
              ) : (
                <RosterPage
                  canViewRoster={canViewRoster}
                  accessLoading={rosterAccessLoading}
                />
              )
            }
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
                <div className="px-6 py-10 text-sm text-slate-600">Checking access...</div>
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
