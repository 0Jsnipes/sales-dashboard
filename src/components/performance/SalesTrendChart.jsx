import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

export default function SalesTrendChart({ data, selectedRep, colors }) {
  const title = "Knocks and Sales Trend";
  const knocksLabel = "Knocks";
  const salesLabel = "Sales";

  const chartData = data.dailyData.map((day) => {
    const [year, month, dateNum] = day.date.split("-").map(Number);
    const localDate = new Date(year, (month || 1) - 1, dateNum || 1);
    const result = {
      date: localDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      })
    };

    if (selectedRep) {
      result.knocks = day.reps[selectedRep]?.knocks || 0;
      result.sales = day.reps[selectedRep]?.sales || 0;
    } else {
      result.knocks = Object.values(day.reps).reduce(
        (sum, rep) => sum + rep.knocks,
        0
      );
      result.sales = Object.values(day.reps).reduce(
        (sum, rep) => sum + rep.sales,
        0
      );
    }

    return result;
  });

  return (
    <div className="rounded-2xl bg-base-100 p-6 shadow">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="knocks"
              stroke={colors.knocks}
              strokeWidth={2}
              name={knocksLabel}
            />
            <Line
              type="monotone"
              dataKey="sales"
              stroke={colors.sales}
              strokeWidth={2}
              name={salesLabel}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
