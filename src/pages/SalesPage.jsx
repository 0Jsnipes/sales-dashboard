import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthRole } from "../hooks/useAuth";
import { startOfWeek, toISO } from "../utils/weeks.js";
import WeekSwitcher from "../components/WeekSwitcher.jsx";
import WeeklyChart from "../components/WeeklyChart.jsx";
import WeeklyTable from "../components/WeeklyTable.jsx";
import TeamFilter from "../components/TeamFilter.jsx";

export default function SalesPage() {
  const { isAdmin, permissions, loading } = useAuthRole(); // logged-in => true
  const canEditSales = isAdmin && permissions.canEditSales;
  const [weekISO, setWeekISO] = useState(toISO(startOfWeek()));
  const [params, setParams] = useSearchParams();
  const location = params.get("location") || "All";
  const manager = params.get("manager") || "All";
  if (loading) return <div className="p-8">Loading…</div>;

  const setLocation = (val) => {
    const next = new URLSearchParams(params);
    if (val && val !== "All") next.set("location", val);
    else next.delete("location");
    setParams(next, { replace: true });
  };

  const setManager = (val) => {
    const next = new URLSearchParams(params);
    if (val && val !== "All") next.set("manager", val);
    else next.delete("manager");
    setParams(next, { replace: true });
  };

  return (
    <main className="mx-auto max-w-8xl p-6 sm:p-8 grid gap-8">
      <div className="flex flex-col items-center gap-4">
        <WeekSwitcher weekISO={weekISO} setWeekISO={setWeekISO} />
        <div className="w-full flex justify-center">
          <TeamFilter
            weekISO={weekISO}
            location={location}
            setLocation={setLocation}
            manager={manager}
            setManager={setManager}
            canChange={isAdmin}
          />
        </div>
      </div>

      <WeeklyChart
        base="weeks"
        weekISO={weekISO}
        metricKey="sales"
        title="Weekly Sales"
        teamFilter={location}
      />
      <WeeklyTable
        base="weeks"
        weekISO={weekISO}
        canEdit={canEditSales}
        metricKey="sales"
        goalKey="salesGoal"
        title="Weekly Grid"
        teamFilter={location}
        managerFilter={manager}
      />
    </main>
  );
}
