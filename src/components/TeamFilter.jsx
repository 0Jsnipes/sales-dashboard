import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDemoMode } from "../hooks/useDemoMode";
import { getDemoWeekRows } from "../demo/demoData.js";

/**
 * Props:
 *  - weekISO
 *  - location
 *  - setLocation
 *  - manager
 *  - setManager
 *  - canChange: boolean (false => locked/disabled)
 */
export default function TeamFilter({
  weekISO,
  location,
  setLocation,
  manager,
  setManager,
  canChange = true,
}) {
  const isDemo = useDemoMode();
  const [locations, setLocations] = useState(["All"]);
  const [managers, setManagers] = useState(["All"]);

  useEffect(() => {
    if (!weekISO) return;
    if (isDemo) {
      const locSet = new Set();
      const mgrSet = new Set();
      getDemoWeekRows(weekISO).forEach((data) => {
        const t = (data.team || "").trim();
        const m = (data.manager || "").trim();
        if (t) locSet.add(t);
        if (m) mgrSet.add(m);
      });
      setLocations(["All", ...Array.from(locSet).sort((a, b) => a.localeCompare(b))]);
      setManagers(["All", ...Array.from(mgrSet).sort((a, b) => a.localeCompare(b))]);
      return undefined;
    }
    const unsub = onSnapshot(collection(db, "weeks", weekISO, "reps"), (s) => {
      const locSet = new Set();
      const mgrSet = new Set();
      s.forEach((d) => {
        const data = d.data();
        const t = (data.team || "").trim();
        const m = (data.manager || "").trim();
        if (t) locSet.add(t);
        if (m) mgrSet.add(m);
      });
      setLocations(["All", ...Array.from(locSet).sort((a, b) => a.localeCompare(b))]);
      setManagers(["All", ...Array.from(mgrSet).sort((a, b) => a.localeCompare(b))]);
    });
    return () => unsub && unsub();
  }, [weekISO, isDemo]);

  const handleChange = (e) => {
    if (!canChange) return; // hard block
    setLocation(e.target.value);
  };

  const handleManagerChange = (e) => {
    if (!canChange) return;
    setManager(e.target.value);
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-sm opacity-70">Location:</span>
        <select
          className="select select-bordered select-sm"
          value={location}
          onChange={handleChange}
          disabled={!canChange}
          title={canChange ? "Change location" : "Sign in to change location"}
        >
          {locations.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm opacity-70">Manager:</span>
        <select
          className="select select-bordered select-sm"
          value={manager}
          onChange={handleManagerChange}
          disabled={!canChange}
          title={canChange ? "Change manager" : "Sign in to change manager"}
        >
          {managers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {!canChange && <span className="text-xs opacity-60">(view-only)</span>}
    </div>
  );
}
