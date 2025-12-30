export default function ActivityHeatmap({ data, selectedRep, dateRange, colors }) {
  const getDaysFromRange = () => {
    const numDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    return data.dailyData.slice(-numDays);
  };

  const days = getDaysFromRange();

  const getIntensity = (value, max) => {
    if (!max) return colors.none;
    const ratio = value / max;
    if (ratio > 0.75) return colors.high;
    if (ratio > 0.5) return colors.mediumHigh;
    if (ratio > 0.25) return colors.medium;
    if (ratio > 0) return colors.low;
    return colors.none;
  };

  const repsToShow = selectedRep
    ? data.reps.filter((r) => r.id === selectedRep)
    : data.reps;

  const maxKnocks = Math.max(
    1,
    ...days.flatMap((day) => Object.values(day.reps).map((rep) => rep.knocks))
  );

  const rangeLabel =
    dateRange === "7d" ? "Last 7 Days" : dateRange === "30d" ? "Last 30 Days" : "Last 90 Days";

  return (
    <div className="rounded-2xl bg-base-100 p-6 shadow">
      <h3 className="text-lg font-semibold text-slate-900">
        Daily Activity Heatmap ({rangeLabel})
      </h3>
      <div className="mt-4 overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr className="text-slate-600">
              <th className="text-left">Rep</th>
              {days.map((day, idx) => (
                <th key={idx} className="text-center text-xs font-medium">
                  {new Date(day.date).toLocaleDateString("en-US", {
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
              <tr key={rep.id} className="border-t border-base-200">
                <td className="font-medium text-slate-900">{rep.name}</td>
                {days.map((day, idx) => {
                  const repData = day.reps[rep.id];
                  const knocks = repData?.knocks || 0;
                  const sales = repData?.sales || 0;

                  return (
                    <td key={idx} className="min-w-[120px] p-2">
                      <div
                        style={{ backgroundColor: getIntensity(knocks, maxKnocks) }}
                        className="rounded-xl p-3 text-center text-xs transition-transform hover:scale-[1.02]"
                        title={`${knocks} knocks, ${sales} sales`}
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
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span>Activity Level:</span>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.none }} />
          <span>None</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.low }} />
          <span>Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.medium }} />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.mediumHigh }} />
          <span>Medium-High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded" style={{ backgroundColor: colors.high }} />
          <span>High</span>
        </div>
      </div>
    </div>
  );
}
