import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import clsx from "clsx";

export default function Navbar({
  isAdmin,
  isPrimarySuperAdmin,
  isManager,
  isUser,
  isDemo,
  canViewPerformance,
  canViewRoster,
  canViewOnboarding,
  onLogout,
  onOpenLogin,
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const showNav = isAdmin || isManager || isUser || isDemo || canViewRoster;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!showNav) setMobileOpen(false);
  }, [showNav]);

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
      <div
        className={clsx(
          "mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/60 bg-white/72 backdrop-blur-2xl",
          scrolled
            ? "shadow-[0_24px_56px_rgba(9,20,35,0.14)]"
            : "shadow-[0_16px_40px_rgba(9,20,35,0.08)]"
        )}
      >
        <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <div className="rounded-[22px] border border-slate-200 bg-white p-2 shadow-lg shadow-slate-950/10">
                <img src="/ab-logo.png" className="h-8 w-8 object-contain" alt="AB" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                  AB Sales
                </p>
                <p className="truncate text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Field Dashboard
                </p>
              </div>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center justify-center gap-2">
            {showNav ? (
              <>
                <NavButton to="/sales">Sales</NavButton>
                {canViewPerformance ? <NavButton to="/performance">Performance</NavButton> : null}
                <NavButton to="/leaderboard">Leaderboard</NavButton>
                <NavButton to="/knocks">Knocks</NavButton>
                <NavButton to="/coverage-map">Map</NavButton>
                {canViewRoster ? <NavButton to="/roster">Roster</NavButton> : null}
                {canViewOnboarding ? <NavButton to="/onboarding">Onboarding</NavButton> : null}
                {isPrimarySuperAdmin ? <NavButton to="/settings">Settings</NavButton> : null}
              </>
            ) : (
              <>
                <DisabledButton>Sales</DisabledButton>
                <DisabledButton>Performance</DisabledButton>
                <DisabledButton>Knocks</DisabledButton>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {isDemo && !isAdmin ? (
              <span className="badge hidden sm:inline-flex border-lime-200 bg-lime-100/80 text-slate-900">
                Demo Mode
              </span>
            ) : null}

            {isAdmin || isManager || isUser || isDemo ? (
              <button className="btn btn-outline btn-sm" onClick={onLogout} type="button">
                Logout
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={onOpenLogin} type="button">
                Sign In
              </button>
            )}

            {showNav ? (
              <button
                className="btn btn-ghost btn-square btn-sm lg:hidden"
                onClick={() => setMobileOpen((value) => !value)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                type="button"
              >
                <span className="sr-only">Toggle menu</span>
                <span className="flex flex-col gap-1.5">
                  <span
                    className={clsx(
                      "block h-0.5 w-5 rounded-full bg-slate-900 transition-all",
                      mobileOpen && "translate-y-2 rotate-45"
                    )}
                  />
                  <span
                    className={clsx(
                      "block h-0.5 w-5 rounded-full bg-slate-900 transition-all",
                      mobileOpen && "opacity-0"
                    )}
                  />
                  <span
                    className={clsx(
                      "block h-0.5 w-5 rounded-full bg-slate-900 transition-all",
                      mobileOpen && "-translate-y-2 -rotate-45"
                    )}
                  />
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {showNav ? (
          <div
            id="mobile-nav"
            className={clsx(
              "overflow-hidden border-t border-white/50 bg-white/68 transition-[max-height,opacity] duration-300 lg:hidden",
              mobileOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="grid gap-2 px-3 py-3 sm:grid-cols-2 sm:px-4">
              <NavButton to="/sales" onClick={() => setMobileOpen(false)}>
                Sales
              </NavButton>
              {canViewPerformance ? (
                <NavButton to="/performance" onClick={() => setMobileOpen(false)}>
                  Performance
                </NavButton>
              ) : null}
              <NavButton to="/leaderboard" onClick={() => setMobileOpen(false)}>
                Leaderboard
              </NavButton>
              <NavButton to="/knocks" onClick={() => setMobileOpen(false)}>
                Knocks
              </NavButton>
              <NavButton to="/coverage-map" onClick={() => setMobileOpen(false)}>
                Map
              </NavButton>
              {canViewRoster ? (
                <NavButton to="/roster" onClick={() => setMobileOpen(false)}>
                  Roster
                </NavButton>
              ) : null}
              {canViewOnboarding ? (
                <NavButton to="/onboarding" onClick={() => setMobileOpen(false)}>
                  Onboarding
                </NavButton>
              ) : null}
              {isPrimarySuperAdmin ? (
                <NavButton to="/settings" onClick={() => setMobileOpen(false)}>
                  Settings
                </NavButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function NavButton({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      end
      className={({ isActive }) =>
        clsx(
          "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition duration-200",
          isActive
            ? "bg-slate-950 text-white shadow-[0_16px_32px_rgba(9,20,35,0.18)]"
            : "bg-transparent text-slate-600 hover:bg-white/92 hover:text-slate-950"
        )
      }
    >
      {children}
    </NavLink>
  );
}

function DisabledButton({ children }) {
  return (
    <button
      className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-slate-400"
      disabled
      aria-disabled="true"
      title="Login required"
      type="button"
    >
      {children}
    </button>
  );
}
