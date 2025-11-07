import { useState } from "react";
import { signOut } from "firebase/auth";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { auth } from "./lib/firebase";
import { useAuthRole } from "./hooks/useAuth.js";
import Navbar from "./components/Navbar.jsx";
import LoginModal from "./components/LoginModal.jsx";
import SalesPage from "./pages/SalesPage.jsx";
import KnocksPage from "./pages/KnocksPage.jsx";

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

        {/* simple secondary nav bar with links */}
        {!navHidden && (
          <div className="sticky top-[56px] z-30 bg-white/40 backdrop-blur border-b border-white/20">
            <div className="mx-auto max-w-6xl px-4 py-2 flex gap-3">
              <NavLink to="/sales" className={({isActive}) =>
                `btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`
              }>Sales</NavLink>
              <NavLink to="/knocks" className={({isActive}) =>
                `btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`
              }>Knocks</NavLink>
            </div>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/sales" replace />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/knocks" element={<KnocksPage />} />
        </Routes>

        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      </BrowserRouter>
    </div>
  );
}
