import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import Modal from "./Modal";

const clean = (value) => String(value ?? "").trim();

const ADD_NEW = "__add_new__";

function buildSelectOptions(options, currentValue) {
  const seen = new Set();
  return [...options, currentValue]
    .map((value) => clean(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

async function commitBatchOperations(operations, chunkSize = 350) {
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(db);
    operations.slice(index, index + chunkSize).forEach((operation) => operation(batch));
    await batch.commit();
  }
}

/**
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - base: "weeks" | "knocks"
 * - weekISO: "YYYY-MM-DD"
 * - reps: [{ id, name, team, manager, ... }]  // we use reps[0]
 */
export default function EditRepsModal({
  open,
  onClose,
  base = "weeks",
  weekISO,
  reps = [],
  managerOptions = [],
  teamOptions = [],
}) {
  const rep = reps[0] || null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [manager, setManager] = useState("");
  const [managerMode, setManagerMode] = useState("select");
  const [team, setTeam] = useState("");
  const [teamMode, setTeamMode] = useState("select");
  const [aliases, setAliases] = useState("");
  const [saving, setSaving] = useState(false);

  const managerSelectOptions = useMemo(
    () => buildSelectOptions(managerOptions, rep?.manager),
    [managerOptions, rep?.manager]
  );
  const teamSelectOptions = useMemo(
    () => buildSelectOptions(teamOptions, rep?.team),
    [teamOptions, rep?.team]
  );

  // Reset form whenever we open or the rep changes
  useEffect(() => {
    if (!open || !rep) {
      setName("");
      setEmail("");
      setManager("");
      setManagerMode("select");
      setTeam("");
      setTeamMode("select");
      setAliases("");
      return;
    }
    setName(rep.name || "");
    setEmail(rep.email || "");
    setManager(rep.manager || "");
    setManagerMode("select");
    setTeam(rep.team || "");
    setTeamMode("select");
    setAliases(Array.isArray(rep.aliases) ? rep.aliases.join("\n") : "");
  }, [open, rep]);

  const parsedAliases = aliases
    .split(/\r?\n|,/)
    .map((value) => clean(value))
    .filter(Boolean);
  const hasChanges =
    !!rep &&
    (name !== (rep.name || "") ||
      email !== (rep.email || "") ||
      manager !== (rep.manager || "") ||
      team !== (rep.team || "") ||
      parsedAliases.join("|") !== (Array.isArray(rep.aliases) ? rep.aliases : []).join("|"));

  const handleSave = async () => {
    if (!rep || !hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const patch = {
        name: clean(name),
        email: clean(email).toLowerCase(),
        manager: clean(manager),
        team: clean(team),
        aliases: Array.from(new Set(parsedAliases)),
        updatedAt: serverTimestamp(),
      };
      const operations = [];
      const seenRefs = new Set();
      const addUpdate = (ref) => {
        if (seenRefs.has(ref.path)) return;
        seenRefs.add(ref.path);
        operations.push((batch) => batch.set(ref, patch, { merge: true }));
      };

      addUpdate(doc(collection(db, base, weekISO, "reps"), rep.id));

      const weekSnap = await getDocs(collection(db, base));
      for (const weekDoc of weekSnap.docs) {
        const repsRef = collection(db, base, weekDoc.id, "reps");
        const repQueries = [];
        if (clean(rep.name)) {
          repQueries.push(query(repsRef, where("name", "==", clean(rep.name))));
        }
        if (clean(rep.email)) {
          repQueries.push(query(repsRef, where("email", "==", clean(rep.email).toLowerCase())));
        }

        for (const repQuery of repQueries) {
          const snap = await getDocs(repQuery);
          snap.docs.forEach((docSnap) => addUpdate(docSnap.ref));
        }
      }

      await commitBatchOperations(operations);
      onClose();
    } catch (err) {
      console.error("Failed to save rep edit", err);
      // you can swap this for a toast if you have one
      alert("Failed to save changes. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rep ? `Edit ${rep.name || "rep"}` : "Edit rep"}
      maxWidth="max-w-2xl"
    >
      {!rep ? (
        <div className="text-sm text-slate-500">
          No rep selected. Close this modal and try again.
        </div>
      ) : (
        <div className="flex max-h-[78vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Name</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Email</label>
            <input
              type="email"
              className="input input-bordered input-sm w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Manager</label>
            <select
              className="select select-bordered select-sm w-full"
              value={managerMode === "custom" ? ADD_NEW : manager}
              onChange={(e) => {
                if (e.target.value === ADD_NEW) {
                  setManagerMode("custom");
                  setManager("");
                  return;
                }
                setManagerMode("select");
                setManager(e.target.value);
              }}
            >
              <option value="">No manager</option>
              {managerSelectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={ADD_NEW}>Add new manager...</option>
            </select>
            {managerMode === "custom" ? (
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                placeholder="New manager name"
                autoFocus
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Location / Team</label>
            <select
              className="select select-bordered select-sm w-full"
              value={teamMode === "custom" ? ADD_NEW : team}
              onChange={(e) => {
                if (e.target.value === ADD_NEW) {
                  setTeamMode("custom");
                  setTeam("");
                  return;
                }
                setTeamMode("select");
                setTeam(e.target.value);
              }}
            >
              <option value="">No location</option>
              {teamSelectOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={ADD_NEW}>Add new location...</option>
            </select>
            {teamMode === "custom" ? (
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="New location / team"
                autoFocus
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Report Aliases</label>
            <textarea
              className="textarea textarea-bordered min-h-24 w-full"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder={"One alias per line, e.g.\nLauren-Sub"}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving || !hasChanges}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
