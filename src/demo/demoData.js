const DEMO_REPS = [
  {
    id: "rep-1",
    name: "Sarah Johnson",
    team: "Phoenix",
    manager: "Ava Grant",
    salesGoal: 42,
    knocksGoal: 260,
    salesId: "SJ01"
  },
  {
    id: "rep-2",
    name: "Mike Chen",
    team: "Phoenix",
    manager: "Ava Grant",
    salesGoal: 38,
    knocksGoal: 240,
    salesId: "MC02"
  },
  {
    id: "rep-3",
    name: "Emily Rodriguez",
    team: "Denver",
    manager: "Jordan Lee",
    salesGoal: 46,
    knocksGoal: 280,
    salesId: "ER03"
  },
  {
    id: "rep-4",
    name: "David Park",
    team: "Denver",
    manager: "Jordan Lee",
    salesGoal: 34,
    knocksGoal: 220,
    salesId: "DP04"
  },
  {
    id: "rep-5",
    name: "Jessica Williams",
    team: "Austin",
    manager: "Kai Morgan",
    salesGoal: 40,
    knocksGoal: 250,
    salesId: "JW05"
  },
  {
    id: "rep-6",
    name: "Ryan Thompson",
    team: "Austin",
    manager: "Kai Morgan",
    salesGoal: 36,
    knocksGoal: 230,
    salesId: "RT06"
  }
];

const DAY_WEIGHTS = [0.9, 1.05, 1.1, 1.0, 0.95, 0.75, 0.65];

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clampNum = (v) =>
  Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0;

const buildDateRange = (days) => {
  const dates = [];
  const now = new Date();
  const todayUTC = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(todayUTC);
    d.setUTCDate(todayUTC.getUTCDate() - i);
    dates.push(d);
  }
  return dates;
};

export function getDemoWeekRows(weekISO) {
  const baseSeed = hashString(weekISO || "demo-week");
  return DEMO_REPS.map((rep, idx) => {
    const rand = mulberry32(baseSeed + idx * 97);
    const baseSales = 3.5 + idx * 0.35;
    const baseKnocks = 32 + idx * 5;
    const sales = DAY_WEIGHTS.map((weight) =>
      clampNum(baseSales * weight + rand() * 2.2)
    );
    const knocks = DAY_WEIGHTS.map((weight) =>
      clampNum(baseKnocks * weight + rand() * 12)
    );

    return {
      ...rep,
      sales,
      knocks
    };
  });
}

export function getDemoDailyData(days) {
  const dates = buildDateRange(days);
  return dates.map((date, index) => {
    const dateISO = date.toISOString().slice(0, 10);
    const reps = {};

    DEMO_REPS.forEach((rep, repIdx) => {
      const seed = hashString(`${dateISO}:${rep.id}`);
      const rand = mulberry32(seed);
      const baseKnocks = 22 + repIdx * 6;
      const baseSales = 1 + repIdx * 0.35;
      const volatility = 0.6 + (index % 7) * 0.06;
      const knocks = clampNum(baseKnocks * volatility + rand() * 18);
      const sales = clampNum(baseSales * volatility + rand() * 3);
      reps[rep.id] = { knocks, sales };
    });

    return { date: dateISO, reps };
  });
}

export function getDemoPerformanceData(dateRange) {
  const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
  const dailyData = getDemoDailyData(days);

  const repsMap = new Map();
  let totalKnocks = 0;
  let totalSales = 0;

  dailyData.forEach((day) => {
    Object.entries(day.reps).forEach(([repId, metrics]) => {
      const repBase = DEMO_REPS.find((rep) => rep.id === repId);
      if (!repBase) return;
      const existing =
        repsMap.get(repId) ||
        {
          id: repId,
          name: repBase.name,
          knocks: 0,
          sales: 0,
          _activeDays: new Set()
        };

      existing.knocks += metrics.knocks || 0;
      existing.sales += metrics.sales || 0;
      if (metrics.knocks > 0 || metrics.sales > 0) {
        existing._activeDays.add(day.date);
      }

      repsMap.set(repId, existing);
    });
  });

  const reps = Array.from(repsMap.values())
    .map((rep) => {
      totalKnocks += rep.knocks;
      totalSales += rep.sales;
      return {
        id: rep.id,
        name: rep.name,
        knocks: rep.knocks,
        sales: rep.sales,
        daysActive: rep._activeDays.size
      };
    })
    .sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base"
      })
    );

  const lastDay = dailyData[dailyData.length - 1];
  const activeReps = lastDay
    ? Object.values(lastDay.reps).filter(
        (r) => (r?.knocks || 0) > 0 || (r?.sales || 0) > 0
      ).length
    : 0;
  const avgDaysActive = reps.length
    ? reps.reduce((sum, rep) => sum + rep.daysActive, 0) / reps.length
    : 0;
  const conversionRate = totalKnocks > 0 ? (totalSales / totalKnocks) * 100 : 0;

  return {
    reps,
    dailyData,
    companyKPIs: {
      totalKnocks,
      totalSales,
      conversionRate,
      avgDaysActive,
      activeReps
    }
  };
}
