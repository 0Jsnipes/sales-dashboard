import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * Props:
 *  - value: string
 *  - onChange: (team: string) => void
 *  - isAdmin: boolean  (only admins see +Add)
 */
export default function TeamSelect({ value, onChange, isAdmin = false }) {
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    // live list from /teams
    const unsub = onSnapshot(collection(db, "teams"), (s) => {
      const list = s.docs
        .map((d) => (d.data().name || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      setTeams(list);
    });
    return () => unsub();
  }, []);

  const addTeam = async () => {
    if (!isAdmin) return;
    const name = (prompt("New location name:") || "").trim();
    if (!name) return;

    try {
      // optimistic update so it appears instantly
      setTeams((prev) => {
        if (prev.includes(name)) return prev;
        return [...prev, name].sort((a, b) => a.localeCompare(b));
      });
      await addDoc(collection(db, "teams"), { name });
      onChange(name);
    } catch (e) {
      // rollback on error (optional)
      setTeams((prev) => prev.filter((t) => t !== name));
      alert(`Could not add location: ${e?.message || e}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        className="select select-bordered w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select location…</option>
        {teams.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {isAdmin && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={addTeam}>
          Add
        </button>
      )}
    </div>
  );
}
