import { Link } from "react-router-dom";
import { PageShell } from "../components/PageLayout.jsx";

export default function LandingPage({
  user,
  isAdmin,
  isSuperAdmin,
  isManager,
  isUser,
  canViewRoster,
  canViewPerformance,
  canViewOnboarding,
  canViewMap,
  onOpenLogin,
}) {
  const signedIn = !!user;
  const roleLabel = isSuperAdmin
    ? "Admin"
    : isManager
    ? "Manager"
    : isUser
    ? "User"
    : isAdmin
    ? "Admin"
    : "Guest";
  const appLinks = [
    { to: "/sales", label: "Sales", text: "Track weekly sales by team and representative." },
    { to: "/leaderboard", label: "Leaderboard", text: "See current rankings and momentum." },
    { to: "/knocks", label: "Knocks", text: "Review field activity and production pace." },
    ...(canViewMap
      ? [{ to: "/coverage-map", label: "Map", text: "See territory and coverage tools." }]
      : []),
    ...(canViewPerformance
      ? [{ to: "/performance", label: "Performance", text: "Compare trends and activity signals." }]
      : []),
    ...(canViewRoster
      ? [{ to: "/roster", label: "Roster", text: "View roster details and onboarding status." }]
      : []),
    ...(canViewOnboarding
      ? [{ to: "/onboarding", label: "Onboarding", text: "Manage rep onboarding workflow." }]
      : []),
    ...(isSuperAdmin
      ? [{ to: "/settings", label: "Settings", text: "Create users and manage permissions." }]
      : []),
  ];

  return (
    <PageShell className="pt-6">
      <section className="grid min-h-[calc(100vh-9rem)] items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <div className="grid gap-6">
          <div className="grid gap-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-slate-500">
              AB Energy Marketing
            </p>
            <h1 className="max-w-[12ch] text-4xl font-extrabold leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              Field sales command center
            </h1>
            <p className="max-w-2xl text-base leading-8 text-slate-600">
              One place for sales, knocks, performance, roster visibility, and onboarding
              work. Sign in to unlock the tools assigned to your role.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {signedIn ? (
              <Link className="btn btn-primary" to="/sales">
                Open Dashboard
              </Link>
            ) : (
              <button className="btn btn-primary" type="button" onClick={onOpenLogin}>
                Sign In
              </button>
            )}
            {signedIn ? (
              <Link className="btn btn-outline" to="/leaderboard">
                View Leaderboard
              </Link>
            ) : (
              <button className="btn btn-outline" type="button" onClick={onOpenLogin}>
                View Access Options
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Status", signedIn ? "Signed In" : "Public"],
              ["Role", roleLabel],
              ["Access", signedIn ? "Assigned" : "Limited"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[22px] border border-slate-200/70 bg-white/72 px-4 py-3 shadow-[0_12px_30px_rgba(9,20,35,0.08)] backdrop-blur-xl"
              >
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {label}
                </span>
                <p className="mt-1 font-display text-lg font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-slate-950 shadow-[0_34px_80px_rgba(9,20,35,0.22)]">
          <img
            src="/dashboard-hero.png"
            alt="AB sales dashboard preview"
            className="h-full min-h-[360px] w-full object-cover opacity-95"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/84 via-slate-950/18 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 grid gap-3 p-5 sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-200">
              {signedIn ? "Available Areas" : "Sign In Required"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {appLinks.slice(0, 6).map((link) => (
                signedIn ? (
                <Link
                  key={link.to}
                  to={link.to}
                  className="rounded-[18px] border border-white/15 bg-white/12 px-4 py-3 text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  <span className="font-bold">{link.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-white/72">{link.text}</span>
                </Link>
                ) : (
                <button
                  key={link.label}
                  type="button"
                  onClick={onOpenLogin}
                  className="rounded-[18px] border border-white/15 bg-white/12 px-4 py-3 text-left text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  <span className="font-bold">{link.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-white/72">
                    Sign in to open this area.
                  </span>
                </button>
                )
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
