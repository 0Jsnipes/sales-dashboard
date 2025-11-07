import { useState } from "react";
import { addDoc, collection, getDocs, setDoc, doc } from "firebase/firestore";
import { ensureWeek } from "../lib/weeks.js";
import { futureWeekISOs } from "../utils/weeks.js";
import { db } from "../lib/firebase";

/**
 * Accepts one-per-line entries like:
 *   Brandon Jones, Baton Rouge, BJ-123
 *   Andrew Burch | Tulsa | AB-9
 *   Dahtnay Larkin
 * Split on comma or pipe, trims parts. Parts: name, team, salesId (all optional except name).
 */
function parseBulk(input) {
  return input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s*[|,]\s*/);
      const [name, team = "", salesId = ""] = parts;
      return { name: name?.trim(), team: team?.trim(), salesId: salesId?.trim() };
    })
    .filter((r) => r.name);
}

/**
 * Props:
 *  - weekISO: string "YYYY-MM-DD"
 *  - open:    boolean
 *  - onClose: () => void
 *
 * Writes into: weeks/{weekISO}/reps
 * Seeds BOTH metrics: sales + knocks, with goals and arrays zeroed.
 */
export default function AddRepsModal({ weekISO, open, onClose }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [salesId, setSalesId] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => {
    setName("");
    setTeam("");
    setSalesId("");
    setBulk("");
  };

  const submit = async () => {
    if (!open) return;
    setErr("");
    setBusy(true);
    try {
      const repsCol = collection(db, "weeks", weekISO, "reps");

      if (bulk.trim()) {
        const rows = parseBulk(bulk);
        if (!rows.length) throw new Error("No valid rows found.");
        await Promise.all(
          rows.map((r) =>
            addDoc(repsCol, {
              name: r.name,
              team: r.team || "",
              salesId: r.salesId || "",
              salesGoal: 0,
              knocksGoal: 0,
              sales: [0, 0, 0, 0, 0, 0, 0],
              knocks: [0, 0, 0, 0, 0, 0, 0],
            })
          )
        );
      } else {
        if (!name.trim()) throw new Error("Name is required.");
        await addDoc(repsCol, {
          name: name.trim(),
          team: team.trim(),
          salesId: salesId.trim(),
          salesGoal: 0,
          knocksGoal: 0,
          sales: [0, 0, 0, 0, 0, 0, 0],
          knocks: [0, 0, 0, 0, 0, 0, 0],
        });
      }

      reset();
      onClose();
    } catch (e) {
      setErr(e?.message || "Failed to add reps.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <h3 className="text-lg font-semibold">Add Reps</h3>

        <div className="grid gap-3 mt-4">
          {/* single add */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              className="input input-bordered"
              placeholder="Name (single)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input input-bordered"
              placeholder="Location / Team (single)"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            />
            <input
              className="input input-bordered"
              placeholder="Sales ID (optional)"
              value={salesId}
              onChange={(e) => setSalesId(e.target.value)}
            />
          </div>

          <div className="divider my-1">or Bulk Paste</div>

          <textarea
            className="textarea textarea-bordered h-36"
            placeholder={`One per line.\nExamples:\nBrandon Jones, Baton Rouge, BJ-123\nAndrew Burch | Tulsa | AB-9\nDahtnay Larkin`}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
        </div>

        {err && <p className="mt-2 text-sm text-error">{err}</p>}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
