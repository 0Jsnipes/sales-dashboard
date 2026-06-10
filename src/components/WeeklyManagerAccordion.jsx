import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { DAYS } from "../utils/weeks.js";
import Modal from "./Modal";
import { SectionIntro } from "./PageLayout.jsx";
import { useDemoMode } from "../hooks/useDemoMode";
import { getDemoWeekRows } from "../demo/demoData.js";

const clampNum = (value) => (Number.isFinite(+value) && +value >= 0 ? Math.floor(+value) : 0);

const keyForRep = (rep) => {
  const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
  if (sid) return `sid:${sid}`;
  const name = (rep.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
};

function parseLocalISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ChevronIcon({ open = false }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5.75 7.75 4.25 4.5 4.25-4.5" />
    </svg>
  );
}

export default function WeeklyManagerAccordion({
  base = "weeks",
  weekISO,
  teamFilter = "All",
  managerFilter = "All",
}) {
  const isDemo = useDemoMode();
  const [rows, setRows] = useState(null);
  const [openManagers, setOpenManagers] = useState({});
  const [selectedRep, setSelectedRep] = useState(null);

  useEffect(() => {
    if (isDemo) {
      const normalize = (value) => (value ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const managerFilterNorm = normalize(managerFilter);
      const demoRows = getDemoWeekRows(weekISO)
        .filter((row) => {
          if (row.deleted) return false;
          if (
            teamFilterNorm &&
            teamFilterNorm !== "All" &&
            normalize(row.team) !== teamFilterNorm
          ) {
            return false;
          }
          if (
            managerFilterNorm &&
            managerFilterNorm !== "All" &&
            normalize(row.manager) !== managerFilterNorm
          ) {
            return false;
          }
          return true;
        })
        .map((row) => ({
          ...row,
          sales:
            Array.isArray(row.sales) && row.sales.length === 7
              ? row.sales
              : Array(7).fill(0),
          salesGoal: clampNum(row.salesGoal),
        }));

      const deduped = new Map();
      demoRows.forEach((row) => {
        const key = keyForRep(row) || row.id;
        if (!key) return;
        const values = Array.isArray(row.sales) ? row.sales : Array(7).fill(0);
        const total = values.reduce((sum, value) => sum + clampNum(value), 0);
        const existing = deduped.get(key);
        if (!existing || total > existing.total) {
          deduped.set(key, { ...row, total });
        }
      });

      setRows(
        Array.from(deduped.values()).sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        )
      );
      return undefined;
    }

    const weeklyQuery = query(collection(db, base, weekISO, "reps"));
    return onSnapshot(weeklyQuery, (snapshot) => {
      const normalize = (value) => (value ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const managerFilterNorm = normalize(managerFilter);

      const rawRows = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((row) => {
          if (row.deleted) return false;
          if (
            teamFilterNorm &&
            teamFilterNorm !== "All" &&
            normalize(row.team) !== teamFilterNorm
          ) {
            return false;
          }
          if (
            managerFilterNorm &&
            managerFilterNorm !== "All" &&
            normalize(row.manager) !== managerFilterNorm
          ) {
            return false;
          }
          return true;
        })
        .map((row) => ({
          ...row,
          sales:
            Array.isArray(row.sales) && row.sales.length === 7
              ? row.sales
              : Array(7).fill(0),
          salesGoal: clampNum(row.salesGoal),
        }));

      const deduped = new Map();
      rawRows.forEach((row) => {
        const key = keyForRep(row) || row.id;
        if (!key) return;
        const values = Array.isArray(row.sales) ? row.sales : Array(7).fill(0);
        const total = values.reduce((sum, value) => sum + clampNum(value), 0);
        const existing = deduped.get(key);
        if (!existing || total > existing.total) {
          deduped.set(key, { ...row, total });
        }
      });

      setRows(
        Array.from(deduped.values()).sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        )
      );
    });
  }, [base, isDemo, managerFilter, teamFilter, weekISO]);

  const headerDates = useMemo(() => {
    const start = parseLocalISO(weekISO);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [weekISO]);

  const managerGroups = useMemo(() => {
    if (!rows) return [];

    const groups = new Map();

    rows.forEach((row) => {
      const values = Array.isArray(row.sales) ? row.sales : Array(7).fill(0);
      const total = values.reduce((sum, value) => sum + clampNum(value), 0);
      const managerName = (row.manager || "").trim() || "No manager";
      const goal = clampNum(row.salesGoal);
      const rep = {
        id: row.id,
        name: row.name || "Unnamed rep",
        team: row.team || "No location",
        manager: managerName,
        goal,
        total,
        pct: goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0,
        daily: DAYS.map((day, index) => ({
          day,
          dateLabel: headerDates[index].toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
          value: clampNum(values[index]),
        })),
      };

      if (!groups.has(managerName)) {
        groups.set(managerName, {
          manager: managerName,
          total: 0,
          goalTotal: 0,
          reps: [],
        });
      }

      const group = groups.get(managerName);
      group.total += total;
      group.goalTotal += goal;
      group.reps.push(rep);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        pct:
          group.goalTotal > 0
            ? Math.min(100, Math.round((group.total / group.goalTotal) * 100))
            : 0,
        reps: group.reps.sort((a, b) => {
          if (b.total !== a.total) return b.total - a.total;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }),
      }))
      .sort((a, b) => a.manager.localeCompare(b.manager, undefined, { sensitivity: "base" }));
  }, [headerDates, rows]);

  useEffect(() => {
    const managerNames = managerGroups.map((group) => group.manager);

    setOpenManagers((current) => {
      const next = {};
      managerNames.forEach((managerName) => {
        if (current[managerName]) {
          next[managerName] = true;
        }
      });

      if (managerNames.length > 0 && Object.keys(next).length === 0) {
        next[managerNames[0]] = true;
      }

      return next;
    });
  }, [managerGroups]);

  useEffect(() => {
    if (!selectedRep) return;

    const hasSelectedRep = managerGroups.some((group) =>
      group.reps.some((rep) => rep.id === selectedRep.id)
    );

    if (!hasSelectedRep) {
      setSelectedRep(null);
    }
  }, [managerGroups, selectedRep]);

  const totalReps = managerGroups.reduce((sum, group) => sum + group.reps.length, 0);
  const totalSales = managerGroups.reduce((sum, group) => sum + group.total, 0);

  const toggleManager = (managerName) => {
    setOpenManagers((current) => ({
      ...current,
      [managerName]: !current[managerName],
    }));
  };

  return (
    <>
      <section className="glass-panel p-5">
        <SectionIntro
          eyebrow="Managers"
          title="Weekly Sales by Manager"
          description="Open a manager to scan weekly rep totals, then click a rep for the day-by-day sales breakdown."
        />

        {rows === null ? (
          <div className="mt-5 grid gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={`manager-skeleton-${index}`}
                className="h-24 animate-pulse rounded-[26px] bg-slate-200/60"
              />
            ))}
          </div>
        ) : null}

        {rows && rows.length === 0 ? (
          <div className="mt-5 flex min-h-40 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/55 text-sm text-slate-500">
            No sales data yet for this week.
          </div>
        ) : null}

        {rows && rows.length > 0 ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-slate-200/70 bg-white/74 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Managers
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                  {managerGroups.length}
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200/70 bg-white/74 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Reps
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                  {totalReps}
                </div>
              </div>
              <div className="rounded-[22px] border border-slate-200/70 bg-white/74 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Total Sales
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                  {totalSales}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {managerGroups.map((group) => {
                const isOpen = !!openManagers[group.manager];

                return (
                  <article
                    key={group.manager}
                    className="overflow-hidden rounded-[28px] border border-slate-200/75 bg-white/76 shadow-[0_18px_40px_rgba(9,20,35,0.08)] backdrop-blur"
                  >
                    <button
                      type="button"
                      className="w-full px-4 py-4 text-left transition hover:bg-slate-50/70 sm:px-5"
                      onClick={() => toggleManager(group.manager)}
                      aria-expanded={isOpen}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-900">
                            <ChevronIcon open={isOpen} />
                          </span>
                          <div>
                            <div className="text-lg font-semibold text-slate-950">{group.manager}</div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {group.reps.length} rep{group.reps.length === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div className="rounded-[18px] border border-slate-200/70 bg-slate-50/90 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Weekly Sales
                            </div>
                            <div className="mt-1 text-lg font-bold text-slate-950">{group.total}</div>
                          </div>
                          <div className="rounded-[18px] border border-slate-200/70 bg-slate-50/90 px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Goal
                            </div>
                            <div className="mt-1 text-lg font-bold text-slate-950">{group.goalTotal}</div>
                          </div>
                          <div className="rounded-[18px] border border-slate-200/70 bg-slate-50/90 px-3 py-2 sm:col-span-1 col-span-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Progress
                              </span>
                              <span className="text-sm font-semibold text-slate-700">{group.pct}%</span>
                            </div>
                            <progress className="progress mt-2 w-full" value={group.pct} max="100" />
                          </div>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-slate-200/75 px-4 py-4 sm:px-5">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Click a rep to open daily sales
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {group.reps.map((rep) => (
                            <button
                              key={`${group.manager}-${rep.id}`}
                              type="button"
                              className="group rounded-[22px] border border-slate-200/70 bg-slate-50/88 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
                              onClick={() => setSelectedRep(rep)}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-slate-950">
                                    {rep.name}
                                  </div>
                                  <div className="mt-1 truncate text-xs text-slate-500">
                                    {rep.team}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Total
                                  </div>
                                  <div className="mt-1 text-xl font-bold text-slate-950">
                                    {rep.total}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold text-slate-600">
                                  {rep.pct}% of goal
                                </span>
                                <span className="text-xs font-semibold text-slate-400 transition group-hover:text-slate-700">
                                  View days
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      <Modal
        open={!!selectedRep}
        onClose={() => setSelectedRep(null)}
        maxWidth="max-w-4xl"
      >
        {selectedRep ? (
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Rep Breakdown
                </div>
                <h3 className="mt-2 text-2xl font-bold text-slate-950">{selectedRep.name}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {selectedRep.manager} - {selectedRep.team}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:min-w-[320px]">
                <div className="rounded-[20px] border border-slate-200/75 bg-slate-50/90 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Weekly Total
                  </div>
                  <div className="mt-2 text-xl font-bold text-slate-950">{selectedRep.total}</div>
                </div>
                <div className="rounded-[20px] border border-slate-200/75 bg-slate-50/90 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Goal
                  </div>
                  <div className="mt-2 text-xl font-bold text-slate-950">{selectedRep.goal}</div>
                </div>
                <div className="rounded-[20px] border border-slate-200/75 bg-slate-50/90 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Progress
                  </div>
                  <div className="mt-2 text-xl font-bold text-slate-950">{selectedRep.pct}%</div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {selectedRep.daily.map((entry) => (
                <div
                  key={`${selectedRep.id}-${entry.day}`}
                  className="rounded-[22px] border border-slate-200/75 bg-white/84 px-4 py-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {entry.day}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">{entry.dateLabel}</div>
                  <div className="mt-4 font-display text-3xl font-bold text-slate-950">
                    {entry.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
