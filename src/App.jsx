import { useState } from "react";
import { signOut } from "firebase/auth";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { auth } from "./lib/firebase";
import { useAuthRole } from "./hooks/useAuth.js";
import Navbar from "./components/NavBar.jsx";
import LoginModal from "./components/LoginModal.jsx";
import SalesPage from "./pages/SalesPage.jsx";
import KnocksPage from "./pages/KnocksPage.jsx";
import RosterPage from "./pages/RosterPage";
import OnboardingPage from "./pages/Onboarding";
import LeaderboardPage from "./pages/LeaderboardPage.jsx";
export default function App() {
  const { isAdmin, loading } = useAuthRole();
  const [navHidden, setNavHidden] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white/30 backdrop-blur-xl backdrop-saturate-150 relative">
      <div className="fixed inset-0 pointer-events-none bg-[url('/noise.png')] opacity-10 mix-blend-soft-light" />
      <BrowserRouter>
        <Navbar
          hidden={navHidden}
          setHidden={setNavHidden}
          isAdmin={isAdmin}
          onLogout={() => signOut(auth)}
          onOpenLogin={() => setLoginOpen(true)}
        />

        <Routes>
          <Route path="/" element={<Navigate to="/sales" replace />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/knocks" element={<KnocksPage />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Routes>

        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </BrowserRouter>
    </div>
  );
}
