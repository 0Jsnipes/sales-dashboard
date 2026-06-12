import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectionIntro } from "../PageLayout.jsx";

export default function SalesTrendChart({ data, selectedRep, colors }) {
  const chartData = data.dailyData.map((day) => {
    const [year, month, dateNum] = day.date.split("-").map(Number);
    const localDate = new Date(year, (month || 1) - 1, dateNum || 1);
    const result = {
      date: localDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };

    if (selectedRep) {
      result.knocks = day.reps[selectedRep]?.knocks || 0;
      result.sales = day.reps[selectedRep]?.sales || 0;
    } else {
      result.knocks = Object.values(day.reps).reduce((sum, rep) => sum + rep.knocks, 0);
      result.sales = Object.values(day.reps).reduce((sum, rep) => sum + rep.sales, 0);
    }

    return result;
  });

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        title="Trend"
        description="Daily knocks and sales over time."
      />

      <div className="mt-5 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.26)" />
            <XAxis
              dataKey="date"
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
            <Line
              type="monotone"
              dataKey="knocks"
              stroke={colors.knocks}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name="Knocks"
            />
            <Line
              type="monotone"
              dataKey="sales"
              stroke={colors.sales}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              name="Sales"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
