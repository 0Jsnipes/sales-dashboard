import { useEffect } from "react";
import { ensureWeekWithAutoclone } from "../lib/weeks.js";
import { addDays, parseWeekISO, toISO, startOfWeek } from "../utils/weeks.js";

function ArrowIcon({ direction = "left" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? (
        <path d="M12.5 4.5 7 10l5.5 5.5" />
      ) : (
        <path d="M7.5 4.5 13 10l-5.5 5.5" />
      )}
    </svg>
  );
}

export default function WeekSwitcher({ weekISO, setWeekISO }) {
  useEffect(() => {
    ensureWeekWithAutoclone(weekISO);
  }, [weekISO]);

  const start = parseWeekISO(weekISO) ?? startOfWeek();

  const prev = () => setWeekISO(toISO(addDays(start, -7)));
  const next = () => setWeekISO(toISO(addDays(start, 7)));

  return (
    <div className="toolbar-card w-full px-3 py-3 sm:px-4">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <button
          className="btn btn-outline btn-square btn-sm sm:btn-md"
          onClick={prev}
          type="button"
          aria-label="Previous week"
          title="Previous week"
        >
          <ArrowIcon direction="left" />
        </button>

        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Active Week
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-slate-950 sm:text-[2rem]">
            Week of {toISO(start)}
          </div>
        </div>

        <button
          className="btn btn-primary btn-square btn-sm sm:btn-md"
          onClick={next}
          type="button"
          aria-label="Next week"
          title="Next week"
        >
          <ArrowIcon direction="right" />
        </button>
      </div>
    </div>
  );
}
