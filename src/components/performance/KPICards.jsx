function IconTrending({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h7v7" />
    </svg>
  );
}

function IconTarget({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function IconUsers({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCalendar({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export default function KPICards({ data, selectedRep }) {
  const rep = selectedRep ? data.reps.find((r) => r.id === selectedRep) : null;

  const kpis = rep
    ? [
        {
          label: "Total Knocks",
          value: rep.knocks,
          icon: IconTrending,
          color: "text-blue-600",
          bgColor: "bg-blue-50"
        },
        {
          label: "Total Sales",
          value: rep.sales,
          icon: IconTarget,
          color: "text-green-600",
          bgColor: "bg-green-50"
        },
        {
          label: "Conversion Rate",
          value: `${((rep.sales / rep.knocks) * 100).toFixed(1)}%`,
          icon: IconTrending,
          color: "text-amber-600",
          bgColor: "bg-amber-50"
        },
        {
          label: "Days Active",
          value: rep.daysActive,
          icon: IconCalendar,
          color: "text-orange-600",
          bgColor: "bg-orange-50"
        }
      ]
    : [
        {
          label: "Total Knocks",
          value: data.companyKPIs.totalKnocks,
          icon: IconTrending,
          color: "text-blue-600",
          bgColor: "bg-blue-50"
        },
        {
          label: "Total Sales",
          value: data.companyKPIs.totalSales,
          icon: IconTarget,
          color: "text-green-600",
          bgColor: "bg-green-50"
        },
        {
          label: "Conversion Rate",
          value: `${data.companyKPIs.conversionRate.toFixed(1)}%`,
          icon: IconTrending,
          color: "text-amber-600",
          bgColor: "bg-amber-50"
        },
        {
          label: "Active Reps Yesterday",
          value: data.companyKPIs.activeReps,
          icon: IconUsers,
          color: "text-orange-600",
          bgColor: "bg-orange-50"
        }
      ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div key={idx} className="rounded-2xl bg-base-100 p-6 shadow">
            <div className="flex items-center justify-between">
              <div className={`rounded-xl p-3 ${kpi.bgColor}`}>
                <Icon className={`h-6 w-6 ${kpi.color}`} />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">{kpi.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{kpi.value}</p>
          </div>
        );
      })}
    </div>
  );
}
