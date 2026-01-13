import { useState } from "react";

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
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const getCellColor = (knocks, sales) => {
    if (sales >= 2) return colors.high;
    if (sales === 1) return colors.mediumHigh;
    if (knocks >= 50) return colors.high;
    if (knocks >= 30) return colors.mediumHigh;
    return colors.low;
  };

  const repsToShow = (selectedRep
    ? data.reps.filter((r) => r.id === selectedRep)
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
    .filter((rep, idx, all) => {
      const normalizedName = rep.name.trim().toLowerCase();
      return all.findIndex((item) => item.name.trim().toLowerCase() === normalizedName) === idx;
    });

  const rangeLabel =
    dateRange === "7d" ? "Last 7 Days" : dateRange === "30d" ? "Last 30 Days" : "Last 90 Days";

  const formatWeekLabel = (date) =>
    parseLocalDate(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
  const formatDayLabel = (date) =>
    parseLocalDate(date).toLocaleDateString("en-US", { weekday: "short" });

  return (
    <div className="rounded-2xl bg-base-100 p-6 shadow">
      <h3 className="text-lg font-semibold text-slate-900">
        Daily Activity Heatmap ({rangeLabel})
      </h3>
      {dateRange === "7d" ? (
        <div className="mt-4 overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="text-slate-600">
                <th className="text-left">Rep</th>
                {days.map((day, idx) => (
                    <th key={idx} className="text-center text-xs font-medium">
                    {parseLocalDate(day.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "numeric",
                      day: "numeric"
                    })}
                    </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repsToShow.map((rep) => (
                <tr
                  key={rep.id}
                  className={`border-t border-base-200 ${
                    highlightedRep === rep.id ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="font-medium text-slate-900">{rep.name}</td>
                  {days.map((day, idx) => {
                    const repData = day.reps[rep.id];
                    const knocks = repData?.knocks || 0;
                    const sales = repData?.sales || 0;

                    return (
                      <td key={idx} className="min-w-[120px] p-2">
                        <div
                          style={{ backgroundColor: getCellColor(knocks, sales) }}
                          className="cursor-pointer rounded-xl p-3 text-center text-xs transition-transform hover:scale-[1.1]"
                          title={`${knocks} knocks, ${sales} sales`}
                          onClick={() => setHighlightedRep(rep.id)}
                        >
                          <div className="text-slate-900">{knocks} knocks</div>
                          <div className="text-green-700">{sales} sales</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[520px] space-y-3">
            <div
              className="grid items-end gap-2"
              style={{
                gridTemplateColumns: `160px 36px repeat(${weeks.length}, minmax(0, 1fr))`
              }}
            >
              <div />
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Day</div>
              {weeks.map((week, idx) => (
                <div
                  key={`${week[0]?.date || idx}-label`}
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
                  className={`grid items-start gap-2 rounded ${
                    highlightedRep === rep.id ? "bg-amber-50/70" : ""
                  }`}
                  style={{
                    gridTemplateColumns: `160px 36px repeat(${weeks.length}, minmax(0, 1fr))`
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
                      (_, idx) => (
                        <div
                          key={`pad-label-${idx}`}
                          className="h-10 leading-10 text-transparent"
                        >
                          .
                        </div>
                      )
                    )}
                  </div>
                  {weeks.map((week, weekIdx) => (
                    <div key={`${rep.id}-${weekIdx}`} className="grid grid-rows-7 gap-1">
                      {week.map((day) => {
                        const repData = day.reps[rep.id];
                        const knocks = repData?.knocks || 0;
                        const sales = repData?.sales || 0;

                        return (
                        <div
                          key={day.date}
                          style={{ backgroundColor: getCellColor(knocks, sales) }}
                          className="flex h-10 cursor-pointer flex-col items-center justify-center rounded text-[9px] font-semibold text-slate-900 transition-transform hover:scale-[1.12]"
                          title={`${formatWeekLabel(day.date)} ${formatDayLabel(
                            day.date
                          )}: ${knocks} knocks, ${sales} sales`}
                          onClick={() => setHighlightedRep(rep.id)}
                        >
                          <span>{knocks}k</span>
                          <span className="text-green-700">{sales}s</span>
                        </div>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 7 - week.length) }).map((_, idx) => (
                      <div
                        key={`pad-${rep.id}-${weekIdx}-${idx}`}
                        className="h-10 rounded bg-base-200/40"
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
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>Performance Key:</span>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.low }} />
          <span>Red: 0 sales &lt; 30 knocks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.mediumHigh }} />
          <span>Yellow: 1 sale or 0 sales with 30-49 knocks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.high }} />
          <span>Green: 2+ sales or 0 sales with 50+ knocks</span>
        </div>
      </div>
    </div>
  );
}
