import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import TeamFilter from "../components/TeamFilter.jsx";
import { PageHero, PageShell } from "../components/PageLayout.jsx";
import WeekSwitcher from "../components/WeekSwitcher.jsx";
import { getDemoWeekRows } from "../demo/demoData.js";
import { useAuthRole } from "../hooks/useAuth";
import { db } from "../lib/firebase";
import { startOfWeek, toISO } from "../utils/weeks.js";

const clampNum = (value) => (Number.isFinite(+value) && +value >= 0 ? Math.floor(+value) : 0);

const keyForRep = (rep) => {
  const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
  if (sid) return `sid:${sid}`;
  const name = (rep.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
};

const placeCopy = {
  1: "01",
  2: "02",
  3: "03",
};

export default function LeaderboardPage() {
  const { isAdmin, isDemo, loading } = useAuthRole();
  const [weekISO, setWeekISO] = useState(toISO(startOfWeek()));
  const [params, setParams] = useSearchParams();
  const location = params.get("location") || "All";
  const manager = params.get("manager") || "All";
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    if (!weekISO) return undefined;

    const normalize = (value) => (value ?? "").trim();
    const locationFilter = normalize(location);
    const managerFilter = normalize(manager);

    const buildLeaders = (rows) => {
      const normalized = rows
        .filter((row) => {
          if (row.deleted) return false;
          if (
            locationFilter &&
            locationFilter !== "All" &&
            normalize(row.team) !== locationFilter
          ) {
            return false;
          }
          if (
            managerFilter &&
            managerFilter !== "All" &&
            normalize(row.manager) !== managerFilter
          ) {
            return false;
          }
          return true;
        })
        .map((row) => {
          const sales =
            Array.isArray(row.sales) && row.sales.length === 7 ? row.sales : Array(7).fill(0);
          const weeklyTotal = sales.reduce((sum, value) => sum + clampNum(value), 0);
          return { ...row, sales, weeklyTotal };
        });

      const deduped = new Map();
      normalized.forEach((row) => {
        const key = keyForRep(row);
        if (!key) return;
        const existing = deduped.get(key);
        if (!existing || row.weeklyTotal > existing.weeklyTotal) {
          deduped.set(key, row);
        }
      });

      const list = Array.from(deduped.values())
        .map((row) => {
          const goal = clampNum(row.salesGoal);
          const pct = goal > 0 ? Math.min(100, Math.round((row.weeklyTotal / goal) * 100)) : 0;
          return {
            id: row.id,
            name: row.name || "Unnamed",
            manager: row.manager || "",
            team: row.team || "",
            weeklyTotal: row.weeklyTotal,
            goal,
            pct,
          };
        })
        .sort((a, b) => b.weeklyTotal - a.weeklyTotal || a.name.localeCompare(b.name));

      setLeaders(list);
    };

    if (isDemo) {
      buildLeaders(getDemoWeekRows(weekISO));
      return undefined;
    }

    const unsubscribe = onSnapshot(collection(db, "weeks", weekISO, "reps"), (snapshot) => {
      buildLeaders(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [isDemo, location, manager, weekISO]);

  const ranked = useMemo(() => {
    let lastScore = null;
    let place = 0;
    return leaders.map((leader) => {
      if (leader.weeklyTotal !== lastScore) {
        place += 1;
        lastScore = leader.weeklyTotal;
      }
      return { ...leader, place };
    });
  }, [leaders]);

  const setLocation = (value) => {
    const next = new URLSearchParams(params);
    if (value && value !== "All") next.set("location", value);
    else next.delete("location");
    setParams(next, { replace: true });
  };

  const setManager = (value) => {
    const next = new URLSearchParams(params);
    if (value && value !== "All") next.set("manager", value);
    else next.delete("manager");
    setParams(next, { replace: true });
  };

  const topRep = ranked[0];

  if (loading && !isDemo) {
    return (
      <PageShell>
        <div className="surface-panel px-5 py-8 text-sm text-slate-600">Loading...</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHero
        eyebrow="Leaderboard"
        title="See who is carrying the week."
        description="A cleaner ranking view for weekly sales momentum, with the same filters as the rest of the dashboard and a layout that still works on a phone."
        stats={[
          { label: "Week", value: weekISO },
          { label: "Reps", value: ranked.length || 0 },
          { label: "Top Rep", value: topRep?.name || "No data" },
          { label: "Top Sales", value: topRep?.weeklyTotal ?? 0 },
        ]}
      />

      <div className="grid gap-4">
        <WeekSwitcher weekISO={weekISO} setWeekISO={setWeekISO} />
        <TeamFilter
          weekISO={weekISO}
          location={location}
          setLocation={setLocation}
          manager={manager}
          setManager={setManager}
          canChange={isAdmin || isDemo}
        />
      </div>

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Weekly Rankings
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">Sales Leaderboard</h2>
            <p className="mt-2 text-sm text-slate-600">
              Filtered by the team selections above.
            </p>
          </div>
          <span className="metric-chip">
            <span className="metric-chip__dot" aria-hidden="true" />
            {ranked.length ? `${ranked.length} reps ranked` : "No data for this view"}
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {ranked.map((rep) => (
            <article
              key={rep.id}
              className="rounded-[26px] border border-white/70 bg-white/74 p-4 shadow-[0_18px_40px_rgba(9,20,35,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(9,20,35,0.12)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-slate-950 text-base font-bold text-white shadow-lg shadow-slate-950/10">
                    {placeCopy[rep.place] || String(rep.place).padStart(2, "0")}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-slate-950">{rep.name}</h3>
                    <p className="text-sm text-slate-600">
                      {rep.team || "No team"} - {rep.manager || "No manager"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
                  <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Weekly Sales
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-slate-950">
                      {rep.weeklyTotal}
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Goal
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold text-slate-950">
                      {rep.goal || 0}
                    </p>
                  </div>

                  <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Progress
                      </p>
                      <span className="text-sm font-semibold text-slate-700">{rep.pct}%</span>
                    </div>
                    <div className="mt-3">
                      <progress className="progress w-full" value={rep.pct} max="100" />
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {ranked.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center text-sm text-slate-500">
              No reps found for this week and filter combination.
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}
