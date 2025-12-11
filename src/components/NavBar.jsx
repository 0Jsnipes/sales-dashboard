// src/components/Navbar.jsx
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";

export default function Navbar({ hidden, setHidden, isAdmin, onLogout, onOpenLogin }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Add shadow/border after slight scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu if admin status changes (e.g., logout)
  useEffect(() => {
    if (!isAdmin) setMobileOpen(false);
  }, [isAdmin]);

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
      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-3 sm:px-4">
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

          {isAdmin && (
            <button
              className="btn btn-ghost btn-sm sm:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              type="button"
            >
              <span className="sr-only">Toggle menu</span>
              <span className={clsx("block h-0.5 w-5 bg-slate-800 transition-all", mobileOpen && "translate-y-1.5 rotate-45")} />
              <span className={clsx("block my-1 h-0.5 w-5 bg-slate-800 transition-opacity", mobileOpen && "opacity-0")} />
              <span className={clsx("block h-0.5 w-5 bg-slate-800 transition-all", mobileOpen && "-translate-y-1.5 -rotate-45")} />
            </button>
          )}
        </div>

        {isAdmin && (
          <div
            id="mobile-nav"
            className={clsx(
              "absolute left-0 right-0 top-full sm:hidden",
              "bg-white/95 backdrop-blur border-b border-black/10 shadow-sm",
              "px-3 pb-3",
              mobileOpen ? "block" : "hidden"
            )}
          >
            <div className="flex flex-col gap-2 pt-3">
              <NavButton to="/sales" onClick={() => setMobileOpen(false)}>
                Sales
              </NavButton>
              <NavButton to="/knocks" onClick={() => setMobileOpen(false)}>
                Knocks
              </NavButton>
              <NavButton to="/roster" onClick={() => setMobileOpen(false)}>
                Roster
              </NavButton>
              <NavButton to="/onboarding" onClick={() => setMobileOpen(false)}>
                Onboarding
              </NavButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function NavButton({ to, children, onClick }) {
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
      onClick={onClick}
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
