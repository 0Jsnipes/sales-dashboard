import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

export default function RepComparisonChart({ data, colors }) {
  const chartData = data.reps.map((rep) => ({
    name: rep.name.split(" ")[0],
    knocks: rep.knocks,
    sales: rep.sales,
    conversionRate: ((rep.sales / rep.knocks) * 100).toFixed(1),
    daysActive: rep.daysActive
  }));

  return (
    <div className="rounded-2xl bg-base-100 p-6 shadow">
      <h3 className="text-lg font-semibold text-slate-900">Rep Comparison</h3>
      <div className="mt-4 h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="knocks" fill={colors.knocks} name="Knocks" />
            <Bar dataKey="sales" fill={colors.sales} name="Sales" />
            <Bar dataKey="daysActive" fill={colors.daysActive} name="Days Active" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
