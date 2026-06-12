import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useDemoMode } from "../../hooks/useDemoMode";
import { getDemoPerformanceData } from "../../demo/demoData.js";

const rangeDays = (range) =>
  range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;

const clean = (value) => String(value ?? "").trim();

const normalizeText = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");

const buildDateRange = (days) => {
  if (days == null) {
    return {
      startId: "",
      endId: "9999-12-31",
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - days);
  return {
    startId: toDateId(start),
    endId: toDateId(today),
  };
};

const buildDatesInRange = (days) => {
  if (days == null) {
    return [];
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dates = [];

  for (let offset = days; offset >= 1; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    dates.push(date);
  }

  return dates;
};

const toDateId = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateIdFromValue = (value) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10);

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return toDateId(parsed);
};

const firstValue = (...values) => {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return "";
};

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
};

const weekISOForDate = (date) => {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return toDateId(next);
};

const dayIndexForDate = (date) => (date.getDay() + 6) % 7;

const currentWeekISO = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - day);
  return toDateId(current);
};

const statusFromOrder = (order) =>
  firstValue(
    order.accountStatus,
    order.internetCurrentStatus,
    order.rawData?.["Account Status"],
    order.rawData?.Internet_CurrentStatus,
    order.rawData?.Video_CurrentStatus,
    order.rawData?.Wireless_CurrentStatus,
    order.data?.accountStatus,
    order.data?.internetCurrentStatus
  );

const customerNameFromOrder = (order) =>
  firstValue(
    order.customerName,
    order.rawData?.CustomerName,
    order.rawData?.Customer,
    order.rawData?.Name,
    order.rawData?.CustName,
    order.rawData?.CustLastName,
    order.data?.customerName,
    order.data?.custLastName
  );

const phoneFromOrder = (order) =>
  firstValue(
    order.phone,
    order.rawData?.Phone,
    order.rawData?.CustomerPhone,
    order.rawData?.CustPhone,
    order.rawData?.PhoneNumber,
    order.data?.phone,
    order.data?.customerPhone,
    order.data?.custPhone,
    order.data?.phoneNumber
  );

const emailFromOrder = (order) =>
  firstValue(
    order.email,
    order.rawData?.Email,
    order.rawData?.CustomerEmail,
    order.rawData?.CustEmail,
    order.data?.email,
    order.data?.customerEmail,
    order.data?.custEmail
  );

const addressFromOrder = (order) =>
  firstValue(
    order.address,
    order.rawData?.Address,
    order.rawData?.CustomerAddress,
    order.rawData?.ServiceAddress,
    order.rawData?.CustAddress,
    order.data?.address,
    order.data?.customerAddress,
    order.data?.serviceAddress,
    order.data?.custAddress
  );

const classifyStatus = (order) => {
  const status = normalizeText(statusFromOrder(order));

  return {
    cancelled: status.includes("cancel"),
    churned:
      status.includes("churn") ||
      status.includes("deactiv") ||
      status.includes("terminat"),
    active:
      status.includes("active") ||
      status.includes("installed") ||
      status.includes("activated"),
  };
};

const classifyPending = (classifications, order) => {
  if (classifications.cancelled || classifications.churned || classifications.active) {
    return false;
  }

  const status = normalizeText(statusFromOrder(order));
  return (
    !status ||
    status.includes("pending") ||
    status.includes("scheduled") ||
    status.includes("install") ||
    status.includes("open") ||
    status.includes("submitted")
  );
};

const normalizeAttOrder = (doc) => {
  const data = doc.data();
  const rawData = data.rawData || {};
  const orderDateId = data.orderDateId || dateIdFromValue(data.orderDate || rawData.OrderDate);
  const status = statusFromOrder(data);
  const classifications = classifyStatus(data);

  return {
    id: `att:${doc.id}`,
    uid: data.uid || data.orderId || doc.id,
    provider: "ATT",
    repId: firstValue(data.salespersonId, rawData.SalespersonID, data.data?.salespersonId),
    repName: firstValue(
      data.repName,
      data.salespersonName,
      rawData.SalespersonName,
      data.data?.repName,
      data.data?.salespersonName,
      "Unassigned"
    ),
    manager: firstValue(
      data.manager,
      data.agentManager,
      rawData.AgentManager,
      data.data?.manager,
      data.data?.agentManager
    ),
    saleCount: Number(data.saleCount || 0),
    orderDateId,
    orderDate: data.orderDate || rawData.OrderDate || orderDateId,
    customerName: customerNameFromOrder(data),
    phone: phoneFromOrder(data),
    email: emailFromOrder(data),
    address: addressFromOrder(data),
    status,
    internetCurrentStatus: firstValue(data.internetCurrentStatus, rawData.Internet_CurrentStatus),
    internetInstallDate: firstValue(data.internetInstallDate, rawData.Internet_InstallDate),
    rawData,
    data: data.data || {},
    classifications: {
      ...classifications,
      pending: classifyPending(classifications, data),
    },
  };
};

const normalizeTFiberOrder = (doc) => {
  const data = doc.data();
  const rawData = data.rawData || {};
  const orderDateId = data.orderDateId || dateIdFromValue(data.orderDate || rawData["Order Date"]);
  const status = statusFromOrder(data);
  const classifications = classifyStatus(data);

  return {
    id: `tfiber:${doc.id}`,
    uid: data.uid || data.altOrderId || doc.id,
    provider: "T-Fiber",
    repId: firstValue(data.repId, rawData["Rep ID"], data.data?.repId),
    repName: firstValue(
      data.repName,
      rawData.dealername,
      data.data?.repName,
      data.data?.dealername,
      "Unassigned"
    ),
    manager: firstValue(data.manager, rawData.Manager, data.data?.manager),
    saleCount: 1,
    orderDateId,
    orderDate: data.orderDate || rawData["Order Date"] || orderDateId,
    customerName: customerNameFromOrder(data),
    phone: phoneFromOrder(data),
    email: emailFromOrder(data),
    address: addressFromOrder(data),
    status,
    rawData,
    data: data.data || {},
    classifications: {
      ...classifications,
      pending: classifyPending(classifications, data),
    },
  };
};

const inDateRange = (order, range) => {
  if (!range.startId) return true;
  if (!order.orderDateId) return false;
  return order.orderDateId >= range.startId && order.orderDateId < range.endId;
};

const passesScope = (order, scope = {}) => {
  if (scope.repNameFilter && normalizeText(order.repName) !== normalizeText(scope.repNameFilter)) {
    return false;
  }
  return true;
};

const emptyMetrics = () => ({
  totalKnocks: 0,
  totalSales: 0,
  orderCount: 0,
  attSales: 0,
  tFiberSales: 0,
  cancellations: 0,
  churned: 0,
  installedActive: 0,
  pendingInstalls: 0,
  cancellationRate: 0,
  churnRate: 0,
  installedActiveRate: 0,
  pendingInstallRate: 0,
  conversionRate: 0,
});

const finalizeMetrics = (metrics) => {
  const denominator = Math.max(metrics.orderCount, 1);
  return {
    ...metrics,
    cancellationRate: (metrics.cancellations / denominator) * 100,
    churnRate: (metrics.churned / denominator) * 100,
    installedActiveRate: (metrics.installedActive / denominator) * 100,
    pendingInstallRate: (metrics.pendingInstalls / denominator) * 100,
    conversionRate:
      metrics.totalKnocks > 0 ? (metrics.totalSales / metrics.totalKnocks) * 100 : 0,
  };
};

const applyOrderToMetrics = (metrics, order) => {
  metrics.totalSales += order.saleCount || 0;
  metrics.orderCount += 1;
  if (order.provider === "ATT") metrics.attSales += order.saleCount || 0;
  if (order.provider === "T-Fiber") metrics.tFiberSales += order.saleCount || 0;
  if (order.classifications.cancelled) metrics.cancellations += 1;
  if (order.classifications.churned) metrics.churned += 1;
  if (order.classifications.active) metrics.installedActive += 1;
  if (order.classifications.pending) metrics.pendingInstalls += 1;
};

const buildDashboardData = (orders, knockTotalsByRep = new Map()) => {
  const repsMap = new Map();
  const companyMetrics = emptyMetrics();

  orders.forEach((order) => {
    applyOrderToMetrics(companyMetrics, order);

    const repKey = normalizeText(order.repName) || order.repId || "unassigned";
    const existing = repsMap.get(repKey) || {
      id: repKey,
      name: order.repName || "Unassigned",
      manager: order.manager || "",
      metrics: emptyMetrics(),
      orders: [],
    };

    existing.name = order.repName || existing.name;
    existing.manager = order.manager || existing.manager;
    existing.orders.push(order);
    applyOrderToMetrics(existing.metrics, order);
    repsMap.set(repKey, existing);
  });

  const reps = Array.from(repsMap.values())
    .map((rep) => {
      const metrics = {
        ...rep.metrics,
        totalKnocks: knockTotalsByRep.get(rep.id) || 0,
      };

      return {
        ...rep,
        ...finalizeMetrics(metrics),
        orders: rep.orders.sort((a, b) =>
          (b.orderDateId || "").localeCompare(a.orderDateId || "")
        ),
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales || a.name.localeCompare(b.name));

  companyMetrics.totalKnocks = Array.from(knockTotalsByRep.values()).reduce(
    (sum, value) => sum + value,
    0
  );

  return {
    orders,
    reps,
    companyKPIs: {
      ...finalizeMetrics(companyMetrics),
      activeReps: reps.filter((rep) => rep.totalSales > 0).length,
    },
  };
};

const buildKnockTotalsByRep = (dates, weekMap) => {
  if (!dates.length) {
    return new Map();
  }

  const totals = new Map();

  dates.forEach((date) => {
    const weekISO = weekISOForDate(date);
    const dayIndex = dayIndexForDate(date);
    const reps = weekMap.get(weekISO) || [];

    reps.forEach((rep) => {
      if (rep.deleted) return;
      const repKey = normalizeText(rep.name) || rep.id || "";
      if (!repKey) return;

      const knocks = safeNumber(Array.isArray(rep.knocks) ? rep.knocks[dayIndex] : 0);
      if (!knocks) return;

      totals.set(repKey, (totals.get(repKey) || 0) + knocks);
    });
  });

  return totals;
};

const mergeOrdersByUid = (...orderSets) => {
  const merged = new Map();

  orderSets.flat().forEach((order) => {
    if (!order?.id) return;
    merged.set(order.id, order);
  });

  return Array.from(merged.values());
};

const buildScopedRepNames = (weekMap, managerFilter, repNameFilter) => {
  if (repNameFilter) {
    return new Set([normalizeText(repNameFilter)]);
  }

  if (!managerFilter) {
    return null;
  }

  const repNames = new Set();
  weekMap.forEach((reps) => {
    reps.forEach((rep) => {
      if (clean(rep.manager) !== clean(managerFilter)) return;
      const normalizedName = normalizeText(rep.name);
      if (normalizedName) repNames.add(normalizedName);
    });
  });
  return repNames;
};

export function usePerformanceData(dateRange, scope = {}) {
  const isDemo = useDemoMode();
  const managerFilter = scope.managerFilter || "";
  const repNameFilter = scope.repNameFilter || "";
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (isDemo) {
      setState({
        loading: false,
        data: getDemoPerformanceData(dateRange),
        error: null,
      });
      return undefined;
    }

    let active = true;
    setState({ loading: true, data: null, error: null });

    const dates = buildDatesInRange(rangeDays(dateRange));
    const range = buildDateRange(rangeDays(dateRange));
    const sourceOrderBuckets = {
      attAgentManager: [],
      attManager: [],
      attSalespersonName: [],
      attRepName: [],
      attAll: [],
      tfiberManager: [],
      tfiberRepName: [],
      tfiberAll: [],
    };
    const weekMap = new Map();

    const recompute = () => {
      if (!active) return;

      const scopedRepNames = buildScopedRepNames(weekMap, managerFilter, repNameFilter);

      const orders = [
        ...mergeOrdersByUid(
          sourceOrderBuckets.attAll,
          sourceOrderBuckets.attAgentManager,
          sourceOrderBuckets.attManager,
          sourceOrderBuckets.attSalespersonName,
          sourceOrderBuckets.attRepName
        ),
        ...mergeOrdersByUid(
          sourceOrderBuckets.tfiberAll,
          sourceOrderBuckets.tfiberManager,
          sourceOrderBuckets.tfiberRepName
        ),
      ]
        .filter((order) => inDateRange(order, range))
        .filter((order) =>
          !scopedRepNames || scopedRepNames.has(normalizeText(order.repName))
        )
        .filter((order) => passesScope(order, { managerFilter, repNameFilter }));
      const knockTotalsByRep = buildKnockTotalsByRep(dates, weekMap);

      setState({
        loading: false,
        data: buildDashboardData(orders, knockTotalsByRep),
        error: null,
      });
    };

    const handleError = (err) => {
      if (!active) return;
      console.error("Failed to load performance data", err);
      setState({ loading: false, data: null, error: err });
    };

    const buildOrdersQuery = (groupId, field, value) => {
      const ordersRef = collection(db, "salesUploads", groupId, "orders");
      return field && value ? query(ordersRef, where(field, "==", value)) : ordersRef;
    };

    const weekISOs = dates.length
      ? Array.from(new Set(dates.map((date) => weekISOForDate(date))))
      : managerFilter || repNameFilter
      ? [currentWeekISO()]
      : [];
    const weekUnsubs = weekISOs.map((weekISO) =>
      onSnapshot(
        managerFilter || repNameFilter
          ? query(
              collection(db, "weeks", weekISO, "reps"),
              where(repNameFilter ? "name" : "manager", "==", repNameFilter || managerFilter)
            )
          : collection(db, "weeks", weekISO, "reps"),
        (snap) => {
          weekMap.set(
            weekISO,
            snap.docs.map((weekDoc) => ({ id: weekDoc.id, ...weekDoc.data() }))
          );
          recompute();
        },
        handleError
      )
    );

    const orderQueryConfigs = repNameFilter
      ? [
          {
            key: "attSalespersonName",
            ref: buildOrdersQuery("att sales", "salespersonName", repNameFilter),
            normalize: normalizeAttOrder,
          },
          {
            key: "attRepName",
            ref: buildOrdersQuery("att sales", "repName", repNameFilter),
            normalize: normalizeAttOrder,
          },
          {
            key: "tfiberRepName",
            ref: buildOrdersQuery("t-fiber sales", "repName", repNameFilter),
            normalize: normalizeTFiberOrder,
          },
        ]
      : managerFilter
      ? [
          {
            key: "attAll",
            ref: buildOrdersQuery("att sales"),
            normalize: normalizeAttOrder,
          },
          {
            key: "tfiberAll",
            ref: buildOrdersQuery("t-fiber sales"),
            normalize: normalizeTFiberOrder,
          },
        ]
      : [
          {
            key: "attAll",
            ref: buildOrdersQuery("att sales"),
            normalize: normalizeAttOrder,
          },
          {
            key: "tfiberAll",
            ref: buildOrdersQuery("t-fiber sales"),
            normalize: normalizeTFiberOrder,
          },
        ];

    const orderUnsubs = orderQueryConfigs.map(({ key, ref, normalize }) =>
      onSnapshot(
        ref,
        (snap) => {
          sourceOrderBuckets[key] = snap.docs.map(normalize);
          recompute();
        },
        handleError
      )
    );

    return () => {
      active = false;
      weekUnsubs.forEach((unsub) => unsub());
      orderUnsubs.forEach((unsub) => unsub());
    };
  }, [dateRange, isDemo, managerFilter, repNameFilter]);

  return state;
}
