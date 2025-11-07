import { useEffect, useMemo, useState } from "react";
import {
  deleteDoc,
  doc,
  onSnapshot,
  collection,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { DAYS } from "../utils/weeks.js";
import AddRepsModal from "./AddRepsModal";

const clampNum = (v) =>
  Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0;

/**
 * Props:
 *  - base:       collection root (use "weeks")
 *  - weekISO
 *  - isAdmin
 *  - metricKey:  "sales" | "knocks"
 *  - goalKey:    "salesGoal" | "knocksGoal"
 *  - title
 *  - teamFilter: "All" | team name (optional)
 */
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

  // live rows (filtered by team if provided)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, base, weekISO, "reps"), (s) => {
      const all = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(
        teamFilter === "All"
          ? all
          : all.filter((r) => (r.team || "") === teamFilter)
      );
    });
    return () => unsub();
  }, [base, weekISO, teamFilter]);

  // day + week totals (for footer)
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
    await setDoc(
      doc(db, base, weekISO, "reps", r.id),
      { [metricKey]: arr },
      { merge: true }
    );
  };

  const saveGoal = async (r, value) => {
    await setDoc(
      doc(db, base, weekISO, "reps", r.id),
      { [goalKey]: clampNum(value) },
      { merge: true }
    );
  };

  const saveSalesId = async (r, value) => {
    await setDoc(
      doc(db, base, weekISO, "reps", r.id),
      { salesId: value.trim() },
      { merge: true }
    );
  };

  const removeRep = async (id) => {
    await deleteDoc(doc(db, base, weekISO, "reps", id));
  };

  return (
    <div className="rounded-2xl bg-base-100 p-4 sm:p-6 shadow">
      <div className="flex items-center justify-between">
        <h2>{title}</h2>
        {isAdmin && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setOpenAdd(true)}
          >
            + Add Reps
          </button>
        )}
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th className="min-w-[180px]">Agent</th>
              <th className="min-w-[120px]">Sales ID</th>
              {DAYS.map((d) => (
                <th key={d} className="text-center">
                  {d}
                </th>
              ))}
              <th className="text-center">TOTAL</th>
              <th className="min-w-[100px] text-center">GOAL</th>
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
              const pct =
                goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;

              return (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>

                  {/* Sales ID cell */}
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

                  {/* Mon..Sun cells */}
                  {DAYS.map((d, i) => (
                    <td key={d} className="text-center">
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

                  {/* total */}
                  <td className="text-center font-semibold">{total}</td>

                  {/* goal */}
                  <td className="text-center">
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

                  {/* progress */}
                  <td>
                    <div className="flex items-center gap-2">
                      <progress
                        className="progress progress-secondary w-28"
                        value={pct}
                        max="100"
                      />
                      <span className="text-xs opacity-70 w-10">{pct}%</span>
                    </div>
                  </td>

                  {/* location */}
                  <td>{r.team || ""}</td>

                  {/* delete */}
                  {isAdmin && (
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => removeRep(r.id)}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* Footer totals */}
          <tfoot>
            <tr>
              <th className="text-right">Totals</th>
              <th /> {/* sales-id column placeholder */}
              {colTotals.dayTotals.map((v, i) => (
                <th key={i} className="text-center">
                  {v}
                </th>
              ))}
              <th className="text-center">{colTotals.weekTotal}</th>
              <th className="text-center">—</th>
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
      />
    </div>
  );
}
