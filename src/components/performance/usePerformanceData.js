import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useDemoMode } from "../../hooks/useDemoMode";
import { getDemoPerformanceData } from "../../demo/demoData.js";

const clean = (value) => String(value ?? "").trim();

const normalizeText = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
const normalizeManagerName = (value) => normalizeText(value);

const buildRelativeDateRange = (days) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));
  const endExclusive = new Date(today);
  endExclusive.setDate(today.getDate() + 1);
  return {
    startId: toDateId(start),
    endId: toDateId(endExclusive),
    days,
  };
};

const buildDatesInRange = (startId, endIdExclusive) => {
  if (!startId || !endIdExclusive) return [];
  const start = new Date(`${startId}T00:00:00`);
  const endExclusive = new Date(`${endIdExclusive}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime()) || start >= endExclusive) {
    return [];
  }
  const dates = [];
  for (let date = new Date(start); date < endExclusive; date.setDate(date.getDate() + 1)) {
    const current = new Date(date);
    dates.push(current);
  }
  return dates;
};

const normalizeDateRangeInput = (rangeInput) => {
  if (rangeInput && typeof rangeInput === "object") {
    const rawStart = clean(rangeInput.startDate);
    const rawEnd = clean(rangeInput.endDate);
    const startId = dateIdFromValue(rawStart);
    const endId = dateIdFromValue(rawEnd);

    if (startId && endId) {
      const orderedStart = startId <= endId ? startId : endId;
      const orderedEnd = startId <= endId ? endId : startId;
      const startDate = new Date(`${orderedStart}T00:00:00`);
      const endDate = new Date(`${orderedEnd}T00:00:00`);
      const endExclusive = new Date(endDate);
      endExclusive.setDate(endDate.getDate() + 1);
      const diffDays =
        Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

      return {
        startId: orderedStart,
        endId: toDateId(endExclusive),
        days: Math.max(diffDays, 1),
      };
    }
  }

  const days =
    rangeInput === "30d" ? 30 : rangeInput === "90d" ? 90 : 7;
  return buildRelativeDateRange(days);
};

const buildDateRangeLabel = (startId, endIdExclusive) => {
  if (!startId || !endIdExclusive) return "Custom";
  const endDate = new Date(`${endIdExclusive}T00:00:00`);
  endDate.setDate(endDate.getDate() - 1);
  return `${startId} to ${toDateId(endDate)}`;
};

const buildDateRange = (rangeInput) => {
  const normalized = normalizeDateRangeInput(rangeInput);
  return {
    ...normalized,
    label: buildDateRangeLabel(normalized.startId, normalized.endId),
  };
};

const buildDemoRangeInput = (normalizedRange) => {
  if (!normalizedRange) return "7d";
  if (normalizedRange.days <= 7) return "7d";
  if (normalizedRange.days <= 30) return "30d";
  if (normalizedRange.days <= 90) return "90d";
  return { days: normalizedRange.days };
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

const todayDateId = () => {
  const now = new Date();
  return toDateId(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
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
    order.rawData?.["Street Address"],
    order.rawData?.CustomerAddress,
    order.rawData?.ServiceAddress,
    order.rawData?.CustAddress,
    order.data?.address,
    order.data?.streetAddress,
    order.data?.customerAddress,
    order.data?.serviceAddress,
    order.data?.custAddress
  );

const dueDateFromOrder = (order) =>
  firstValue(
    order.dueDate,
    order.internetInstallDate,
    order.rawData?.["Est. Installation Date"],
    order.rawData?.["Track Until Date"],
    order.rawData?.Internet_InstallDate,
    order.rawData?.Video_InstallDate,
    order.rawData?.Voice_InstallDate,
    order.rawData?.HomeAutomation_InstallDate,
    order.data?.dueDate,
    order.data?.internetInstallDate
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

const hasPackageValue = (value) => {
  if (value == null) return false;
  return String(value).trim() !== "";
};

const isAttVideoOnlyWithoutInstallDate = (order) => {
  const rawData = order.rawData || {};
  const hasVideoPackage = hasPackageValue(rawData.Video_Package);
  const hasInternetPackage = hasPackageValue(rawData.Internet_Package);
  const hasWirelessPackage = hasPackageValue(rawData.Wireless_Package);
  const hasVideoInstallDate = !!dateIdFromValue(
    firstValue(order.videoInstallDate, rawData.Video_InstallDate, order.data?.videoInstallDate)
  );

  return hasVideoPackage && !hasInternetPackage && !hasWirelessPackage && !hasVideoInstallDate;
};

const normalizeAttOrder = (doc) => {
  const data = doc.data();
  const rawData = data.rawData || {};
  const orderDateId = data.orderDateId || dateIdFromValue(data.orderDate || rawData.OrderDate);
  const dueDate = dueDateFromOrder(data);
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
    location: firstValue(data.location, data.team, rawData.Location, rawData.Team, data.data?.location, data.data?.team),
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
    dueDate,
    dueDateId: dateIdFromValue(dueDate),
    rawData,
    data: data.data || {},
    classifications: {
      ...classifications,
      pending:
        classifyPending(classifications, data) &&
        !isAttVideoOnlyWithoutInstallDate(data),
    },
  };
};

const normalizeTFiberOrder = (doc) => {
  const data = doc.data();
  const rawData = data.rawData || {};
  const orderDateId = data.orderDateId || dateIdFromValue(data.orderDate || rawData["Order Date"]);
  const dueDate = dueDateFromOrder(data);
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
    location: firstValue(data.location, data.team, rawData.Location, rawData.Team, data.data?.location, data.data?.team),
    saleCount: 1,
    orderDateId,
    orderDate: data.orderDate || rawData["Order Date"] || orderDateId,
    customerName: customerNameFromOrder(data),
    phone: phoneFromOrder(data),
    email: emailFromOrder(data),
    address: addressFromOrder(data),
    status,
    dueDate,
    dueDateId: dateIdFromValue(dueDate),
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
  pastDueInstalls: 0,
  cancellationRate: 0,
  churnRate: 0,
  installedActiveRate: 0,
  pendingInstallRate: 0,
  conversionRate: 0,
  nextPendingDueDateId: "",
  oldestPastDueDateId: "",
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
  const todayId = todayDateId();
  metrics.totalSales += order.saleCount || 0;
  metrics.orderCount += 1;
  if (order.provider === "ATT") metrics.attSales += order.saleCount || 0;
  if (order.provider === "T-Fiber") metrics.tFiberSales += order.saleCount || 0;
  if (order.classifications.cancelled) metrics.cancellations += 1;
  if (order.classifications.churned) metrics.churned += 1;
  if (order.classifications.active) metrics.installedActive += 1;
  if (order.classifications.pending) {
    if (order.dueDateId && order.dueDateId < todayId) {
      metrics.pastDueInstalls += 1;
      if (!metrics.oldestPastDueDateId || order.dueDateId < metrics.oldestPastDueDateId) {
        metrics.oldestPastDueDateId = order.dueDateId;
      }
    } else {
      metrics.pendingInstalls += 1;
      if (order.dueDateId) {
        if (!metrics.nextPendingDueDateId || order.dueDateId < metrics.nextPendingDueDateId) {
          metrics.nextPendingDueDateId = order.dueDateId;
        }
      }
    }
  }
};

const buildDashboardData = (orders, knockTotalsByRep = new Map(), allTimeOrders = orders) => {
  const repsMap = new Map();
  const companyMetrics = emptyMetrics();
  const allTimeRepMetrics = new Map();
  const allTimeCompanyMetrics = emptyMetrics();

  allTimeOrders.forEach((order) => {
    applyOrderToMetrics(allTimeCompanyMetrics, order);
    const repKey = normalizeText(order.repName) || order.repId || "unassigned";
    const repMetrics = allTimeRepMetrics.get(repKey) || emptyMetrics();
    applyOrderToMetrics(repMetrics, order);
    allTimeRepMetrics.set(repKey, repMetrics);
  });

  orders.forEach((order) => {
    applyOrderToMetrics(companyMetrics, order);

    const repKey = normalizeText(order.repName) || order.repId || "unassigned";
    const existing = repsMap.get(repKey) || {
      id: repKey,
      name: order.repName || "Unassigned",
      manager: order.manager || "",
      team: order.location || order.team || "",
      location: order.location || order.team || "",
      metrics: emptyMetrics(),
      orders: [],
      allTimeOrders: [],
    };

    existing.name = order.repName || existing.name;
    existing.manager = order.manager || existing.manager;
    existing.team = order.location || order.team || existing.team || "";
    existing.location = order.location || order.team || existing.location || "";
    existing.orders.push(order);
    applyOrderToMetrics(existing.metrics, order);
    repsMap.set(repKey, existing);
  });

  allTimeOrders.forEach((order) => {
    const repKey = normalizeText(order.repName) || order.repId || "unassigned";
    const existing = repsMap.get(repKey);
    if (existing) {
      existing.allTimeOrders.push(order);
    }
  });

  const reps = Array.from(repsMap.values())
    .map((rep) => {
      const metrics = {
        ...rep.metrics,
        totalKnocks: knockTotalsByRep.get(rep.id) || 0,
      };
      const allTimeMetrics = allTimeRepMetrics.get(rep.id) || emptyMetrics();

      return {
        ...rep,
        ...finalizeMetrics(metrics),
        allTimePendingInstalls: allTimeMetrics.pendingInstalls || 0,
        allTimePastDueInstalls: allTimeMetrics.pastDueInstalls || 0,
        nextPendingDueDateId: metrics.nextPendingDueDateId || "",
        oldestPastDueDateId: metrics.oldestPastDueDateId || "",
        allTimeNextPendingDueDateId: allTimeMetrics.nextPendingDueDateId || "",
        allTimeOldestPastDueDateId: allTimeMetrics.oldestPastDueDateId || "",
        orders: rep.orders.sort((a, b) =>
          (b.orderDateId || "").localeCompare(a.orderDateId || "")
        ),
        allTimeOrders: rep.allTimeOrders.sort((a, b) =>
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
    scopedOrdersAllTime: allTimeOrders.sort((a, b) =>
      (b.orderDateId || "").localeCompare(a.orderDateId || "")
    ),
    reps,
    companyKPIs: {
      ...finalizeMetrics(companyMetrics),
      activeReps: reps.filter((rep) => rep.totalSales > 0).length,
      pastDueInstalls: companyMetrics.pastDueInstalls || 0,
      nextPendingDueDateId: companyMetrics.nextPendingDueDateId || "",
      oldestPastDueDateId: companyMetrics.oldestPastDueDateId || "",
      allTimePendingInstalls: allTimeCompanyMetrics.pendingInstalls || 0,
      allTimePastDueInstalls: allTimeCompanyMetrics.pastDueInstalls || 0,
      allTimeNextPendingDueDateId: allTimeCompanyMetrics.nextPendingDueDateId || "",
      allTimeOldestPastDueDateId: allTimeCompanyMetrics.oldestPastDueDateId || "",
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

const buildManagerOptionsFromWeeks = (weekMap) => {
  const managers = new Set();
  weekMap.forEach((reps) => {
    reps.forEach((rep) => {
      if (rep.deleted) return;
      const manager = clean(rep.manager);
      if (manager) managers.add(manager);
    });
  });
  return Array.from(managers);
};

const buildLocationOptionsFromWeeks = (weekMap) => {
  const locations = new Set();
  weekMap.forEach((reps) => {
    reps.forEach((rep) => {
      if (rep.deleted) return;
      const location = clean(rep.team || rep.location);
      if (location) locations.add(location);
    });
  });
  return Array.from(locations);
};

const addWeeklyRepMeta = (order, weekMap) => {
  const orderDateId = order.orderDateId || "";
  if (!orderDateId) return order;

  const orderDate = new Date(`${orderDateId}T00:00:00`);
  if (Number.isNaN(orderDate.getTime())) return order;

  const weekReps = weekMap.get(weekISOForDate(orderDate)) || [];
  const orderRepName = normalizeText(order.repName);
  if (!orderRepName) return order;

  const matchingRep = weekReps.find((rep) => !rep.deleted && normalizeText(rep.name) === orderRepName);
  if (!matchingRep) return order;

  const manager = clean(matchingRep.manager) || order.manager || "";
  const location = clean(matchingRep.team || matchingRep.location) || order.location || order.team || "";

  return {
    ...order,
    manager,
    location,
    team: location,
  };
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
      if (normalizeManagerName(rep.manager) !== normalizeManagerName(managerFilter)) return;
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
  const normalizedRange = useMemo(() => buildDateRange(dateRange), [dateRange]);
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (isDemo) {
      setState({
        loading: false,
        data: getDemoPerformanceData(buildDemoRangeInput(normalizedRange)),
        error: null,
      });
      return undefined;
    }

    let active = true;
    setState({ loading: true, data: null, error: null });

    const dates = buildDatesInRange(normalizedRange.startId, normalizedRange.endId);
    const range = normalizedRange;
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
      const scopedOrders = [
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
        .map((order) => addWeeklyRepMeta(order, weekMap))
        .filter((order) =>
          !scopedRepNames || scopedRepNames.has(normalizeText(order.repName))
        )
        .filter((order) => passesScope(order, { managerFilter, repNameFilter }));
      const orders = scopedOrders.filter((order) => inDateRange(order, range));
      const knockTotalsByRep = buildKnockTotalsByRep(dates, weekMap);

      setState({
        loading: false,
        data: {
          ...buildDashboardData(orders, knockTotalsByRep, scopedOrders),
          managerOptions: buildManagerOptionsFromWeeks(weekMap),
          locationOptions: buildLocationOptionsFromWeeks(weekMap),
        },
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
        repNameFilter
          ? query(
              collection(db, "weeks", weekISO, "reps"),
              where("name", "==", repNameFilter)
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
  }, [dateRange, isDemo, managerFilter, normalizedRange, repNameFilter]);

  return state;
}
