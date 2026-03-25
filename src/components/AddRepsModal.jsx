import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ensureWeek } from "../lib/weeks.js";
import { futureWeekISOs } from "../utils/weeks.js";
import Modal from "./Modal.jsx";

/* ----- helpers ----- */
function parseBulk(input) {
  return input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[|,]\s*/);
      const [name, team = "", manager = ""] = parts;
      return { name: name?.trim(), team: team?.trim(), manager: manager?.trim() };
    })
    .filter((r) => r.name);
}

async function propagateForward({ weekISO, rows, horizon = 12 }) {
  const weeks = futureWeekISOs(weekISO, horizon);
  for (const wk of weeks) {
    await ensureWeek(wk);
    const repsCol = collection(db, "weeks", wk, "reps");
    const snap = await getDocs(repsCol);
    const existing = new Set(
      snap.docs.map((d) => {
        const v = d.data();
        return `${(v.name || "").trim()}__${(v.team || "").trim()}`.toLowerCase();
      })
    );

    const writes = [];
    for (const r of rows) {
      const key = `${(r.name || "").trim()}__${(r.team || "").trim()}`.toLowerCase();
      if (existing.has(key)) continue;
      const stableId =
        key.replace(/\s+/g, "_") + (r.manager ? `__${r.manager.replace(/\s+/g, "_")}` : "");
      writes.push(
        setDoc(
          doc(repsCol, stableId || undefined),
          {
            name: r.name,
            team: r.team || "",
            manager: r.manager || "",
            salesGoal: Number(r.salesGoal || 0),
            knocksGoal: Number(r.knocksGoal || 0),
            sales: [0, 0, 0, 0, 0, 0, 0],
            knocks: [0, 0, 0, 0, 0, 0, 0],
          },
          { merge: false }
        )
      );
    }
    if (writes.length) await Promise.all(writes);
  }
}

/* ----- component ----- */
export default function AddRepsModal({ weekISO, open, onClose }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [manager, setManager] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [options, setOptions] = useState({
    manager: [],
    location: [],
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "rosterOptions"), (snap) => {
      const grouped = { manager: [], location: [] };
      snap.forEach((d) => {
        const data = d.data();
        if (
          typeof data?.type === "string" &&
          typeof data?.value === "string" &&
          grouped[data.type]
        ) {
          grouped[data.type].push({ id: d.id, value: data.value });
        }
      });

      const sortAlpha = (arr) =>
        arr.sort((a, b) =>
          a.value.localeCompare(b.value, undefined, { sensitivity: "base" })
        );

      setOptions({
        manager: sortAlpha(grouped.manager),
        location: sortAlpha(grouped.location),
      });
    });

    return () => unsub();
  }, []);

  const reset = () => {
    setName("");
    setTeam("");
    setManager("");
    setBulk("");
  };

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const repsCol = collection(db, "weeks", weekISO, "reps");

      if (bulk.trim()) {
        const rows = parseBulk(bulk).map((r) => ({
          name: r.name,
          team: r.team || "",
          manager: r.manager || "",
          salesGoal: 0,
          knocksGoal: 0,
        }));
        await Promise.all(
          rows.map((r) =>
            addDoc(repsCol, { ...r, sales: [0, 0, 0, 0, 0, 0, 0], knocks: [0, 0, 0, 0, 0, 0, 0] })
          )
        );
        await propagateForward({ weekISO, rows, horizon: 12 });
      } else {
        if (!name.trim()) throw new Error("Name is required.");
        const row = {
          name: name.trim(),
          team: team.trim(),
          manager: manager.trim(),
          salesGoal: 0,
          knocksGoal: 0,
        };
        await addDoc(repsCol, {
          ...row,
          sales: [0, 0, 0, 0, 0, 0, 0],
          knocks: [0, 0, 0, 0, 0, 0, 0],
        });
        await propagateForward({ weekISO, rows: [row], horizon: 12 });
      }

      reset();
      onClose();
    } catch (e) {
      setErr(e?.message || "Failed to add reps.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl bg-white">
      <h3 className="text-lg font-semibold">Add Reps</h3>

      <div className="mt-4 grid gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="input input-bordered"
            placeholder="Name (single)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="select select-bordered w-full"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          >
            <option value="">Location</option>
            {options.location.map((opt) => (
              <option key={opt.id} value={opt.value}>
                {opt.value}
              </option>
            ))}
          </select>
          <select
            className="select select-bordered w-full"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          >
            <option value="">Manager</option>
            {options.manager.map((opt) => (
              <option key={opt.id} value={opt.value}>
                {opt.value}
              </option>
            ))}
          </select>
        </div>

        <div className="divider my-1">or Bulk Paste</div>

        <textarea
          className="textarea textarea-bordered h-36"
          placeholder={`One per line. Name, Location, Manager
Examples:
Brandon Jones, Baton Rouge, Jane Smith
Andrew Burch | Tulsa | Casey Lee
Dahtnay Larkin`}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
      </div>

      {err && <p className="mt-2 text-sm text-error">{err}</p>}

      <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          className="inline-flex min-w-[112px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="inline-flex min-w-[112px] items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-cyan-500/35 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Adding..." : "Add Rep"}
        </button>
      </div>
    </Modal>
  );
}
