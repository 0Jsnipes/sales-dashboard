import { useState } from "react";
import { SectionIntro } from "../PageLayout.jsx";

export default function ActivityHeatmap({ data, selectedRep, dateRange, colors }) {
  const [highlightedRep, setHighlightedRep] = useState(null);

  const parseLocalDate = (dateStr) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  };

  const getDaysFromRange = () => {
    const numDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    return data.dailyData.slice(-numDays);
  };

  const days = getDaysFromRange();
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  const getCellColor = (knocks, sales) => {
    if (sales >= 2) return colors.high;
    if (sales === 1) return colors.mediumHigh;
    if (knocks >= 50) return colors.high;
    if (knocks >= 30) return colors.mediumHigh;
    return colors.low;
  };

  const repsToShow = (selectedRep
    ? data.reps.filter((rep) => rep.id === selectedRep)
    : data.reps
  )
    .filter((rep) => {
      const totals = days.reduce(
        (acc, day) => {
          const repData = day.reps[rep.id];
          acc.knocks += repData?.knocks || 0;
          acc.sales += repData?.sales || 0;
          return acc;
        },
        { knocks: 0, sales: 0 }
      );
      return totals.knocks > 0 || totals.sales > 0;
    })
    .filter((rep, index, all) => {
      const normalizedName = rep.name.trim().toLowerCase();
      return (
        all.findIndex((item) => item.name.trim().toLowerCase() === normalizedName) === index
      );
    });

  const rangeLabel =
    dateRange === "7d" ? "Last 7 Days" : dateRange === "30d" ? "Last 30 Days" : "Last 90 Days";

  const formatWeekLabel = (date) =>
    parseLocalDate(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  const formatDayLabel = (date) =>
    parseLocalDate(date).toLocaleDateString("en-US", { weekday: "short" });

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        eyebrow="Activity"
        title={`Daily Activity Heatmap (${rangeLabel})`}
        description="A quick visual read on performance intensity. Tap or click a rep row to keep your place while scanning the range."
      />

      {dateRange === "7d" ? (
        <div className="mt-5 overflow-x-auto">
          <table className="table w-full min-w-[720px]">
            <thead>
              <tr className="text-slate-600">
                <th className="text-left">Rep</th>
                {days.map((day) => (
                  <th key={day.date} className="text-center text-xs font-medium">
                    {parseLocalDate(day.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repsToShow.map((rep) => (
                <tr
                  key={rep.id}
                  className={highlightedRep === rep.id ? "bg-amber-50/70" : ""}
                >
                  <td className="font-medium text-slate-900">{rep.name}</td>
                  {days.map((day) => {
                    const repData = day.reps[rep.id];
                    const knocks = repData?.knocks || 0;
                    const sales = repData?.sales || 0;

                    return (
                      <td key={`${rep.id}-${day.date}`} className="min-w-[124px] p-2">
                        <button
                          type="button"
                          style={{ backgroundColor: getCellColor(knocks, sales) }}
                          className="w-full rounded-[18px] p-3 text-center text-xs text-slate-950 transition hover:scale-[1.03]"
                          title={`${knocks} knocks, ${sales} sales`}
                          onClick={() => setHighlightedRep(rep.id)}
                        >
                          <div>{knocks} knocks</div>
                          <div className="font-semibold text-emerald-800">{sales} sales</div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[620px] space-y-4">
            <div
              className="grid items-end gap-2"
              style={{
                gridTemplateColumns: `160px 40px repeat(${weeks.length}, minmax(0, 1fr))`,
              }}
            >
              <div />
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Day</div>
              {weeks.map((week, index) => (
                <div
                  key={`${week[0]?.date || index}-label`}
                  className="text-center text-[10px] font-medium text-slate-500"
                >
                  {week[0] ? formatWeekLabel(week[0].date) : ""}
                </div>
              ))}
            </div>

            <div className="grid gap-4">
              {repsToShow.map((rep) => (
                <div
                  key={rep.id}
                  className={`grid items-start gap-2 rounded-[22px] border border-slate-200/70 bg-white/70 p-3 ${
                    highlightedRep === rep.id ? "ring-2 ring-amber-200" : ""
                  }`}
                  style={{
                    gridTemplateColumns: `160px 40px repeat(${weeks.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="text-sm font-medium text-slate-900">{rep.name}</div>
                  <div className="grid grid-rows-7 gap-1 text-right text-[10px] text-slate-400">
                    {weeks[0]?.map((day) => (
                      <div key={day.date} className="h-10 leading-10">
                        {formatDayLabel(day.date)}
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 7 - (weeks[0]?.length || 0)) }).map(
                      (_, index) => (
                        <div
                          key={`pad-label-${rep.id}-${index}`}
                          className="h-10 leading-10 text-transparent"
                        >
                          .
                        </div>
                      )
                    )}
                  </div>

                  {weeks.map((week, weekIndex) => (
                    <div key={`${rep.id}-${weekIndex}`} className="grid grid-rows-7 gap-1">
                      {week.map((day) => {
                        const repData = day.reps[rep.id];
                        const knocks = repData?.knocks || 0;
                        const sales = repData?.sales || 0;

                        return (
                          <button
                            key={day.date}
                            type="button"
                            style={{ backgroundColor: getCellColor(knocks, sales) }}
                            className="flex h-10 cursor-pointer flex-col items-center justify-center rounded text-[9px] font-semibold text-slate-950 transition hover:scale-[1.08]"
                            title={`${formatWeekLabel(day.date)} ${formatDayLabel(day.date)}: ${knocks} knocks, ${sales} sales`}
                            onClick={() => setHighlightedRep(rep.id)}
                          >
                            <span>{knocks}k</span>
                            <span className="text-emerald-800">{sales}s</span>
                          </button>
                        );
                      })}
                      {Array.from({ length: Math.max(0, 7 - week.length) }).map((_, index) => (
                        <div
                          key={`pad-${rep.id}-${weekIndex}-${index}`}
                          className="h-10 rounded bg-slate-100"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>Performance key:</span>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.low }} />
          <span>0 sales and fewer than 30 knocks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.mediumHigh }} />
          <span>1 sale or 30 to 49 knocks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.high }} />
          <span>2+ sales or 50+ knocks</span>
        </div>
      </div>
    </section>
  );
}
