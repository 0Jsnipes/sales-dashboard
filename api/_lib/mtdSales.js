function parseWeekISO(weekISO) {
  const date = new Date(`${weekISO}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addUtcDays(date, amount) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function toDayKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function repKeyFromData(data = {}) {
  const salesId = String(data.salesId || data.sid || "").trim().toLowerCase();
  if (salesId) return `salesId:${salesId}`;

  const name = String(data.name || "").trim().toLowerCase();
  if (name) return `name:${name}`;

  return "";
}

function getMonthWeekStarts(today = new Date()) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstWeekStart = new Date(firstOfMonth);
  const weekday = (firstWeekStart.getUTCDay() + 6) % 7;
  firstWeekStart.setUTCDate(firstWeekStart.getUTCDate() - weekday);

  const starts = [];
  for (let current = new Date(firstWeekStart); current <= today; current = addUtcDays(current, 7)) {
    starts.push(toDayKey(current));
  }
  return starts;
}

export async function fetchRosterRows(db) {
  const snap = await db.collection("roster").get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

export async function fetchMtdSalesByRep(db, today = new Date()) {
  const currentMonth = today.getUTCMonth();
  const todayKey = toDayKey(today);
  const salesByRep = new Map();
  const weekStarts = getMonthWeekStarts(today);

  await Promise.all(
    weekStarts.map(async (weekISO) => {
      const weekStart = parseWeekISO(weekISO);
      if (!weekStart) return;

      const snap = await db.collection("weeks").doc(weekISO).collection("reps").get();
      snap.forEach((doc) => {
        const data = doc.data() || {};
        const repKey = repKeyFromData(data);
        if (!repKey) return;

        const sales = Array.isArray(data.sales) ? data.sales : [];
        let runningTotal = salesByRep.get(repKey) || 0;

        for (let index = 0; index < sales.length; index += 1) {
          const dayDate = addUtcDays(weekStart, index);
          if (dayDate.getUTCMonth() !== currentMonth) continue;
          if (toDayKey(dayDate) > todayKey) continue;

          const value = Number(sales[index]);
          if (Number.isFinite(value) && value > 0) {
            runningTotal += value;
          }
        }

        salesByRep.set(repKey, runningTotal);
      });
    })
  );

  return Object.fromEntries(salesByRep);
}

export function attachMtdSalesToRoster(rosterRows, salesByRep) {
  return rosterRows.map((row) => {
    const salesId = String(row.salesId || row.sid || "").trim().toLowerCase();
    const name = String(row.name || "").trim().toLowerCase();
    const salesKey = salesId ? `salesId:${salesId}` : name ? `name:${name}` : "";

    return {
      ...row,
      mtdSales: salesKey ? salesByRep[salesKey] || 0 : 0,
    };
  });
}
