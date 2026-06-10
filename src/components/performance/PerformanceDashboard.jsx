import { useEffect, useState } from "react";
import ActivityHeatmap from "./ActivityHeatmap.jsx";
import KPICards from "./KPICards.jsx";
import RepComparisonChart from "./RepComparisonChart.jsx";
import RepSelector from "./RepSelector.jsx";
import SalesTrendChart from "./SalesTrendChart.jsx";
import { usePerformanceData } from "./usePerformanceData.js";
import { PageHero, SectionIntro } from "../PageLayout.jsx";

const emptyData = {
  reps: [],
  dailyData: [],
  companyKPIs: {
    totalKnocks: 0,
    totalSales: 0,
    conversionRate: 0,
    avgDaysActive: 0,
    activeReps: 0,
  },
};

export default function PerformanceDashboard() {
  const [selectedRep, setSelectedRep] = useState(null);
  const [dateRange, setDateRange] = useState("7d");
  const [chartColors, setChartColors] = useState({
    knocks: "#3c8af8",
    sales: "#19a974",
    daysActive: "#d8a629",
  });
  const [heatmapColors, setHeatmapColors] = useState({
    none: "#e7edf4",
    low: "#f8b4bc",
    medium: "#f8cf9a",
    mediumHigh: "#f2dd66",
    high: "#7ade8a",
  });

  const { data, loading, error } = usePerformanceData(dateRange);
  const dashboardData = data || emptyData;

  useEffect(() => {
    if (!selectedRep) return;
    const exists = dashboardData.reps.some((rep) => rep.id === selectedRep);
    if (!exists) setSelectedRep(null);
  }, [dashboardData.reps, selectedRep]);

  return (
    <div className="page-stack">
      <PageHero
        eyebrow="Performance"
        title="Trends, comparisons, and rep activity in one view."
        description="Use the selector and time range below to focus the analytics without losing the larger company picture."
        stats={[
          { label: "Range", value: dateRange.toUpperCase() },
          { label: "Reps", value: dashboardData.reps.length || 0 },
          {
            label: "Scope",
            value:
              dashboardData.reps.find((rep) => rep.id === selectedRep)?.name || "All reps",
          },
          {
            label: "Sales",
            value: dashboardData.companyKPIs.totalSales || 0,
          },
        ]}
      />

      <section className="toolbar-card">
        <SectionIntro
          eyebrow="Filters"
          title="Analytics Controls"
          description="Switch between rep-level and company-level performance, then tune chart and heatmap colors if you need a different visual read."
        />

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Rep Scope
              </span>
              <RepSelector
                reps={dashboardData.reps}
                selectedRep={selectedRep}
                onSelectRep={setSelectedRep}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Date Range
              </span>
              <select
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value)}
                className="select select-bordered h-12 w-full"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </label>
          </div>

          <div className="flex items-center">
            <span className="metric-chip">
              <span className="metric-chip__dot" aria-hidden="true" />
              {selectedRep ? "Rep focus enabled" : "Company overview"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-[22px] border border-slate-200/70 bg-slate-50/90 px-4 py-4 text-sm text-slate-500">
            Loading performance data...
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            Failed to load performance data. Check the console for details.
          </div>
        ) : null}
      </section>

      <KPICards data={dashboardData} selectedRep={selectedRep} />

      <section className="glass-panel p-5">
        <SectionIntro
          eyebrow="Appearance"
          title="Tune the visual signal"
          description="Adjust chart and heatmap colors without changing the underlying data."
        />

        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200/70 bg-white/72 p-4">
            <h3 className="text-base font-semibold text-slate-950">Chart Colors</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ColorField
                label="Knocks"
                value={chartColors.knocks}
                onChange={(value) => setChartColors({ ...chartColors, knocks: value })}
              />
              <ColorField
                label="Sales"
                value={chartColors.sales}
                onChange={(value) => setChartColors({ ...chartColors, sales: value })}
              />
              <ColorField
                label="Days Active"
                value={chartColors.daysActive}
                onChange={(value) => setChartColors({ ...chartColors, daysActive: value })}
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white/72 p-4">
            <h3 className="text-base font-semibold text-slate-950">Heatmap Colors</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <ColorField
                label="None"
                value={heatmapColors.none}
                onChange={(value) => setHeatmapColors({ ...heatmapColors, none: value })}
              />
              <ColorField
                label="Low"
                value={heatmapColors.low}
                onChange={(value) => setHeatmapColors({ ...heatmapColors, low: value })}
              />
              <ColorField
                label="Medium"
                value={heatmapColors.medium}
                onChange={(value) => setHeatmapColors({ ...heatmapColors, medium: value })}
              />
              <ColorField
                label="Medium-High"
                value={heatmapColors.mediumHigh}
                onChange={(value) =>
                  setHeatmapColors({ ...heatmapColors, mediumHigh: value })
                }
              />
              <ColorField
                label="High"
                value={heatmapColors.high}
                onChange={(value) => setHeatmapColors({ ...heatmapColors, high: value })}
              />
            </div>
          </div>
        </div>
      </section>

      <SalesTrendChart
        data={dashboardData}
        selectedRep={selectedRep}
        colors={chartColors}
      />
      <RepComparisonChart data={dashboardData} colors={chartColors} />
      <ActivityHeatmap
        data={dashboardData}
        selectedRep={selectedRep}
        dateRange={dateRange}
        colors={heatmapColors}
      />
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="grid gap-2 rounded-[20px] border border-slate-200/70 bg-slate-50/80 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span
          className="h-6 w-6 rounded-full border border-white/70 shadow-sm"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-transparent p-1"
        />
      </div>
    </label>
  );
}
