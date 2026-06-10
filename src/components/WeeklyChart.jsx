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
}) {
  const isDemo = useDemoMode();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (isDemo) {
      const normalize = (value) => (value ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const managerFilterNorm = normalize(managerFilter);
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

      const data = Array.from(deduped.values())
        .map((row) => ({
          id: row.id,
          name: row.name || "Unnamed",
          total: row.total,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

      setRows(data);
      return undefined;
    }

    const chartQuery = query(collection(db, base, weekISO, "reps"));
    return onSnapshot(chartQuery, (snapshot) => {
      const normalize = (value) => (value ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const managerFilterNorm = normalize(managerFilter);

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

      const data = Array.from(deduped.values())
        .map((row) => ({
          id: row.id,
          name: row.name || "Unnamed",
          total: row.total,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

      setRows(data);
    });
  }, [base, isDemo, managerFilter, metricKey, teamFilter, weekISO]);

  const maxY = useMemo(() => {
    if (!rows || rows.length === 0) return 5;
    const max = Math.max(...rows.map((row) => row.total));
    return Math.max(5, Math.ceil((max + 1) / 5) * 5);
  }, [rows]);

  const chartWidth = useMemo(() => {
    if (!rows || rows.length === 0) return 720;
    return Math.max(720, rows.length * 76);
  }, [rows]);

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        eyebrow="Chart"
        title={title}
        description="A weekly roll-up by rep. On smaller screens, the chart scrolls sideways instead of compressing labels into unreadable text."
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
        <div className="mt-5 overflow-x-auto">
          <div style={{ width: chartWidth, height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 12, left: -18, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.26)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: CHART_PRIMARY, fontSize: 12 }}
                  tickMargin={12}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-24}
                  textAnchor="end"
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, maxY]}
                  tick={{ fill: CHART_PRIMARY, fontSize: 12 }}
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
      ) : null}
    </section>
  );
}
