import { useEffect, useMemo, useState } from "react";
import {
  deleteDoc, doc, onSnapshot, collection, setDoc, getDocs
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { DAYS, prevWeekISO } from "../utils/weeks.js";
import AddRepsModal from "./AddRepsModal";

const clampNum = (v) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0);

export default function WeeklyTable({
  base = "weeks",
  weekISO,
  isAdmin,
  metricKey = "sales",
  goalKey = "salesGoal",
  title = "Weekly Grid",
  teamFilter = "All",
}) {
  const [rows, setRows] = useState([]);
  const [openAdd, setOpenAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const unsub = onSnapshot(collection(db, base, weekISO, "reps"), async (s) => {
      if (cancelled) return;

      const all = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      let filtered =
        teamFilter === "All" ? all : all.filter((r) => (r.team || "") === teamFilter);

      // alpha sort by name (always)
      filtered = filtered.sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      );

      if (filtered.length > 0) {
        setRows(filtered);
        return;
      }

      // fallback to prior week roster (zeroed) for viewers
      const prevISO = prevWeekISO(weekISO);
      const prevSnap = await getDocs(collection(db, base, prevISO, "reps"));
      let prevFiltered = prevSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      prevFiltered =
        teamFilter === "All"
          ? prevFiltered
          : prevFiltered.filter((r) => (r.team || "") === teamFilter);

      prevFiltered = prevFiltered
        .sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
        )
        .map((r) => ({ ...r, [metricKey]: [0,0,0,0,0,0,0] }));

      if (!cancelled) setRows(prevFiltered);
    });

    return () => { cancelled = true; unsub(); };
  }, [base, weekISO, teamFilter, metricKey]);

  const colTotals = useMemo(() => {
    const dayTotals = Array(7).fill(0);
    let weekTotal = 0;
    rows.forEach((r) => {
      const arr = r[metricKey] || Array(7).fill(0);
      arr.forEach((v, i) => (dayTotals[i] += clampNum(v)));
      weekTotal += arr.reduce((a, b) => a + clampNum(b), 0);
    });
    return { dayTotals, weekTotal };
  }, [rows, metricKey]);

  const saveCell = async (r, dayIdx, value) => {
    const arr = [...(r[metricKey] || Array(7).fill(0))];
    arr[dayIdx] = clampNum(value);
    await setDoc(doc(db, base, weekISO, "reps", r.id), { [metricKey]: arr }, { merge: true });
  };
  const saveGoal = async (r, value) =>
    setDoc(doc(db, base, weekISO, "reps", r.id), { [goalKey]: clampNum(value) }, { merge: true });
  const saveSalesId = async (r, value) =>
    setDoc(doc(db, base, weekISO, "reps", r.id), { salesId: value.trim() }, { merge: true });
  const removeRep = async (id) => deleteDoc(doc(db, base, weekISO, "reps", id));

  return (
    <div className={`rounded-2xl bg-base-100 shadow ${!isAdmin ? "pt-8" : "p-6"} ${isAdmin ? "" : "px-4"}`}>
      <div className={`flex items-center ${isAdmin ? "justify-between" : "justify-start"} px-2 pt-4`}>
        <h2>{title}</h2>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" onClick={() => setOpenAdd(true)}>
            + Add Reps
          </button>
        )}
      </div>

      <div className="overflow-x-auto mt-3">
        <table className={`table ${!isAdmin ? "table-zebra" : ""}`}>
          <thead>
            <tr>
              <th className="min-w-[180px]">Agent</th>
              <th className="min-w-[120px]">Sales ID</th>
              {DAYS.map((d) => (
                <th key={d} className={`text-center ${!isAdmin ? "px-5" : ""}`}>{d}</th>
              ))}
              <th className={`text-center ${!isAdmin ? "px-5" : ""}`}>TOTAL</th>
              <th className={`min-w-[100px] text-center ${!isAdmin ? "px-5" : ""}`}>GOAL</th>
              <th className="min-w-[160px]">Progress</th>
              <th className="min-w-[140px]">Location</th>
              {isAdmin && <th />}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const arr = r[metricKey] || Array(7).fill(0);
              const total = arr.reduce((a, b) => a + clampNum(b), 0);
              const goal = clampNum(r[goalKey]);
              const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;

              return (
                <tr key={`${r.id}-${r.name}`}>
                  <td className="font-medium">{r.name}</td>

                  <td>
                    {isAdmin ? (
                      <input
                        type="text"
                        defaultValue={r.salesId || ""}
                        className="input input-bordered input-xs w-28"
                        onBlur={(e) => saveSalesId(r, e.target.value)}
                      />
                    ) : (
                      <span>{r.salesId || "—"}</span>
                    )}
                  </td>

                  {DAYS.map((d, i) => (
                    <td key={d} className={`text-center ${!isAdmin ? "px-5" : ""}`}>
                      {isAdmin ? (
                        <input
                          type="number"
                          min="0"
                          defaultValue={arr[i] ?? 0}
                          className="input input-bordered input-xs w-16 text-center"
                          onBlur={(e) => saveCell(r, i, e.target.value)}
                        />
                      ) : (
                        <span>{arr[i] ?? 0}</span>
                      )}
                    </td>
                  ))}

                  <td className={`text-center font-semibold ${!isAdmin ? "px-5" : ""}`}>{total}</td>

                  <td className={`text-center ${!isAdmin ? "px-5" : ""}`}>
                    {isAdmin ? (
                      <input
                        type="number"
                        min="0"
                        defaultValue={goal}
                        className="input input-bordered input-xs w-20 text-center"
                        onBlur={(e) => saveGoal(r, e.target.value)}
                      />
                    ) : (
                      <span>{goal}</span>
                    )}
                  </td>

                  <td>
                    <div className="flex items-center gap-2">
                      <progress className="progress progress-secondary w-28" value={pct} max="100" />
                      <span className="text-xs opacity-70 w-10">{pct}%</span>
                    </div>
                  </td>

                  <td>{r.team || ""}</td>

                  {isAdmin && (
                    <td className="text-right">
                      <button className="btn btn-ghost btn-xs" onClick={() => removeRep(r.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <th className="text-right">Totals</th>
              <th />
              {colTotals.dayTotals.map((v, i) => (
                <th key={i} className={`text-center ${!isAdmin ? "px-5" : ""}`}>{v}</th>
              ))}
              <th className={`text-center ${!isAdmin ? "px-5" : ""}`}>{colTotals.weekTotal}</th>
              <th className={`text-center ${!isAdmin ? "px-5" : ""}`}>—</th>
              <th>—</th>
              <th>—</th>
              {isAdmin && <th />}
            </tr>
          </tfoot>
        </table>
      </div>

      <AddRepsModal
        weekISO={weekISO}
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        isAdmin={isAdmin}
      />
    </div>
  );
}
