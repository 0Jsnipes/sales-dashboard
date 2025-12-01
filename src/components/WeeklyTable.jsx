import { useEffect, useMemo, useState, useCallback } from "react";
import {
  deleteDoc,
  doc,
  onSnapshot,
  collection,
  setDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { DAYS, prevWeekISO } from "../utils/weeks.js";
import AddRepsModal from "./AddRepsModal";
import EditRepsModal from "./EditRepsModal";

// Parse "YYYY-MM-DD" as LOCAL date to avoid UTC shift
function parseLocalISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const clampNum = (v) =>
  Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0;

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
  const [repToEdit, setRepToEdit] = useState(null); // <-- per-rep edit

  // Header dates for Mon..Sun
  const headerDates = useMemo(() => {
    const start = parseLocalISO(weekISO);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      return dt;
    });
  }, [weekISO]);

  const fmtHeaderDate = (dt) =>
    dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Load rows (alphabetical) with previous-week fallback (zeroed)
  useEffect(() => {
    let cancelled = false;

    const unsub = onSnapshot(
      collection(db, base, weekISO, "reps"),
      async (s) => {
        if (cancelled) return;

        const all = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        let filtered =
          teamFilter === "All"
            ? all
            : all.filter((r) => (r.team || "") === teamFilter);

        filtered = filtered.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );

        if (filtered.length > 0) {
          setRows(filtered);
          return;
        }

        // Fallback to prior week roster (zeroed)
        const prevISO = prevWeekISO(weekISO);
        const prevSnap = await getDocs(
          collection(db, base, prevISO, "reps")
        );
        let prevFiltered = prevSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        prevFiltered =
          teamFilter === "All"
            ? prevFiltered
            : prevFiltered.filter((r) => (r.team || "") === teamFilter);

        prevFiltered = prevFiltered
          .sort((a, b) =>
            (a.name || "").localeCompare(b.name || "", undefined, {
              sensitivity: "base",
            })
          )
          .map((r) => ({ ...r, [metricKey]: [0, 0, 0, 0, 0, 0, 0] }));

        if (!cancelled) setRows(prevFiltered);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [base, weekISO, teamFilter, metricKey]);

  // Totals
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

  // Saves
  const saveCell = async (rep, dayIdx, value) => {
    const n = value === "" ? 0 : clampNum(value);
    const arr = [...(rep[metricKey] || Array(7).fill(0))];
    arr[dayIdx] = n;
    await setDoc(
      doc(db, base, weekISO, "reps", rep.id),
      { [metricKey]: arr },
      { merge: true }
    );
  };

  const saveGoal = async (rep, value) =>
    setDoc(
      doc(db, base, weekISO, "reps", rep.id),
      { [goalKey]: value === "" ? 0 : clampNum(value) },
      { merge: true }
    );

  const saveSalesId = async (rep, value) =>
    setDoc(
      doc(db, base, weekISO, "reps", rep.id),
      { salesId: value.trim() },
      { merge: true }
    );

  const removeRep = async (id) =>
    deleteDoc(doc(db, base, weekISO, "reps", id));

  // Excel-like navigation (save THEN move)
  const moveFocus = useCallback((td, rowDelta, colDelta) => {
    if (!td) return;
    const row = td.parentElement;
    const tbody = row?.parentElement;
    if (!row || !tbody) return;

    const colIndex = [...row.children].indexOf(td);
    const nextRow =
      rowDelta < 0
        ? row.previousElementSibling
        : rowDelta > 0
        ? row.nextElementSibling
        : row;
    if (!nextRow) return;

    let nextCol = colIndex + colDelta;
    nextCol = Math.max(0, Math.min(nextRow.children.length - 1, nextCol));

    const input = nextRow.children[nextCol]?.querySelector("input");
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const commitThenMove = async (e, td, dir) => {
    const el = e.target;
    const type = el.dataset.type; // "day" | "goal" | "salesId"
    const repId = el.dataset.rep;
    const rep = rows.find((x) => x.id === repId);
    if (!rep) return;

    if (type === "day") {
      await saveCell(rep, Number(el.dataset.day), el.value);
    } else if (type === "goal") {
      await saveGoal(rep, el.value);
    } else if (type === "salesId") {
      await saveSalesId(rep, el.value);
    }

    const map = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] };
    const [dr, dc] = map[dir] || [0, 0];
    moveFocus(td, dr, dc);
  };

  const handleKeyNav = async (e) => {
    const td = e.target.closest("td");
    if (!td) return;

    // Left/right only jump when caret at edges
    if (e.key === "ArrowRight") {
      if (e.target.selectionStart === e.target.value.length) {
        e.preventDefault();
        moveFocus(td, 0, 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (e.target.selectionStart === 0) {
        e.preventDefault();
        moveFocus(td, 0, -1);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      await commitThenMove(e, td, "down");
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      await commitThenMove(e, td, "up");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      await commitThenMove(e, td, e.shiftKey ? "up" : "down");
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      await commitThenMove(e, td, e.shiftKey ? "left" : "right");
      return;
    }
  };

  return (
    <div
      className={`rounded-2xl bg-base-100 shadow ${
        !isAdmin ? "pt-8" : "p-6"
      } ${isAdmin ? "" : "px-4"}`}
    >
      <div
        className={`flex items-center ${
          isAdmin ? "justify-between" : "justify-start"
        } px-2 pt-4`}
      >
        <h2>{title}</h2>
        {isAdmin && (
          <div className="flex gap-2">
            {/* Removed bulk "Edit Reps" – we now edit per row */}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setOpenAdd(true)}
            >
              Add Reps
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="table w-full">
          <thead className="bg-slate-100/90 text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
            <tr>
              <th className="min-w-[180px]">Agent</th>
              <th className="min-w-[120px]">Sales ID</th>

              {DAYS.map((d, i) => (
                <th
                  key={d}
                  className={`text-center ${!isAdmin ? "px-5" : ""}`}
                >
                  <div className="flex flex-col items-center leading-tight">
                    <span className="font-medium">{d}</span>
                    <span className="text-xs text-slate-500">
                      {fmtHeaderDate(headerDates[i])}
                    </span>
                  </div>
                </th>
              ))}

              <th className={`text-center ${!isAdmin ? "px-5" : ""}`}>
                TOTAL
              </th>
              <th
                className={`min-w-[100px] text-center ${
                  !isAdmin ? "px-5" : ""
                }`}
              >
                GOAL
              </th>
              <th className="min-w-[160px]">Progress</th>
              <th className="min-w-[140px]">Location</th>
              {isAdmin && <th className="min-w-[140px]" />} {/* actions */}
            </tr>
          </thead>

          <tbody
            className="
              [&>tr:nth-child(odd)]:bg-white
              [&>tr:nth-child(even)]:bg-slate-50
              [&>tr>td]:border-b [&>tr>td]:border-slate-200
            "
          >
            {rows.map((r) => {
              const arr = r[metricKey] || Array(7).fill(0);
              const total = arr.reduce((a, b) => a + clampNum(b), 0);
              const goal = clampNum(r[goalKey]);
              const pct =
                goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;

              return (
                <tr key={`${r.id}-${r.name}`}>
                  <td className="font-medium">{r.name}</td>

                  <td>
                    {isAdmin ? (
                      <input
                        type="text"
                        defaultValue={r.salesId || ""}
                        className="input input-bordered input-xs w-28"
                        data-type="salesId"
                        data-rep={r.id}
                        onBlur={(e) => saveSalesId(r, e.target.value)}
                        onKeyDown={handleKeyNav}
                      />
                    ) : (
                      <span>{r.salesId ?? "—"}</span>
                    )}
                  </td>

                  {DAYS.map((d, i) => (
                    <td
                      key={d}
                      className={`text-center ${!isAdmin ? "px-5" : ""}`}
                    >
                      {isAdmin ? (
                        <input
                          type="number"
                          min="0"
                          defaultValue={arr[i] ?? ""}
                          className="input input-bordered input-xs w-16 text-center"
                          data-type="day"
                          data-rep={r.id}
                          data-day={i}
                          onBlur={(e) => saveCell(r, i, e.target.value)}
                          onKeyDown={handleKeyNav}
                        />
                      ) : (
                        <span>{arr[i] ?? ""}</span>
                      )}
                    </td>
                  ))}

                  <td
                    className={`text-center font-semibold ${
                      !isAdmin ? "px-5" : ""
                    }`}
                  >
                    {total}
                  </td>

                  <td className={`text-center ${!isAdmin ? "px-5" : ""}`}>
                    {isAdmin ? (
                      <input
                        type="number"
                        min="0"
                        defaultValue={goal ?? ""}
                        className="input input-bordered input-xs w-20 text-center"
                        data-type="goal"
                        data-rep={r.id}
                        onBlur={(e) => saveGoal(r, e.target.value)}
                        onKeyDown={handleKeyNav}
                      />
                    ) : (
                      <span>{goal === 0 ? 0 : goal || ""}</span>
                    )}
                  </td>

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

                  <td>{r.team || ""}</td>

                  {isAdmin && (
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => setRepToEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => removeRep(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          <tfoot className="bg-slate-100/90 [&>tr>th]:border-t [&>tr>th]:border-slate-200">
            <tr>
              <th className="text-right">Totals</th>
              <th />
              {colTotals.dayTotals.map((v, i) => (
                <th
                  key={i}
                  className={`text-center ${!isAdmin ? "px-5" : ""}`}
                >
                  {v}
                </th>
              ))}
              <th className={`text-center ${!isAdmin ? "px-5" : ""}`}>
                {colTotals.weekTotal}
              </th>
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

      {/* NEW: single-rep edit modal */}
      <EditRepsModal
        open={!!repToEdit}
        onClose={() => setRepToEdit(null)}
        base={base}                      // "weeks" or "knocks"
        weekISO={weekISO}
        reps={repToEdit ? [repToEdit] : []}
      />
    </div>
  );
}
