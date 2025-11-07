import { useEffect } from "react";
import { ensureWeekWithAutoclone } from "../lib/weeks.js";
import { DAYS, addDays, parseWeekISO, toISO, startOfWeek } from "../utils/weeks.js";

export default function WeekSwitcher({ weekISO, setWeekISO }) {
  useEffect(() => { ensureWeekWithAutoclone(weekISO); }, [weekISO]);

  const start = parseWeekISO(weekISO) ?? startOfWeek();
  const range = DAYS.map((_, i) => toISO(addDays(start, i)).slice(5)).join(" – ");

  const prev = () => setWeekISO(toISO(addDays(start, -7)));
  const next = () => setWeekISO(toISO(addDays(start, +7)));

  return (
    <div className="rounded-2xl bg-base-100 p-4 sm:p-6 shadow flex items-center justify-between">
      <button className="btn btn-sm" onClick={prev}>&larr; Prev</button>
      <div className="text-center">
        <div className="font-semibold">Week of {toISO(start)}</div>
        <div className="text-xs opacity-70">{range}</div>
      </div>
      <button className="btn btn-sm" onClick={next}>Next &rarr;</button>
    </div>
  );
}
