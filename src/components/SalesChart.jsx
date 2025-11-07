import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { todayId } from "../utils/date";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SalesChart() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "days", todayId(), "reps"));
    return onSnapshot(q, (s) => {
      setRows(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);
  return (
    <div className="rounded-2xl bg-base-100 p-4 shadow">
      <h2 className="text-base font-semibold">Sales by Rep (Today)</h2>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="sales" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
