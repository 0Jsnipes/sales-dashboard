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
  const rep = selectedRep ? data.reps.find((item) => item.id === selectedRep) : null;

  const cards = rep
    ? [
        {
          label: "Total Knocks",
          value: rep.knocks,
          icon: IconTrending,
          tint: "from-sky-100 to-sky-50",
          iconColor: "text-sky-600",
        },
        {
          label: "Total Sales",
          value: rep.sales,
          icon: IconTarget,
          tint: "from-emerald-100 to-emerald-50",
          iconColor: "text-emerald-600",
        },
        {
          label: "Conversion Rate",
          value: `${((rep.sales / Math.max(rep.knocks, 1)) * 100).toFixed(1)}%`,
          icon: IconTrending,
          tint: "from-amber-100 to-amber-50",
          iconColor: "text-amber-600",
        },
        {
          label: "Days Active",
          value: rep.daysActive,
          icon: IconCalendar,
          tint: "from-rose-100 to-rose-50",
          iconColor: "text-rose-600",
        },
      ]
    : [
        {
          label: "Total Knocks",
          value: data.companyKPIs.totalKnocks,
          icon: IconTrending,
          tint: "from-sky-100 to-sky-50",
          iconColor: "text-sky-600",
        },
        {
          label: "Total Sales",
          value: data.companyKPIs.totalSales,
          icon: IconTarget,
          tint: "from-emerald-100 to-emerald-50",
          iconColor: "text-emerald-600",
        },
        {
          label: "Conversion Rate",
          value: `${data.companyKPIs.conversionRate.toFixed(1)}%`,
          icon: IconTrending,
          tint: "from-amber-100 to-amber-50",
          iconColor: "text-amber-600",
        },
        {
          label: "Active Reps Yesterday",
          value: data.companyKPIs.activeReps,
          icon: IconUsers,
          tint: "from-rose-100 to-rose-50",
          iconColor: "text-rose-600",
        },
      ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.label}
            className="glass-panel p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_26px_54px_rgba(9,20,35,0.12)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className={`rounded-[22px] bg-gradient-to-br ${card.tint} p-3 shadow-sm`}
              >
                <Icon className={`h-6 w-6 ${card.iconColor}`} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                KPI
              </span>
            </div>

            <p className="mt-6 text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-slate-950">{card.value}</p>
          </article>
        );
      })}
    </div>
  );
}
