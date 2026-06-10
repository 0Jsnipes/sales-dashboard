import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHero, PageShell } from "../components/PageLayout.jsx";
import TeamFilter from "../components/TeamFilter.jsx";
import WeekSwitcher from "../components/WeekSwitcher.jsx";
import WeeklyChart from "../components/WeeklyChart.jsx";
import WeeklyTable from "../components/WeeklyTable.jsx";
import { useAuthRole } from "../hooks/useAuth";
import { startOfWeek, toISO } from "../utils/weeks.js";

export default function SalesPage() {
  const { isAdmin, isDemo, permissions, loading } = useAuthRole();
  const canEditSales = isAdmin && permissions.canEditSales;
  const [weekISO, setWeekISO] = useState(toISO(startOfWeek()));
  const [params, setParams] = useSearchParams();
  const location = params.get("location") || "All";
  const manager = params.get("manager") || "All";

  if (loading) {
    return (
      <PageShell>
        <div className="surface-panel px-5 py-8 text-sm text-slate-600">Loading...</div>
      </PageShell>
    );
  }

  const setLocation = (value) => {
    const next = new URLSearchParams(params);
    if (value && value !== "All") next.set("location", value);
    else next.delete("location");
    setParams(next, { replace: true });
  };

  const setManager = (value) => {
    const next = new URLSearchParams(params);
    if (value && value !== "All") next.set("manager", value);
    else next.delete("manager");
    setParams(next, { replace: true });
  };

  return (
    <PageShell>
      <PageHero
        eyebrow="Sales View"
        title="Weekly sales, without the dashboard clutter."
        description="Track rep momentum, narrow the week by location or manager, and keep the numbers legible on desktop and mobile."
        stats={[
          { label: "Week", value: weekISO },
          { label: "Location", value: location },
          { label: "Manager", value: manager },
          { label: "Access", value: canEditSales ? "Editor" : isDemo ? "Demo" : "Viewer" },
        ]}
      />

      <div className="grid gap-4">
        <WeekSwitcher weekISO={weekISO} setWeekISO={setWeekISO} />
        <TeamFilter
          weekISO={weekISO}
          location={location}
          setLocation={setLocation}
          manager={manager}
          setManager={setManager}
          canChange={isAdmin || isDemo}
        />
      </div>

      <WeeklyChart
        base="weeks"
        weekISO={weekISO}
        metricKey="sales"
        title="Weekly Sales"
        teamFilter={location}
        managerFilter={manager}
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
    </PageShell>
  );
}
