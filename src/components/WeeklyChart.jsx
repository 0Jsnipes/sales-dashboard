import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDemoMode } from "../hooks/useDemoMode";
import { getDemoWeekRows } from "../demo/demoData.js";
import { buildWeeklySalesRows, normalizeSalesUploadOrder } from "../lib/weeklySalesUploads.js";
import { SectionIntro } from "./PageLayout.jsx";

const CHART_PRIMARY = "#10203a";
const CHART_ACCENT = "#d8f45b";

const clampNum = (value) => (Number.isFinite(+value) && +value >= 0 ? Math.floor(+value) : 0);

const keyForRep = (rep) => {
  const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
  if (sid) return `sid:${sid}`;
  const name = (rep.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
};

export default function WeeklyChart({
  base = "weeks",
  weekISO,
  metricKey = "sales",
  title = "Weekly Sales",
  teamFilter = "All",
  managerFilter = "All",
  repNameFilter = "",
}) {
  const isDemo = useDemoMode();
  const [rawRows, setRawRows] = useState(null);
  const [salesUploadOrders, setSalesUploadOrders] = useState([]);

  const rows = useMemo(() => {
    if (!rawRows) return null;

    const sourceRows =
      metricKey === "sales"
        ? buildWeeklySalesRows(rawRows, salesUploadOrders, weekISO)
        : rawRows;

    return sourceRows
      .map((row) => {
        const values =
          Array.isArray(row[metricKey]) && row[metricKey].length === 7
            ? row[metricKey]
            : Array(7).fill(0);
        const total = values.reduce((sum, value) => sum + clampNum(value), 0);
        return {
          id: row.id,
          name: row.name || "Unnamed",
          total,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [metricKey, rawRows, salesUploadOrders, weekISO]);

  useEffect(() => {
    if (isDemo) {
      const normalize = (value) => (value ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const managerFilterNorm = normalize(managerFilter);
      const repNameFilterNorm = normalize(repNameFilter).toLowerCase();
      const demoRows = getDemoWeekRows(weekISO)
        .filter((row) => {
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
          if (
            repNameFilterNorm &&
            normalize(row.name).toLowerCase() !== repNameFilterNorm
          ) {
            return false;
          }
          return true;
        })
        .map((row) => {
          const values =
            Array.isArray(row[metricKey]) && row[metricKey].length === 7
              ? row[metricKey]
              : Array(7).fill(0);
          const total = values.reduce((sum, value) => sum + clampNum(value), 0);
          return { ...row, total };
        });

      const deduped = new Map();
      demoRows.forEach((row) => {
        const key = keyForRep(row);
        if (!key) return;
        const existing = deduped.get(key);
        if (!existing || row.total > existing.total) deduped.set(key, row);
      });

      setRawRows(Array.from(deduped.values()));
      return undefined;
    }

    const chartQuery = query(collection(db, base, weekISO, "reps"));
    return onSnapshot(chartQuery, (snapshot) => {
      const normalize = (value) => (value ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const managerFilterNorm = normalize(managerFilter);
      const repNameFilterNorm = normalize(repNameFilter).toLowerCase();

      const rawRows = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
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
          if (
            repNameFilterNorm &&
            normalize(row.name).toLowerCase() !== repNameFilterNorm
          ) {
            return false;
          }
          return true;
        })
        .map((row) => {
          const values =
            Array.isArray(row[metricKey]) && row[metricKey].length === 7
              ? row[metricKey]
              : Array(7).fill(0);
          const total = values.reduce((sum, value) => sum + clampNum(value), 0);
          return { ...row, total };
        });

      const deduped = new Map();
      rawRows.forEach((row) => {
        const key = keyForRep(row);
        if (!key) return;
        const existing = deduped.get(key);
        if (!existing || row.total > existing.total) deduped.set(key, row);
      });

      setRawRows(Array.from(deduped.values()));
    });
  }, [base, isDemo, managerFilter, metricKey, repNameFilter, teamFilter, weekISO]);

  useEffect(() => {
    if (isDemo || metricKey !== "sales") {
      setSalesUploadOrders([]);
      return undefined;
    }

    const unsubAtt = onSnapshot(collection(db, "salesUploads", "att sales", "orders"), (snap) => {
      setSalesUploadOrders((current) => {
        const tfiber = current.filter((order) => order.provider !== "ATT");
        return [...tfiber, ...snap.docs.map((docSnap) => normalizeSalesUploadOrder("att sales", docSnap))];
      });
    });
    const unsubTFiber = onSnapshot(
      collection(db, "salesUploads", "t-fiber sales", "orders"),
      (snap) => {
        setSalesUploadOrders((current) => {
          const att = current.filter((order) => order.provider === "ATT");
          return [...att, ...snap.docs.map((docSnap) => normalizeSalesUploadOrder("t-fiber sales", docSnap))];
        });
      }
    );

    return () => {
      unsubAtt();
      unsubTFiber();
    };
  }, [isDemo, metricKey]);

  const maxY = useMemo(() => {
    if (!rows || rows.length === 0) return 5;
    const max = Math.max(...rows.map((row) => row.total));
    return Math.max(5, Math.ceil((max + 1) / 5) * 5);
  }, [rows]);

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        eyebrow="Chart"
        title={title}
        description="A weekly roll-up by rep. Phones show simple weekly totals, while larger screens keep a cleaner bar chart without forcing horizontal scroll."
      />

      {rows === null ? (
        <div className="mt-5 h-72 animate-pulse rounded-[24px] bg-slate-200/60" />
      ) : null}

      {rows && rows.length === 0 ? (
        <div className="mt-5 flex h-72 items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/55 text-sm text-slate-500">
          No data yet for this week.
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 md:hidden">
            {rows.map((row) => (
              <article
                key={`mobile-total-${row.id}`}
                className="rounded-[22px] border border-slate-200/70 bg-white/72 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-950">
                      {row.name}
                    </div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Weekly Total
                    </div>
                  </div>
                  <div className="shrink-0 font-display text-2xl font-bold text-slate-950">
                    {row.total}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 hidden md:block">
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 8, right: 12, left: -18, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.26)" />
                  <XAxis
                    dataKey="name"
                    hide
                  />
                  <YAxis
                    allowDecimals={false}
                    domain={[0, maxY]}
                    tick={{ fill: CHART_PRIMARY, fontSize: 12 }}
                    tickMargin={12}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(216, 244, 91, 0.08)" }}
                    contentStyle={{
                      background: "rgba(255,255,255,0.94)",
                      border: "1px solid rgba(121, 143, 171, 0.18)",
                      borderRadius: 18,
                      boxShadow: "0 18px 34px rgba(9,20,35,0.12)",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: CHART_PRIMARY, fontWeight: 700 }}
                    itemStyle={{ color: CHART_PRIMARY }}
                  />
                  <Bar dataKey="total" fill={CHART_ACCENT} radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
