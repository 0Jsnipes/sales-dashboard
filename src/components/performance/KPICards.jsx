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

function IconClipboard({ className }) {
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
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M8 12h8" />
      <path d="M8 16h6" />
    </svg>
  );
}

function IconBolt({ className }) {
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
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}

export default function KPICards({ data, selectedRep }) {
  const rep = selectedRep ? data.reps.find((item) => item.id === selectedRep) : null;
  const metrics = rep || data.companyKPIs;

  const cards = [
    {
      label: "Total Sales",
      value: metrics.totalSales || 0,
      icon: IconTarget,
      tint: "from-emerald-100 to-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      label: "ATT Sales",
      value: metrics.attSales || 0,
      icon: IconTrending,
      tint: "from-sky-100 to-sky-50",
      iconColor: "text-sky-600",
    },
    {
      label: "T-Fiber Sales",
      value: metrics.tFiberSales || 0,
      icon: IconTrending,
      tint: "from-violet-100 to-violet-50",
      iconColor: "text-violet-600",
    },
    {
      label: "Total Knocks",
      value: metrics.totalKnocks || 0,
      icon: IconBolt,
      tint: "from-amber-100 to-amber-50",
      iconColor: "text-amber-600",
    },
    {
      label: "Conversion Rate",
      value: `${Number(metrics.conversionRate || 0).toFixed(1)}%`,
      icon: IconTrending,
      tint: "from-rose-100 to-rose-50",
      iconColor: "text-rose-600",
    },
    {
      label: rep ? "Orders" : "Active Reps",
      value: rep ? rep.orderCount || 0 : data.companyKPIs.activeReps || 0,
      icon: rep ? IconClipboard : IconUsers,
      tint: "from-slate-100 to-slate-50",
      iconColor: "text-slate-700",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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
            <p className="mt-2 font-display text-3xl font-bold text-slate-950">
              {card.value}
            </p>
          </article>
        );
      })}
    </div>
  );
}
