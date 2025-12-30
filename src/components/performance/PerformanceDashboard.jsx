import { useEffect, useState } from "react";
import KPICards from "./KPICards.jsx";
import RepComparisonChart from "./RepComparisonChart.jsx";
import SalesTrendChart from "./SalesTrendChart.jsx";
import ActivityHeatmap from "./ActivityHeatmap.jsx";
import RepSelector from "./RepSelector.jsx";
import { usePerformanceData } from "./usePerformanceData.js";

const emptyData = {
  reps: [],
  dailyData: [],
  companyKPIs: {
    totalKnocks: 0,
    totalSales: 0,
    conversionRate: 0,
    avgDaysActive: 0,
    activeReps: 0
  }
};

export default function PerformanceDashboard() {
  const [selectedRep, setSelectedRep] = useState(null);
  const [dateRange, setDateRange] = useState("7d");
  const [chartColors, setChartColors] = useState({
    knocks: "#2563eb",
    sales: "#16a34a",
    daysActive: "#f59e0b"
  });
  const [heatmapColors, setHeatmapColors] = useState({
    none: "#e5e7eb",
    low: "#fca5a5",
    medium: "#fdba74",
    mediumHigh: "#facc15",
    high: "#22c55e"
  });

  const { data, loading, error } = usePerformanceData(dateRange);
  const dashboardData = data || emptyData;

  useEffect(() => {
    if (!selectedRep) return;
    const exists = dashboardData.reps.some((rep) => rep.id === selectedRep);
    if (!exists) setSelectedRep(null);
  }, [dashboardData.reps, selectedRep]);

  return (
    <div className="grid gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          Sales Performance Dashboard
        </h1>
        <p className="text-slate-600">
          Track individual rep performance and company-wide KPIs.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <RepSelector
          reps={dashboardData.reps}
          selectedRep={selectedRep}
          onSelectRep={setSelectedRep}
        />
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-xl border border-base-300 bg-base-100 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {loading && (
        <div className="rounded-2xl bg-base-100 p-4 text-sm text-slate-500 shadow">
          Loading performance data...
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 shadow">
          Failed to load performance data. Check console for details.
        </div>
      )}

      <KPICards data={dashboardData} selectedRep={selectedRep} />

      <div className="rounded-2xl bg-base-100 p-6 shadow">
        <h3 className="text-lg font-semibold text-slate-900">Chart Colors</h3>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Knocks
            <input
              type="color"
              value={chartColors.knocks}
              onChange={(e) =>
                setChartColors({ ...chartColors, knocks: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Sales
            <input
              type="color"
              value={chartColors.sales}
              onChange={(e) =>
                setChartColors({ ...chartColors, sales: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Days Active
            <input
              type="color"
              value={chartColors.daysActive}
              onChange={(e) =>
                setChartColors({ ...chartColors, daysActive: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
        </div>

        <h3 className="mt-6 text-lg font-semibold text-slate-900">Heatmap Colors</h3>
        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            None
            <input
              type="color"
              value={heatmapColors.none}
              onChange={(e) =>
                setHeatmapColors({ ...heatmapColors, none: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Low
            <input
              type="color"
              value={heatmapColors.low}
              onChange={(e) =>
                setHeatmapColors({ ...heatmapColors, low: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Medium
            <input
              type="color"
              value={heatmapColors.medium}
              onChange={(e) =>
                setHeatmapColors({ ...heatmapColors, medium: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Medium-High
            <input
              type="color"
              value={heatmapColors.mediumHigh}
              onChange={(e) =>
                setHeatmapColors({ ...heatmapColors, mediumHigh: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            High
            <input
              type="color"
              value={heatmapColors.high}
              onChange={(e) =>
                setHeatmapColors({ ...heatmapColors, high: e.target.value })
              }
              className="h-9 w-12 cursor-pointer rounded border border-base-300"
            />
          </label>
        </div>
      </div>

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
