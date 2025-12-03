import { useEffect, useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import Modal from "./Modal";

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
}) {
 const rep = reps[0] || null;

  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [team, setTeam] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form whenever we open or the rep changes
  useEffect(() => {
    if (!open || !rep) {
      setName("");
      setManager("");
      setTeam("");
      return;
    }
    setName(rep.name || "");
    setManager(rep.manager || "");
    setTeam(rep.team || "");
  }, [open, rep]);

  const hasChanges =
    !!rep &&
    (name !== (rep.name || "") ||
      manager !== (rep.manager || "") ||
      team !== (rep.team || ""));

  const handleSave = async () => {
    if (!rep || !hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const ref = doc(collection(db, base, weekISO, "reps"), rep.id);
      await setDoc(
        ref,
        {
          name: name.trim(),
          manager: manager.trim(),
          team: team.trim(),
        },
        { merge: true }
      );
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
      maxWidth="max-w-2xl bg-white"
    >
      {!rep ? (
        <div className="text-sm text-slate-500 bg-white">
          No rep selected. Close this modal and try again.
        </div>
      ) : (
        <div className="flex flex-col gap-4 bg-white">
          <div className="flex flex-col gap-2 bg-white">
            <label className="text-xs font-medium">Name</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Manager</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium">Location / Team</label>
            <input
              type="text"
              className="input input-bordered input-sm w-full"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
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
