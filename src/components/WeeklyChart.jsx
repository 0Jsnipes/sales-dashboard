import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDemoMode } from "../hooks/useDemoMode";
import { getDemoWeekRows } from "../demo/demoData.js";

// AB brand colors
const AB_PRIMARY = "#101010";
const AB_LIME = "#D4E157";

const clampNum = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);
const keyForRep = (rep) => {
  const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
  if (sid) return `sid:${sid}`;
  const name = (rep.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
};

/**
 * Props:
 *  - base:       "weeks"
 *  - weekISO:    "YYYY-MM-DD"
 *  - metricKey:  "sales" | "knocks"
 *  - title:      string
 *  - teamFilter: "All" | team
 */
export default function WeeklyChart({
  base = "weeks",
  weekISO,
  metricKey = "sales",
  title = "Weekly Sales",
  teamFilter = "All",
}) {
  const isDemo = useDemoMode();
  const [rows, setRows] = useState(null); // null = loading

  useEffect(() => {
    if (isDemo) {
      const normalize = (v) => (v ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const demoRows = getDemoWeekRows(weekISO)
        .filter((v) => {
          if (
            teamFilterNorm &&
            teamFilterNorm !== "All" &&
            normalize(v.team) !== teamFilterNorm
          )
            return false;
          return true;
        })
        .map((v) => {
          const arr =
            Array.isArray(v[metricKey]) && v[metricKey].length === 7
              ? v[metricKey]
              : Array(7).fill(0);
          const total = arr.reduce((a, b) => a + clampNum(b), 0);
          return { ...v, total };
        });

      const dedup = new Map();
      demoRows.forEach((row) => {
        const k = keyForRep(row);
        if (!k) return;
        const existing = dedup.get(k);
        if (!existing || row.total > existing.total) {
          dedup.set(k, row);
        }
      });

      const data = Array.from(dedup.values())
        .map((v) => ({
          id: v.id,
          name: v.name || "Unnamed",
          total: v.total,
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );

      setRows(data);
      return undefined;
    }

    const q = query(collection(db, base, weekISO, "reps"));
    return onSnapshot(q, (s) => {
      const normalize = (v) => (v ?? "").trim();
      const teamFilterNorm = normalize(teamFilter);
      const rows = s.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => {
          if (v.deleted) return false;
          if (
            teamFilterNorm &&
            teamFilterNorm !== "All" &&
            normalize(v.team) !== teamFilterNorm
          )
            return false;
          return true;
        })
        .map((v) => {
          const arr =
            Array.isArray(v[metricKey]) && v[metricKey].length === 7
              ? v[metricKey]
              : Array(7).fill(0);
          const total = arr.reduce((a, b) => a + clampNum(b), 0);
          return { ...v, total };
        });

      // Deduplicate by salesId/name, keeping the entry with the higher total
      const dedup = new Map();
      rows.forEach((row) => {
        const k = keyForRep(row);
        if (!k) return;
        const existing = dedup.get(k);
        if (!existing || row.total > existing.total) {
          dedup.set(k, row);
        }
      });

      const data = Array.from(dedup.values())
        .map((v) => ({
          id: v.id,
          name: v.name || "Unnamed",
          total: v.total,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })); // alphabetical

      setRows(data);
    });
  }, [base, weekISO, metricKey, teamFilter, isDemo]);

  const maxY = useMemo(() => {
    if (!rows || rows.length === 0) return 5;
    const m = Math.max(...rows.map((r) => r.total));
    return Math.max(5, Math.ceil((m + 1) / 5) * 5);
  }, [rows]);

  return (
    <div className="rounded-2xl bg-base-100 p-4 sm:p-6 shadow">
      <h2>{title}</h2>

      {rows === null && (
        <div className="mt-3 h-64 w-full animate-pulse rounded-xl bg-slate-200/60" />
      )}

      {rows && rows.length === 0 && (
        <div className="mt-3 flex h-64 items-center justify-center text-sm text-slate-500">
          No data yet for this week.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-3 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fill: AB_PRIMARY, fontSize: 12 }}
                tickMargin={8}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={{ stroke: "#e5e7eb" }}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, maxY]}
                tick={{ fill: AB_PRIMARY, fontSize: 12 }}
                axisLine={{ stroke: "#e5e7eb" }}
                tickLine={{ stroke: "#e5e7eb" }}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                contentStyle={{
                  background: "rgba(255,255,255,0.9)",
                  backdropFilter: "blur(6px)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
                  fontSize: 12,
                }}
                labelStyle={{ color: AB_PRIMARY, fontWeight: 600 }}
                itemStyle={{ color: AB_PRIMARY }}
              />
              <Bar dataKey="total" fill={AB_LIME} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
