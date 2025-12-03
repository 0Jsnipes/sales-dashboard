// src/components/Navbar.jsx
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";

export default function Navbar({ hidden, setHidden, isAdmin, onLogout, onOpenLogin }) {
  const [scrolled, setScrolled] = useState(false);

  // Add shadow/border after slight scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (hidden) {
    return (
      <button
        className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-white/70 px-3 py-1 text-xs shadow border border-black/10 backdrop-blur"
        onClick={() => setHidden(false)}
      >
        Show Nav
      </button>
    );
  }

  return (
    <div
      className={clsx(
        "navbar sticky top-0 z-40",
        "bg-white/30 backdrop-blur-xl backdrop-saturate-150",
        scrolled ? "border-b border-black/10 shadow-sm" : "border-b border-white/20"
      )}
      style={{ willChange: "transform" }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-3 sm:px-4">
        {/* Left: brand + hide */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            className="btn btn-ghost btn-sm"
            title="Hide"
            onClick={() => setHidden(true)}
          >
            Hide
          </button>

          <div className="flex items-center gap-2">
            <img src="/ab-logo.png" className="h-6 sm:h-7" alt="AB" />
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Sales Dashboard
            </span>
          </div>
        </div>

        {/* Center: primary nav */}
        <nav className="hidden sm:flex items-center gap-5">
          {isAdmin ? (
            <>
              <NavButton to="/sales">Sales</NavButton>
              <NavButton to="/knocks">Knocks</NavButton>
              <NavButton to="/roster">Roster</NavButton>
              <NavButton to="/onboarding">Onboarding</NavButton>
            </>
          ) : (
            <>
              <DisabledButton>Sales</DisabledButton>
              <DisabledButton>Knocks</DisabledButton>
            </>
          )}
        </nav>

        {/* Right: auth controls */}
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <button className="btn btn-outline btn-sm" onClick={onLogout}>
              Logout
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onOpenLogin}>
              Admin Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function NavButton({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "btn btn-ghost btn-sm px-3",
          "text-slate-800/90",
          isActive && "btn-active bg-transparent border-b-2 border-yellow-200 text-slate-900 font-semibold"
        )
      }
      end
    >
      {children}
    </NavLink>
  );
}

function DisabledButton({ children }) {
  return (
    <button
      className="btn btn-ghost btn-sm px-3 btn-disabled text-slate-400"
      disabled
      aria-disabled="true"
      title="Login required"
      type="button"
    >
      {children}
    </button>
  );
}
