import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionIntro } from "../PageLayout.jsx";

export default function RepComparisonChart({ data, colors }) {
  const formatRepLabel = (fullName) => {
    const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    const first = parts[0];
    const lastInitial = parts[parts.length - 1][0] || "";
    return `${first} ${lastInitial}.`;
  };

  const uniqueReps = data.reps
    .filter((rep) => (rep.knocks || 0) > 0 || (rep.sales || 0) > 0)
    .filter((rep, index, all) => {
      const normalizedName = rep.name.trim().toLowerCase();
      return (
        all.findIndex((item) => item.name.trim().toLowerCase() === normalizedName) === index
      );
    });

  const chartData = uniqueReps.map((rep) => ({
    name: formatRepLabel(rep.name),
    fullName: rep.name,
    knocks: rep.knocks,
    sales: rep.sales,
    daysActive: rep.daysActive,
  }));

  const barSize = Math.max(10, Math.min(24, Math.floor(520 / Math.max(chartData.length, 1))));

  const renderTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const item = payload[0]?.payload;
    if (!item) return null;

    const rows = [
      { label: "Knocks", value: item.knocks, color: colors.knocks },
      { label: "Sales", value: item.sales, color: colors.sales },
      { label: "Days Active", value: item.daysActive, color: colors.daysActive },
    ];

    return (
      <div className="rounded-[18px] border border-slate-200/80 bg-white/96 px-4 py-3 shadow-[0_18px_34px_rgba(9,20,35,0.12)] backdrop-blur">
        <div className="text-sm font-semibold text-slate-950">{item.fullName}</div>
        <div className="mt-3 grid gap-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                <span>{row.label}</span>
              </div>
              <div className="font-semibold text-slate-950">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        eyebrow="Comparison"
        title="Rep Comparison"
        description="Compare knocks, sales, and days active side by side. Hover a bar to see the rep name."
      />

      <div className="mt-5 h-[clamp(300px,48vh,420px)] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 0, bottom: 48 }}
            barCategoryGap="16%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.26)" />
            <XAxis
              dataKey="name"
              hide
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#5b6a84", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={renderTooltip} />
            <Legend wrapperStyle={{ paddingTop: 8 }} />
            <Bar
              dataKey="knocks"
              fill={colors.knocks}
              radius={[10, 10, 0, 0]}
              name="Knocks"
              barSize={barSize}
            />
            <Bar
              dataKey="sales"
              fill={colors.sales}
              radius={[10, 10, 0, 0]}
              name="Sales"
              barSize={barSize}
            />
            <Bar
              dataKey="daysActive"
              fill={colors.daysActive}
              radius={[10, 10, 0, 0]}
              name="Days Active"
              barSize={barSize}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
