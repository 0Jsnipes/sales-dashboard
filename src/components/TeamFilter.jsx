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
    <div className="toolbar-card toolbar-card--compact w-full">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Location
          </span>
          <select
            className="select select-bordered h-12 w-full"
            value={location}
            onChange={handleChange}
            disabled={!canChange}
            title={canChange ? "Change location" : "Sign in to change location"}
          >
            {locations.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Manager
          </span>
          <select
            className="select select-bordered h-12 w-full"
            value={manager}
            onChange={handleManagerChange}
            disabled={!canChange}
            title={canChange ? "Change manager" : "Sign in to change manager"}
          >
            {managers.map((managerName) => (
              <option key={managerName} value={managerName}>
                {managerName}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center xl:justify-end">
          <span className="metric-chip">
            <span className="metric-chip__dot" aria-hidden="true" />
            {canChange ? "Live filters enabled" : "View-only filters"}
          </span>
        </div>
      </div>
    </div>
  );
}
