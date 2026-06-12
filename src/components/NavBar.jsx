import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import clsx from "clsx";
import { db } from "../lib/firebase";
import { startOfWeek, toISO } from "../utils/weeks.js";

export default function Navbar({
  isAdmin,
  isPrimarySuperAdmin,
  actualIsPrimarySuperAdmin,
  isManager,
  isUser,
  isDemo,
  canViewPerformance,
  canViewRoster,
  canViewOnboarding,
  canViewMap,
  viewPreview,
  onViewPreviewChange,
  onClearViewPreview,
  onLogout,
  onOpenLogin,
}) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewDesktopOpen, setPreviewDesktopOpen] = useState(false);
  const [previewReps, setPreviewReps] = useState([]);
  const previewDesktopRef = useRef(null);
  const showNav = isAdmin || isManager || isUser || isDemo || canViewRoster;
  const currentWeekISO = toISO(startOfWeek());
  const previewMode = viewPreview?.mode || "admin";

  useEffect(() => {
    if (!actualIsPrimarySuperAdmin) return undefined;
    const unsubscribe = onSnapshot(collection(db, "weeks", currentWeekISO, "reps"), (snapshot) => {
      const rows = snapshot.docs
        .map((docRef) => ({ id: docRef.id, ...docRef.data() }))
        .filter((rep) => !rep.deleted && (rep.name || "").trim())
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          })
        );
      setPreviewReps(rows);
    });
    return () => unsubscribe();
  }, [actualIsPrimarySuperAdmin, currentWeekISO]);

  const managerOptions = useMemo(() => {
    const values = new Set();
    previewReps.forEach((rep) => {
      if (rep.manager) values.add(rep.manager.trim());
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [previewReps]);

  const handlePreviewModeChange = (nextMode) => {
    if (!onViewPreviewChange) return;

    if (nextMode === "admin") {
      onClearViewPreview?.();
      return;
    }

    if (nextMode === "manager") {
      onViewPreviewChange({
        mode: "manager",
        team: viewPreview?.mode === "manager" ? viewPreview.team || "" : managerOptions[0] || "",
      });
      return;
    }

    const rep =
      previewReps.find((entry) => entry.id === viewPreview?.repId) ||
      previewReps[0] ||
      null;

    onViewPreviewChange({
      mode: "user",
      repId: rep?.id || "",
      repName: rep?.name || "",
      team: rep?.manager || "",
      location: rep?.team || "",
    });
  };

  const handlePreviewRepChange = (repId) => {
    if (!onViewPreviewChange) return;
    const rep = previewReps.find((entry) => entry.id === repId);
    onViewPreviewChange({
      mode: "user",
      repId: rep?.id || "",
      repName: rep?.name || "",
      team: rep?.manager || "",
      location: rep?.team || "",
    });
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!showNav) setMobileOpen(false);
  }, [showNav]);

  useEffect(() => {
    if (!previewDesktopOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!previewDesktopRef.current?.contains(event.target)) {
        setPreviewDesktopOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setPreviewDesktopOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [previewDesktopOpen]);

  const previewSummaryLabel =
    previewMode === "manager"
      ? viewPreview?.team || "Manager"
      : previewMode === "user"
        ? viewPreview?.repName || "User"
        : "Live Admin";

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
            </Link>
          </div>

          <nav className="hidden lg:flex items-center justify-center gap-2">
            {showNav ? (
              <>
                <NavButton to="/sales">Sales</NavButton>
                {canViewPerformance ? <NavButton to="/performance">Performance</NavButton> : null}
                <NavButton to="/leaderboard">Leaderboard</NavButton>
                <NavButton to="/knocks">Knocks</NavButton>
                {canViewMap ? <NavButton to="/coverage-map">Map</NavButton> : null}
                {canViewRoster ? <NavButton to="/roster">Roster</NavButton> : null}
                {canViewOnboarding ? <NavButton to="/onboarding">Onboarding</NavButton> : null}
                {isPrimarySuperAdmin || isManager || isUser ? (
                  <NavButton to="/settings">Settings</NavButton>
                ) : null}
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
            {actualIsPrimarySuperAdmin ? (
              <div ref={previewDesktopRef} className="relative hidden lg:block">
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-2 rounded-full"
                  onClick={() => setPreviewDesktopOpen((current) => !current)}
                  aria-expanded={previewDesktopOpen}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Preview
                  </span>
                  <span className="max-w-[10rem] truncate text-slate-900">{previewSummaryLabel}</span>
                </button>
                {previewDesktopOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 rounded-[24px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_24px_56px_rgba(9,20,35,0.18)] backdrop-blur-xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      View Preview
                    </p>
                    <div className="mt-3 grid gap-3">
                      <select
                        className="select select-bordered select-sm w-full"
                        value={previewMode}
                        onChange={(event) => handlePreviewModeChange(event.target.value)}
                      >
                        <option value="admin">Live Admin</option>
                        <option value="manager">Preview Manager</option>
                        <option value="user">Preview User</option>
                      </select>
                      {previewMode === "manager" ? (
                        <select
                          className="select select-bordered select-sm w-full"
                          value={viewPreview?.team || ""}
                          onChange={(event) =>
                            onViewPreviewChange?.({
                              mode: "manager",
                              team: event.target.value,
                            })
                          }
                        >
                          <option value="">Select team</option>
                          {managerOptions.map((team) => (
                            <option key={team} value={team}>
                              {team}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {previewMode === "user" ? (
                        <select
                          className="select select-bordered select-sm w-full"
                          value={viewPreview?.repId || ""}
                          onChange={(event) => handlePreviewRepChange(event.target.value)}
                        >
                          <option value="">Select rep</option>
                          {previewReps.map((rep) => (
                            <option key={rep.id} value={rep.id}>
                              {rep.name || "Unnamed rep"}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

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
              mobileOpen ? "max-h-[560px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="grid gap-2 px-3 py-3 sm:grid-cols-2 sm:px-4">
              {actualIsPrimarySuperAdmin ? (
                <div className="sm:col-span-2 rounded-[20px] border border-slate-200/80 bg-slate-50/90 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    View Preview
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select
                      className="select select-bordered select-sm w-full"
                      value={previewMode}
                      onChange={(event) => handlePreviewModeChange(event.target.value)}
                    >
                      <option value="admin">Live Admin</option>
                      <option value="manager">Preview Manager</option>
                      <option value="user">Preview User</option>
                    </select>
                    {previewMode === "manager" ? (
                      <select
                        className="select select-bordered select-sm w-full"
                        value={viewPreview?.team || ""}
                        onChange={(event) =>
                          onViewPreviewChange?.({
                            mode: "manager",
                            team: event.target.value,
                          })
                        }
                      >
                        <option value="">Select team</option>
                        {managerOptions.map((team) => (
                          <option key={team} value={team}>
                            {team}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {previewMode === "user" ? (
                      <select
                        className="select select-bordered select-sm w-full sm:col-span-2"
                        value={viewPreview?.repId || ""}
                        onChange={(event) => handlePreviewRepChange(event.target.value)}
                      >
                        <option value="">Select rep</option>
                        {previewReps.map((rep) => (
                          <option key={rep.id} value={rep.id}>
                            {rep.name || "Unnamed rep"}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
              {canViewMap ? (
                <NavButton to="/coverage-map" onClick={() => setMobileOpen(false)}>
                  Map
                </NavButton>
              ) : null}
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
              {isPrimarySuperAdmin || isManager || isUser ? (
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
