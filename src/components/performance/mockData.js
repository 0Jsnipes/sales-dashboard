export function generateMockData() {
  const repNames = [
    "Sarah Johnson",
    "Mike Chen",
    "Emily Rodriguez",
    "David Park",
    "Jessica Williams",
    "Ryan Thompson"
  ];

  const reps = repNames.map((name, idx) => {
    const knocks = Math.floor(Math.random() * 150) + 100;
    const sales = Math.floor(Math.random() * 40) + 20;

    return {
      id: `rep-${idx + 1}`,
      name,
      knocks,
      sales,
      daysActive: Math.floor(Math.random() * 10) + 20
    };
  });

  const dailyData = [];
  const today = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const repsData = {};

    reps.forEach((rep) => {
      const dailyKnocks = Math.floor(Math.random() * 20) + 5;
      const dailySales = Math.floor(Math.random() * 5);

      repsData[rep.id] = {
        knocks: dailyKnocks,
        sales: dailySales
      };
    });

    dailyData.push({ date: dateStr, reps: repsData });
  }

  const totalKnocks = reps.reduce((sum, rep) => sum + rep.knocks, 0);
  const totalSales = reps.reduce((sum, rep) => sum + rep.sales, 0);

  const todayData = dailyData[dailyData.length - 1];
  const activeReps = Object.values(todayData.reps).filter((rep) => rep.knocks > 0)
    .length;

  return {
    reps,
    dailyData,
    companyKPIs: {
      totalKnocks,
      totalSales,
      conversionRate: (totalSales / totalKnocks) * 100,
      avgDaysActive: reps.reduce((sum, rep) => sum + rep.daysActive, 0) / reps.length,
      activeReps
    }
  };
}
