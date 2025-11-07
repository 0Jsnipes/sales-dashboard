import { useState } from "react";
import { addDoc, collection, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ensureWeek } from "../lib/weeks.js";
import { futureWeekISOs } from "../utils/weeks.js";
import TeamSelect from "./TeamSelect.jsx";
import Modal from "./Modal.jsx";

/* ----- helpers ----- */
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
      const stableId = key.replace(/\s+/g, "_") + (r.salesId ? `__${r.salesId}` : "");
      writes.push(
        setDoc(
          doc(repsCol, stableId || undefined),
          {
            name: r.name,
            team: r.team || "",
            salesId: r.salesId || "",
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
export default function AddRepsModal({ weekISO, open, onClose, isAdmin = true }) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [salesId, setSalesId] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => { setName(""); setTeam(""); setSalesId(""); setBulk(""); };

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const repsCol = collection(db, "weeks", weekISO, "reps");

      if (bulk.trim()) {
        const rows = parseBulk(bulk).map((r) => ({
          name: r.name, team: r.team || "", salesId: r.salesId || "",
          salesGoal: 0, knocksGoal: 0,
        }));
        await Promise.all(
          rows.map((r) =>
            addDoc(repsCol, { ...r, sales: [0,0,0,0,0,0,0], knocks: [0,0,0,0,0,0,0] })
          )
        );
        await propagateForward({ weekISO, rows, horizon: 12 });
      } else {
        if (!name.trim()) throw new Error("Name is required.");
        const row = {
          name: name.trim(),
          team: team.trim(),
          salesId: salesId.trim(),
          salesGoal: 0,
          knocksGoal: 0,
        };
        await addDoc(repsCol, { ...row, sales: [0,0,0,0,0,0,0], knocks: [0,0,0,0,0,0,0] });
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
    <Modal open={open} onClose={onClose} maxWidth="max-w-2xl bg-white" >
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
          <div className="sm:col-span-1">
            <TeamSelect value={team} onChange={setTeam} isAdmin={isAdmin} />
          </div>
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
          placeholder={`One per line. Name, Team, SalesID
Examples:
Brandon Jones, Baton Rouge, BJ-123
Andrew Burch | Tulsa | AB-9
Dahtnay Larkin`}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
      </div>

      {err && <p className="mt-2 text-sm text-error">{err}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </Modal>
  );
}
