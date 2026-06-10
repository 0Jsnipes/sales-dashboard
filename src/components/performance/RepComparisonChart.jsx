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
    knocks: rep.knocks,
    sales: rep.sales,
    daysActive: rep.daysActive,
  }));

  const chartWidth = Math.max(720, chartData.length * 88);

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        eyebrow="Comparison"
        title="Rep Comparison"
        description="Compare knocks, sales, and days active side by side. On smaller screens, the chart scrolls horizontally instead of crushing the labels."
      />

      <div className="mt-5 overflow-x-auto">
        <div style={{ width: chartWidth, height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.26)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#5b6a84", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#5b6a84", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(121, 143, 171, 0.18)",
                  background: "rgba(255,255,255,0.94)",
                  boxShadow: "0 18px 34px rgba(9,20,35,0.12)",
                }}
              />
              <Legend />
              <Bar dataKey="knocks" fill={colors.knocks} radius={[10, 10, 0, 0]} name="Knocks" />
              <Bar dataKey="sales" fill={colors.sales} radius={[10, 10, 0, 0]} name="Sales" />
              <Bar
                dataKey="daysActive"
                fill={colors.daysActive}
                radius={[10, 10, 0, 0]}
                name="Days Active"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
