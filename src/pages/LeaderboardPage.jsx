import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useSearchParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuthRole } from "../hooks/useAuth";
import { startOfWeek, toISO } from "../utils/weeks.js";
import WeekSwitcher from "../components/WeekSwitcher.jsx";
import TeamFilter from "../components/TeamFilter.jsx";
import { getDemoWeekRows } from "../demo/demoData.js";

const clampNum = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
const medalIcon = (place) =>
  place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : null;
const keyForRep = (rep) => {
  const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
  if (sid) return `sid:${sid}`;
  const name = (rep.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
};

export default function LeaderboardPage() {
  const { isAdmin, isDemo, loading } = useAuthRole();
  const [weekISO, setWeekISO] = useState(toISO(startOfWeek()));
  const [params, setParams] = useSearchParams();
  const location = params.get("location") || "All";
  const manager = params.get("manager") || "All";

  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    if (!weekISO) return;
    const normalize = (v) => (v ?? "").trim();
    const locFilter = normalize(location);
    const mgrFilter = normalize(manager);
    const buildLeaders = (rows) => {
      const normalized = rows
        .filter((row) => {
          if (row.deleted) return false;
          if (locFilter && locFilter !== "All" && normalize(row.team) !== locFilter)
            return false;
          if (mgrFilter && mgrFilter !== "All" && normalize(row.manager) !== mgrFilter)
            return false;
          return true;
        })
        .map((row) => {
          const sales =
            Array.isArray(row.sales) && row.sales.length === 7
              ? row.sales
              : Array(7).fill(0);
          const weeklyTotal = sales.reduce((sum, v) => sum + clampNum(v), 0);
          return { ...row, sales, weeklyTotal };
        });

      // Deduplicate by salesId/name (same logic as WeeklyTable): keep the row with the higher weekly total
      const dedup = new Map();
      normalized.forEach((row) => {
        const key = keyForRep(row);
        if (!key) return;
        const existing = dedup.get(key);
        if (!existing || row.weeklyTotal > existing.weeklyTotal) {
          dedup.set(key, row);
        }
      });

      const list = Array.from(dedup.values())
        .map((row) => {
          const goal = clampNum(row.salesGoal);
          const pct =
            goal > 0 ? Math.min(100, Math.round((row.weeklyTotal / goal) * 100)) : 0;
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

    const unsub = onSnapshot(collection(db, "weeks", weekISO, "reps"), (snap) => {
      buildLeaders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub && unsub();
  }, [weekISO, location, manager, isDemo]);

  const ranked = useMemo(() => {
    let lastScore = null;
    let place = 0;
    return leaders.map((l) => {
      if (l.weeklyTotal !== lastScore) {
        place += 1; // dense ranking: next distinct score increments by 1
        lastScore = l.weeklyTotal;
      }
      return { ...l, place };
    });
  }, [leaders]);

  const starsForPct = (pct) => {
    const stars = Math.round((pct / 100) * 5);
    const full = "★".repeat(stars);
    const empty = "☆".repeat(5 - stars);
    return full + empty;
  };

  const setLocation = (val) => {
    const next = new URLSearchParams(params);
    if (val && val !== "All") next.set("location", val);
    else next.delete("location");
    setParams(next, { replace: true });
  };

  const setManager = (val) => {
    const next = new URLSearchParams(params);
    if (val && val !== "All") next.set("manager", val);
    else next.delete("manager");
    setParams(next, { replace: true });
  };

  if (loading && !isDemo) return <div className="p-8">Loading…</div>;

  return (
    <main className="relative min-h-screen overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-[#D4E157]/25 blur-3xl" />
        <div className="absolute right-0 top-0 h-60 w-60 rounded-full bg-[#c6d64a]/25 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-48 w-48 rounded-full bg-[#1f1f1f]/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 p-6 sm:p-10">
        <div className="flex flex-col items-center gap-4">
          <WeekSwitcher weekISO={weekISO} setWeekISO={setWeekISO} />
          <div className="w-full flex justify-center">
            <TeamFilter
              weekISO={weekISO}
              location={location}
              setLocation={setLocation}
              manager={manager}
              setManager={setManager}
              canChange={isAdmin || isDemo}
            />
          </div>
        </div>

        <section className="relative rounded-3xl border border-[#1f1f1f] bg-[#0b0b0b]/70 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border border-[#d4e157]/70 bg-gradient-to-r from-[#d4e157] to-[#c6d64a] px-6 py-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#0b0b0b] shadow-lg">
            Leaderboard
          </div>

          <div className="flex items-center justify-between px-6 pt-8 pb-4 text-[#e5e5e5]">
            <div>
              <div className="text-lg font-bold text-white">Weekly Sales Rankings</div>
              <div className="text-xs text-[#d4e157]/80">
                Top performers for {weekISO} (filters applied).
              </div>
            </div>
            <span className="badge badge-outline border-[#d4e157]/70 text-[#f5f5f5]">
              {ranked.length ? `${ranked.length} reps` : "No data"}
            </span>
          </div>

          <div className="divide-y divide-neutral-800/80">
            {ranked.map((rep) => (
              <div
                key={rep.id}
                className="flex flex-wrap items-center gap-3 px-6 py-4 transition hover:bg-neutral-800/70"
              >
                <div className="flex items-center gap-3 min-w-[120px]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-[#d4e157] text-lg font-bold border border-[#d4e157]/60">
                    {medalIcon(rep.place) || rep.place}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{rep.name}</div>
                    <div className="text-xs text-[#d4e157]/80">
                      {rep.team || "No team"} • {rep.manager || "No manager"}
                    </div>
                  </div>
                </div>

                <div className="flex grow items-center justify-end gap-4 text-sm text-[#f5f5f5]">
                  <div className="flex flex-col items-center">
                    <span className="text-xs uppercase text-[#d4e157]/70">Weekly Sales</span>
                    <span className="text-lg font-bold text-[#d4e157]">{rep.weeklyTotal}</span>
                  </div>

                  <div className="hidden sm:flex flex-col items-center">
                    <span className="text-xs uppercase text-[#d4e157]/70">Goal</span>
                    <span className="text-sm font-semibold">{rep.goal || 0}</span>
                  </div>

                  <div className="flex flex-col items-start min-w-[180px]">
                    <span className="text-xs uppercase text-[#d4e157]/70">Progress</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 rounded-full bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#d4e157] to-[#c6d64a]"
                          style={{ width: `${rep.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#f5f5f5]">{rep.pct}%</span>
                    </div>
                    <div className="text-xs text-[#d4e157]">{starsForPct(rep.pct)}</div>
                  </div>
                </div>
              </div>
            ))}

            {ranked.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-[#d4e157]/80">
                No reps found for this week/filters.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
