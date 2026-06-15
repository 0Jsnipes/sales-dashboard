import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoadingPanel, PageHero, PageShell } from "../components/PageLayout.jsx";
import MobileManagerAccordion from "../components/MobileManagerAccordion.jsx";
import TeamFilter from "../components/TeamFilter.jsx";
import WeekSwitcher from "../components/WeekSwitcher.jsx";
import WeeklyChart from "../components/WeeklyChart.jsx";
import WeeklyTable from "../components/WeeklyTable.jsx";
import { useAuthRole } from "../hooks/useAuth";
import { buildAccessScope } from "../lib/accessScope.js";
import { startOfWeek, toISO } from "../utils/weeks.js";

export default function SalesPage() {
  const authState = useAuthRole();
  const { isAdmin, isDemo, permissions, loading } = authState;
  const scope = buildAccessScope(authState);
  const canEditSales = isAdmin && permissions.canEditSales;
  const canEditReps = isAdmin && permissions.canEditReps;
  const [weekISO, setWeekISO] = useState(toISO(startOfWeek()));
  const [salesSnapshot, setSalesSnapshot] = useState({
    weekTotal: 0,
    percentToGoal: 0,
  });
  const [params, setParams] = useSearchParams();
  const location = scope.locationFilter || params.get("location") || "All";
  const manager = scope.managerFilter || params.get("manager") || "All";
  const handleTotalsChange = useCallback((totals) => {
    setSalesSnapshot({
      weekTotal: totals.weekTotal || 0,
      percentToGoal: totals.percentToGoal || 0,
    });
  }, []);

  if (loading) {
    return (
      <PageShell>
        <LoadingPanel label="Loading sales" detail="Syncing the weekly grid." />
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
        title="Sales"
        description="Weekly sales by rep, manager, and location."
        stats={[
          { label: "Week", value: weekISO },
          { label: "Total Sales", value: salesSnapshot.weekTotal || 0 },
          { label: "% To Goal", value: `${salesSnapshot.percentToGoal || 0}%` },
          { label: "Location", value: location },
          { label: "Manager", value: manager },
        ]}
      />

      <div className="grid gap-4">
        <WeekSwitcher weekISO={weekISO} setWeekISO={setWeekISO} />
        {!scope.hideFilters ? (
          <TeamFilter
            weekISO={weekISO}
            location={location}
            setLocation={setLocation}
            manager={manager}
            setManager={setManager}
            canChange={isAdmin || isDemo}
            showLocation={true}
            showManager={!scope.lockManagerFilter || !!scope.managerFilter}
            lockLocation={scope.lockLocationFilter}
            lockManager={scope.lockManagerFilter}
          />
        ) : null}
      </div>

      <div className="md:hidden">
        <MobileManagerAccordion
          base="weeks"
          weekISO={weekISO}
          teamFilter={location}
          managerFilter={manager}
          repNameFilter={scope.repNameFilter}
        />
      </div>

      <div className="hidden md:block">
        <WeeklyChart
          base="weeks"
          weekISO={weekISO}
          metricKey="sales"
          title="Weekly Sales"
          teamFilter={location}
          managerFilter={manager}
          repNameFilter={scope.repNameFilter}
        />
      </div>
      <WeeklyTable
        base="weeks"
        weekISO={weekISO}
        canEdit={canEditSales}
        metricKey="sales"
        goalKey="salesGoal"
        title="Weekly Grid"
        canEditReps={canEditReps}
        teamFilter={location}
        managerFilter={manager}
        repNameFilter={scope.repNameFilter}
        onTotalsChange={handleTotalsChange}
      />
    </PageShell>
  );
}
