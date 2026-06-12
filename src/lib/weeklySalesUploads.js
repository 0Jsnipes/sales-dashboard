export function parseLocalISO(iso) {
  const [y, m, d] = String(iso || "")
    .split("-")
    .map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toDateId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeSalesRepKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s*-\s*ab\s*marketing\s*/gi, "")
    .replace(/\s*-\s*a\s*b\s*marketing\s*/gi, "")
    .replace(/\bab\s*marketing\b/gi, "")
    .replace(/\ba\s*b\s*marketing\b/gi, "")
    .replace(/\b(sr|jr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSalesUploadOrder(groupId, docSnap) {
  const data = docSnap.data();
  const rawData = data.rawData || {};

  if (groupId === "att sales") {
    return {
      id: `att:${docSnap.id}`,
      provider: "ATT",
      repName:
        data.repName ||
        data.salespersonName ||
        rawData.SalespersonName ||
        data.data?.repName ||
        data.data?.salespersonName ||
        "",
      orderDateId: data.orderDateId || "",
      saleCount: Number(data.saleCount || 0),
    };
  }

  return {
    id: `tfiber:${docSnap.id}`,
    provider: "T-Fiber",
    repName:
      data.repName ||
      rawData.dealername ||
      data.data?.repName ||
      data.data?.dealername ||
      "",
    orderDateId: data.orderDateId || "",
    saleCount: 1,
  };
}

export function buildWeeklySalesRows(baseRows, salesOrders, weekISO) {
  const weekStart = parseLocalISO(weekISO);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekEndId = toDateId(weekEnd);

  const rowsByRep = new Map(
    (baseRows || []).map((row) => [
      normalizeSalesRepKey(row.name),
      {
        ...row,
        sales: Array(7).fill(0),
      },
    ])
  );

  (salesOrders || []).forEach((order) => {
    if (!order.orderDateId || order.orderDateId < weekISO || order.orderDateId > weekEndId) {
      return;
    }

    const repKey = normalizeSalesRepKey(order.repName);
    const row = rowsByRep.get(repKey);
    if (!row) return;

    const orderDate = parseLocalISO(order.orderDateId);
    const dayIndex = Math.max(
      0,
      Math.min(
        6,
        Math.floor((orderDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
      )
    );

    row.sales[dayIndex] += Number(order.saleCount || 0);
  });

  return (baseRows || []).map(
    (row) => rowsByRep.get(normalizeSalesRepKey(row.name)) || { ...row, sales: Array(7).fill(0) }
  );
}
