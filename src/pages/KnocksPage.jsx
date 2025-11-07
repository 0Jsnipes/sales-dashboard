import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthRole } from "../hooks/useAuth.js";
import { startOfWeek, toISO } from "../utils/weeks.js";
import WeekSwitcher from "../components/WeekSwitcher.jsx";
import WeeklyChart from "../components/WeeklyChart.jsx";
import WeeklyTable from "../components/WeeklyTable.jsx";
import TeamFilter from "../components/TeamFilter.jsx";

export default function KnocksPage() {
  const { isAdmin, loading } = useAuthRole();
  const [weekISO, setWeekISO] = useState(toISO(startOfWeek()));
  const [params, setParams] = useSearchParams();
  const team = params.get("team") || "All";
  if (loading) return <div className="p-8">Loading…</div>;

  const setTeam = (t) => {
    const next = new URLSearchParams(params);
    if (t && t !== "All") next.set("team", t);
    else next.delete("team");
    setParams(next, { replace: true });
  };

  return (
<main className="mx-auto max-w-6xl p-6 sm:p-8 grid gap-8">
      
  {/* WEEK SWITCHER — CENTERED */}
  <div className="flex justify-center">
    <WeekSwitcher weekISO={weekISO} setWeekISO={setWeekISO} />
  </div>

  {/* LOCATION FILTER — RIGHT SIDE */}
  <div className="flex justify-end">
    <TeamFilter
      weekISO={weekISO}
      team={team}
      setTeam={setTeam}
      canChange={isAdmin}
    />
  </div>


      <WeeklyChart base="weeks" weekISO={weekISO} metricKey="knocks" title="Weekly Knocks" teamFilter={team} />
      <WeeklyTable base="weeks" weekISO={weekISO} isAdmin={isAdmin}
                   metricKey="knocks" goalKey="knocksGoal" title="Weekly Grid (Knocks)"
                   teamFilter={team} />
    </main>
  );
}
