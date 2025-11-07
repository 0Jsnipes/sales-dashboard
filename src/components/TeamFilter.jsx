import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * Props:
 *  - weekISO
 *  - team
 *  - setTeam
 *  - canChange: boolean (false => locked/disabled)
 */
export default function TeamFilter({ weekISO, team, setTeam, canChange = true }) {
  const [teams, setTeams] = useState(["All"]);

  useEffect(() => {
    if (!weekISO) return;
    const unsub = onSnapshot(collection(db, "weeks", weekISO, "reps"), (s) => {
      const set = new Set();
      s.forEach((d) => {
        const t = (d.data().team || "").trim();
        if (t) set.add(t);
      });
      setTeams(["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))]);
    });
    return () => unsub && unsub();
  }, [weekISO]);

  const handleChange = (e) => {
    if (!canChange) return; // hard block
    setTeam(e.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-70">Location:</span>
      <select
        className="select select-bordered select-sm"
        value={team}
        onChange={handleChange}
        disabled={!canChange}
        title={canChange ? "Change location" : "Sign in to change location"}
      >
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {!canChange && (
        <span className="text-xs opacity-60">(view-only)</span>
      )}
    </div>
  );
}
