import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KPICards from "./KPICards.jsx";
import RepSelector from "./RepSelector.jsx";
import { usePerformanceData } from "./usePerformanceData.js";
import { LoadingPanel, PageHero, SectionIntro } from "../PageLayout.jsx";
import Modal from "../Modal.jsx";
import { useAuthRole } from "../../hooks/useAuth.js";
import { buildAccessScope } from "../../lib/accessScope.js";
import { db } from "../../lib/firebase.js";

const emptyMetrics = {
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
  activeReps: 0,
  nextPendingDueDateId: "",
  oldestPastDueDateId: "",
  allTimePendingInstalls: 0,
  allTimePastDueInstalls: 0,
  allTimeNextPendingDueDateId: "",
  allTimeOldestPastDueDateId: "",
};

const emptyData = {
  orders: [],
  reps: [],
  companyKPIs: emptyMetrics,
};

const formatPct = (value) => `${Number(value || 0).toFixed(1)}%`;
const PROVIDER_FILTERS = ["both", "ATT", "T-Fiber"];
const CONTROL_RANGE_PRESETS = ["currentWeek", "lastWeek", "mtd", "ytd", "7d", "30d", "90d", "custom"];
const formatDateLabel = (value) => {
  if (!value) return "No due date";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
const todayDateId = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const shiftDateId = (days) => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  current.setDate(current.getDate() + days);
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const toDateId = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const createRelativeDateWindow = (days) => ({
  startDate: shiftDateId(-(days - 1)),
  endDate: todayDateId(),
});
const createCurrentWeekWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (current.getDay() + 6) % 7;
  current.setDate(current.getDate() - day);
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const date = String(current.getDate()).padStart(2, "0");
  return {
    startDate: `${year}-${month}-${date}`,
    endDate: todayDateId(),
  };
};
const createLastWeekWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (current.getDay() + 6) % 7;
  const start = addDays(current, -day - 7);
  const end = addDays(start, 6);
  return {
    startDate: toDateId(start),
    endDate: toDateId(end),
  };
};
const createWeekWindowFromStart = (startDateId) => {
  const start = new Date(`${startDateId}T00:00:00`);
  if (Number.isNaN(start.getTime())) return createLastWeekWindow();
  return {
    startDate: toDateId(start),
    endDate: toDateId(addDays(start, 6)),
  };
};
const createPreviousWeekWindow = (startDateId) => {
  const start = new Date(`${startDateId}T00:00:00`);
  if (Number.isNaN(start.getTime())) return createWeekWindowFromStart(createLastWeekWindow().startDate);
  return createWeekWindowFromStart(toDateId(addDays(start, -7)));
};
const createMonthToDateWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    startDate: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: todayDateId(),
  };
};
const createCurrentMonthWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  return {
    startDate: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: toDateId(end),
  };
};
const createMonthWindow = (monthId) => {
  const [year, month] = String(monthId || "").split("-").map(Number);
  if (!year || !month) return createCurrentMonthWindow();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: toDateId(start),
    endDate: toDateId(end),
  };
};
const shiftMonthId = (monthId, offset) => {
  const [year, month] = String(monthId || "").split("-").map(Number);
  const date = year && month ? new Date(year, month - 1 + offset, 1) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const createYearToDateWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    startDate: `${current.getFullYear()}-01-01`,
    endDate: todayDateId(),
  };
};
const createYearWindow = (yearValue) => {
  const year = Number(yearValue);
  const currentYear = new Date().getFullYear();
  const safeYear = Number.isFinite(year) && year >= 1900 ? year : currentYear;
  return {
    startDate: `${safeYear}-01-01`,
    endDate: `${safeYear}-12-31`,
  };
};
const createDateWindowFromPreset = (preset) => {
  if (preset === "currentWeek") return createCurrentWeekWindow();
  if (preset === "lastWeek") return createLastWeekWindow();
  if (preset === "currentMonth") return createCurrentMonthWindow();
  if (preset === "mtd") return createMonthToDateWindow();
  if (preset === "ytd") return createYearToDateWindow();
  if (preset === "30d") return createRelativeDateWindow(30);
  if (preset === "90d") return createRelativeDateWindow(90);
  return createRelativeDateWindow(7);
};
const detectDatePreset = (range) => {
  if (!range?.startDate || !range?.endDate) return "custom";
  const matches = (candidate) =>
    candidate.startDate === range.startDate && candidate.endDate === range.endDate;

  if (matches(createCurrentWeekWindow())) return "currentWeek";
  if (matches(createLastWeekWindow())) return "lastWeek";
  if (matches(createCurrentMonthWindow())) return "currentMonth";
  if (matches(createMonthToDateWindow())) return "mtd";
  if (matches(createYearToDateWindow())) return "ytd";
  if (matches(createRelativeDateWindow(7))) return "7d";
  if (matches(createRelativeDateWindow(30))) return "30d";
  if (matches(createRelativeDateWindow(90))) return "90d";
  return "custom";
};
const buildExclusiveRange = (window) => {
  const endExclusive = new Date(`${window.endDate}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return {
    startId: window.startDate,
    endId: `${endExclusive.getFullYear()}-${String(endExclusive.getMonth() + 1).padStart(2, "0")}-${String(
      endExclusive.getDate()
    ).padStart(2, "0")}`,
  };
};
const buildTrackerRange = (range) => buildExclusiveRange(range);
const getTrackerDateId = (order) => order.dueDateId || order.orderDateId || "";
const providerMatches = (order, providerFilter) =>
  providerFilter === "both" || order.provider === providerFilter;
const normalizeLocationLabel = (value) => String(value ?? "").trim();
const locationMatches = (value, locationFilter) =>
  !locationFilter || normalizeLocationLabel(value) === normalizeLocationLabel(locationFilter);

const buildInstallTrackerMetrics = (orders) => {
  const todayId = todayDateId();
  return orders.reduce(
    (metrics, order) => {
      if (order.classifications?.active) {
        metrics.installed += 1;
      }

      if (!order.classifications?.pending) return metrics;

      if (order.dueDateId && order.dueDateId < todayId) {
        metrics.pastDue += 1;
        if (!metrics.oldestPastDueDateId || order.dueDateId < metrics.oldestPastDueDateId) {
          metrics.oldestPastDueDateId = order.dueDateId;
        }
      } else {
        metrics.pending += 1;
        if (order.dueDateId && (!metrics.nextPendingDueDateId || order.dueDateId < metrics.nextPendingDueDateId)) {
          metrics.nextPendingDueDateId = order.dueDateId;
        }
      }

      return metrics;
    },
    {
      pending: 0,
      installed: 0,
      pastDue: 0,
      nextPendingDueDateId: "",
      oldestPastDueDateId: "",
    }
  );
};
const buildProviderMetrics = (orders, totalKnocks = 0) => {
  const todayId = todayDateId();
  const metrics = {
    ...emptyMetrics,
    totalKnocks,
  };

  orders.forEach((order) => {
    metrics.totalSales += order.saleCount || 0;
    metrics.orderCount += 1;
    if (order.provider === "ATT") metrics.attSales += order.saleCount || 0;
    if (order.provider === "T-Fiber") metrics.tFiberSales += order.saleCount || 0;
    if (order.classifications?.cancelled) metrics.cancellations += 1;
    if (order.classifications?.churned) metrics.churned += 1;
    if (order.classifications?.active) metrics.installedActive += 1;

    if (order.classifications?.pending) {
      if (order.dueDateId && order.dueDateId < todayId) {
        metrics.pastDueInstalls += 1;
        if (!metrics.oldestPastDueDateId || order.dueDateId < metrics.oldestPastDueDateId) {
          metrics.oldestPastDueDateId = order.dueDateId;
        }
      } else {
        metrics.pendingInstalls += 1;
        if (order.dueDateId && (!metrics.nextPendingDueDateId || order.dueDateId < metrics.nextPendingDueDateId)) {
          metrics.nextPendingDueDateId = order.dueDateId;
        }
      }
    }
  });

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
const filterDataByProvider = (sourceData, providerFilter) => {
  if (providerFilter === "both") return sourceData;
  const orders = (sourceData.orders || []).filter((order) => providerMatches(order, providerFilter));
  const scopedOrdersAllTime = (sourceData.scopedOrdersAllTime || []).filter((order) =>
    providerMatches(order, providerFilter)
  );
  const reps = (sourceData.reps || [])
    .map((rep) => {
      const repOrders = (rep.orders || []).filter((order) => providerMatches(order, providerFilter));
      const allTimeOrders = (rep.allTimeOrders || []).filter((order) => providerMatches(order, providerFilter));
      if (!repOrders.length && !allTimeOrders.length) return null;

      const metrics = buildProviderMetrics(repOrders, rep.totalKnocks || 0);
      const allTimeMetrics = buildProviderMetrics(allTimeOrders, 0);
      return {
        ...rep,
        ...metrics,
        allTimePendingInstalls: allTimeMetrics.pendingInstalls || 0,
        allTimePastDueInstalls: allTimeMetrics.pastDueInstalls || 0,
        allTimeNextPendingDueDateId: allTimeMetrics.nextPendingDueDateId || "",
        allTimeOldestPastDueDateId: allTimeMetrics.oldestPastDueDateId || "",
        orders: repOrders,
        allTimeOrders,
      };
    })
    .filter(Boolean);
  const companyKPIs = {
    ...buildProviderMetrics(orders, sourceData.companyKPIs?.totalKnocks || 0),
    activeReps: reps.filter((rep) => rep.totalSales > 0).length,
  };
  const allTimeCompanyMetrics = buildProviderMetrics(scopedOrdersAllTime, 0);

  return {
    ...sourceData,
    orders,
    scopedOrdersAllTime,
    reps,
    companyKPIs: {
      ...companyKPIs,
      allTimePendingInstalls: allTimeCompanyMetrics.pendingInstalls || 0,
      allTimePastDueInstalls: allTimeCompanyMetrics.pastDueInstalls || 0,
      allTimeNextPendingDueDateId: allTimeCompanyMetrics.nextPendingDueDateId || "",
      allTimeOldestPastDueDateId: allTimeCompanyMetrics.oldestPastDueDateId || "",
    },
  };
};
const filterDataByLocation = (sourceData, locationFilter) => {
  if (!locationFilter) return sourceData;

  const orders = (sourceData.orders || []).filter((order) =>
    locationMatches(order.location || order.team, locationFilter)
  );
  const scopedOrdersAllTime = (sourceData.scopedOrdersAllTime || []).filter((order) =>
    locationMatches(order.location || order.team, locationFilter)
  );
  const reps = (sourceData.reps || [])
    .map((rep) => {
      if (!locationMatches(rep.location || rep.team, locationFilter)) return null;

      const repOrders = (rep.orders || []).filter((order) =>
        locationMatches(order.location || order.team, locationFilter)
      );
      const allTimeOrders = (rep.allTimeOrders || []).filter((order) =>
        locationMatches(order.location || order.team, locationFilter)
      );
      const metrics = buildProviderMetrics(repOrders, rep.totalKnocks || 0);
      const allTimeMetrics = buildProviderMetrics(allTimeOrders, 0);

      return {
        ...rep,
        ...metrics,
        allTimePendingInstalls: allTimeMetrics.pendingInstalls || 0,
        allTimePastDueInstalls: allTimeMetrics.pastDueInstalls || 0,
        allTimeNextPendingDueDateId: allTimeMetrics.nextPendingDueDateId || "",
        allTimeOldestPastDueDateId: allTimeMetrics.oldestPastDueDateId || "",
        orders: repOrders,
        allTimeOrders,
      };
    })
    .filter(Boolean);
  const totalKnocks = reps.reduce((sum, rep) => sum + (rep.totalKnocks || 0), 0);
  const companyKPIs = {
    ...buildProviderMetrics(orders, totalKnocks),
    activeReps: reps.filter((rep) => rep.totalSales > 0).length,
  };
  const allTimeCompanyMetrics = buildProviderMetrics(scopedOrdersAllTime, 0);

  return {
    ...sourceData,
    orders,
    scopedOrdersAllTime,
    reps,
    companyKPIs: {
      ...companyKPIs,
      allTimePendingInstalls: allTimeCompanyMetrics.pendingInstalls || 0,
      allTimePastDueInstalls: allTimeCompanyMetrics.pastDueInstalls || 0,
      allTimeNextPendingDueDateId: allTimeCompanyMetrics.nextPendingDueDateId || "",
      allTimeOldestPastDueDateId: allTimeCompanyMetrics.oldestPastDueDateId || "",
    },
  };
};
const selectComparisonMetrics = (sourceData, providerFilter, locationFilter, selectedRep, selectedRepName) => {
  const filteredData = filterDataByLocation(
    filterDataByProvider(sourceData || emptyData, providerFilter),
    locationFilter
  );
  if (!selectedRep) return filteredData.companyKPIs;

  const normalizedSelectedName = normalizeName(selectedRepName);
  return (
    filteredData.reps.find(
      (rep) =>
        rep.id === selectedRep ||
        (normalizedSelectedName && normalizeName(rep.name) === normalizedSelectedName)
    ) || { ...emptyMetrics, id: selectedRep, name: selectedRepName || "Selected rep" }
  );
};
const toNameTitleCase = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
const normalizeManagerLabel = (value) =>
  toNameTitleCase(value)
    .replace(/\bSub\b/g, "Sub")
    .replace(/\bCj\b/g, "CJ");
const DATE_RANGE_STORAGE_KEY = "ab-performance-date-range";
const getStoredDateRange = () => {
  if (typeof window === "undefined") return createRelativeDateWindow(7);
  const stored = window.localStorage.getItem(DATE_RANGE_STORAGE_KEY);
  if (!stored) return createRelativeDateWindow(7);
  try {
    const parsed = JSON.parse(stored);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.startDate === "string" &&
      typeof parsed.endDate === "string"
    ) {
      return {
        startDate: parsed.startDate,
        endDate: parsed.endDate,
      };
    }
  } catch {
    if (stored === "30d") return createRelativeDateWindow(30);
    if (stored === "90d") return createRelativeDateWindow(90);
  }
  return createRelativeDateWindow(7);
};
const formatDateRangeSummary = (range) =>
  range?.startDate && range?.endDate ? `${range.startDate} to ${range.endDate}` : "Custom";
const monthIdFromDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const formatRangePresetLabel = (preset) =>
  preset === "currentWeek"
    ? "Current Week"
    : preset === "lastWeek"
      ? "Last Week"
      : preset === "currentMonth"
        ? "Current Month"
        : preset === "mtd"
          ? "MTD"
          : preset === "ytd"
            ? "YTD"
            : preset === "7d"
              ? "Last 7 Days"
              : preset === "30d"
                ? "Last 30 Days"
                : preset === "90d"
                  ? "Last 90 Days"
                  : "Custom";
const getDefaultComparisonSelections = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentWeekDay = (today.getDay() + 6) % 7;
  const previousCompletedWeekStart = addDays(today, -currentWeekDay - 7);

  return {
    weekStartDate: toDateId(previousCompletedWeekStart),
    monthId: monthIdFromDate(today),
    year: String(today.getFullYear()),
  };
};
const createComparisonRanges = ({ weekStartDate, monthId, year }) => {
  const week = createWeekWindowFromStart(weekStartDate);
  const previousWeek = createPreviousWeekWindow(week.startDate);
  const month = createMonthWindow(monthId);
  const previousMonth = createMonthWindow(shiftMonthId(monthId, -1));
  const selectedYear = Number(year) || new Date().getFullYear();
  const yearWindow = createYearWindow(selectedYear);
  const previousYear = createYearWindow(selectedYear - 1);

  return {
    week: { label: "Week vs Week", current: week, previous: previousWeek },
    month: {
      label: "Month vs Month",
      current: month,
      previous: previousMonth,
    },
    year: {
      label: "Year vs Year",
      current: yearWindow,
      previous: previousYear,
    },
  };
};

export default function PerformanceDashboard() {
  const authState = useAuthRole();
  const scope = buildAccessScope(authState);
  const isPrimarySuperAdmin = authState.actualIsPrimarySuperAdmin;
  const canSeeAdminReview = authState.isManager || authState.isAdminRole || authState.isSuperAdmin;
  const canExportTrackerOrders = authState.isAdminRole || authState.isSuperAdmin;
  const canManageAssignments = isPrimarySuperAdmin && !authState.isPreviewing;
  const [managerFilter, setManagerFilter] = useState(scope.managerFilter || "");
  const [locationFilter, setLocationFilter] = useState(scope.locationFilter || "");
  const [selectedRep, setSelectedRep] = useState(null);
  const [selectedRepSnapshot, setSelectedRepSnapshot] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pastDueModalOpen, setPastDueModalOpen] = useState(false);
  const [assignmentOrder, setAssignmentOrder] = useState(null);
  const [assignmentRepId, setAssignmentRepId] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentOptions, setAssignmentOptions] = useState([]);
  const [dateRange, setDateRange] = useState(getStoredDateRange);
  const [dateRangePreset, setDateRangePreset] = useState(() => detectDatePreset(getStoredDateRange()));
  const [providerFilter, setProviderFilter] = useState("both");
  const [comparisonSelection, setComparisonSelection] = useState(getDefaultComparisonSelections);

  const effectiveScope = useMemo(
    () => ({
      ...scope,
      managerFilter: scope.lockManagerFilter ? normalizeManagerLabel(scope.managerFilter || "") : managerFilter,
    }),
    [managerFilter, scope]
  );
  const managerOptionsScope = useMemo(
    () => ({
      ...scope,
      managerFilter: scope.lockManagerFilter ? normalizeManagerLabel(scope.managerFilter || "") : "",
    }),
    [scope]
  );

  const { data, loading, error } = usePerformanceData(dateRange, effectiveScope);
  const { data: managerOptionsData } = usePerformanceData(dateRange, managerOptionsScope);
  const comparisonRanges = useMemo(
    () => createComparisonRanges(comparisonSelection),
    [comparisonSelection]
  );
  const { data: currentWeekComparisonData } = usePerformanceData(comparisonRanges.week.current, effectiveScope);
  const { data: weekComparisonData } = usePerformanceData(comparisonRanges.week.previous, effectiveScope);
  const { data: currentMonthComparisonData } = usePerformanceData(comparisonRanges.month.current, effectiveScope);
  const { data: monthComparisonData } = usePerformanceData(comparisonRanges.month.previous, effectiveScope);
  const { data: currentYearComparisonData } = usePerformanceData(comparisonRanges.year.current, effectiveScope);
  const { data: yearComparisonData } = usePerformanceData(comparisonRanges.year.previous, effectiveScope);
  const dashboardData = data || emptyData;
  const filteredDashboardData = useMemo(
    () => filterDataByLocation(filterDataByProvider(dashboardData, providerFilter), locationFilter),
    [dashboardData, locationFilter, providerFilter]
  );
  const managerOptions = useMemo(
    () => {
      const optionData = filterDataByProvider(managerOptionsData || emptyData, providerFilter);
      const optionsByKey = new Map();
      const addOption = (value) => {
        const label = normalizeManagerLabel(value);
        if (!label) return;
        const key = label.toLowerCase();
        if (!optionsByKey.has(key)) optionsByKey.set(key, label);
      };

      (optionData.orders || []).forEach((order) => addOption(order.manager));
      (optionData.reps || []).forEach((rep) => addOption(rep.manager));
      (managerOptionsData?.managerOptions || []).forEach(addOption);

      return Array.from(optionsByKey.values()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
    },
    [managerOptionsData, providerFilter]
  );
  const locationOptions = useMemo(() => {
    const optionData = filterDataByProvider(managerOptionsData || emptyData, providerFilter);
    const optionsByKey = new Map();
    const addOption = (value) => {
      const label = normalizeLocationLabel(value);
      if (!label) return;
      const key = label.toLowerCase();
      if (!optionsByKey.has(key)) optionsByKey.set(key, label);
    };

    (optionData.orders || []).forEach((order) => addOption(order.location || order.team));
    (optionData.reps || []).forEach((rep) => addOption(rep.location || rep.team));
    (managerOptionsData?.locationOptions || []).forEach(addOption);

    return Array.from(optionsByKey.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [managerOptionsData, providerFilter]);

  useEffect(() => {
    window.localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify(dateRange));
  }, [dateRange]);

  useEffect(() => {
    setManagerFilter(normalizeManagerLabel(scope.managerFilter || ""));
  }, [scope.managerFilter]);

  useEffect(() => {
    setLocationFilter(scope.locationFilter || "");
  }, [scope.locationFilter]);

  useEffect(() => {
    if (scope.lockManagerFilter || !managerFilter || !managerOptionsData) return;
    if (!managerOptions.includes(managerFilter)) {
      setManagerFilter("");
      setSelectedRep(null);
      setSelectedRepSnapshot(null);
    }
  }, [managerFilter, managerOptions, managerOptionsData, scope.lockManagerFilter]);

  useEffect(() => {
    if (scope.lockLocationFilter || !locationFilter || !managerOptionsData) return;
    if (!locationOptions.includes(locationFilter)) {
      setLocationFilter("");
      setSelectedRep(null);
      setSelectedRepSnapshot(null);
    }
  }, [locationFilter, locationOptions, managerOptionsData, scope.lockLocationFilter]);

  useEffect(() => {
    if (!isPrimarySuperAdmin) return undefined;

    const unsubscribe = onSnapshot(collection(db, "roster"), (snapshot) => {
      const options = snapshot.docs
        .map((docRef) => ({ id: docRef.id, ...docRef.data() }))
        .filter((rep) => !rep.deleted && String(rep.name || "").trim())
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          })
        );

      setAssignmentOptions(options);
    });

    return () => unsubscribe();
  }, [isPrimarySuperAdmin]);

  useEffect(() => {
    if (!effectiveScope.repNameFilter || filteredDashboardData.reps.length === 0) return;
    const matchingRep = filteredDashboardData.reps.find(
      (rep) =>
        (rep.name || "").trim().toLowerCase() ===
        effectiveScope.repNameFilter.trim().toLowerCase()
    );
    if (matchingRep && selectedRep !== matchingRep.id) {
      setSelectedRep(matchingRep.id);
      setSelectedRepSnapshot({ id: matchingRep.id, name: matchingRep.name });
    }
  }, [effectiveScope.repNameFilter, filteredDashboardData.reps, selectedRep]);

  useEffect(() => {
    if (!selectedRep) return;
    const stillVisible = filteredDashboardData.reps.some((rep) => rep.id === selectedRep);
    if (!stillVisible) {
      setSelectedRep(null);
      setSelectedRepSnapshot(null);
    }
  }, [filteredDashboardData.reps, selectedRep]);

  const handleSelectRep = (repId) => {
    setSelectedRep(repId || null);
    if (!repId) {
      setSelectedRepSnapshot(null);
      return;
    }

    const rep = filteredDashboardData.reps.find((item) => item.id === repId);
    setSelectedRepSnapshot(rep ? { id: rep.id, name: rep.name } : selectedRepSnapshot);
  };

  const handleManagerFilterChange = (value) => {
    setManagerFilter(value);
    setSelectedRep(null);
    setSelectedRepSnapshot(null);
  };
  const handleLocationFilterChange = (value) => {
    setLocationFilter(value);
    setSelectedRep(null);
    setSelectedRepSnapshot(null);
  };
  const handleDateRangeChange = (field, value) => {
    setDateRangePreset("custom");
    setDateRange((current) => {
      const next = {
        ...current,
        [field]: value,
      };
      if (next.startDate && next.endDate && next.startDate > next.endDate) {
        if (field === "startDate") {
          next.endDate = value;
        } else {
          next.startDate = value;
        }
      }
      return next;
    });
  };
  const handleDateRangePresetChange = (preset) => {
    setDateRangePreset(preset);
    if (preset === "custom") return;
    setDateRange(createDateWindowFromPreset(preset));
  };
  const selectedRepData = selectedRep
    ? filteredDashboardData.reps.find((rep) => rep.id === selectedRep)
    : null;
  const selectedRepLabel = selectedRepData?.name || selectedRepSnapshot?.name || "";
  const activeMetrics = selectedRep
    ? selectedRepData || { ...emptyMetrics, id: selectedRep, name: selectedRepLabel }
    : filteredDashboardData.companyKPIs;
  const visibleOrders = useMemo(
    () => (selectedRep ? selectedRepData?.orders || [] : filteredDashboardData.orders || []),
    [filteredDashboardData.orders, selectedRep, selectedRepData]
  );
  const trackerSourceOrders = useMemo(() => {
    const locationScopedData = filterDataByLocation(dashboardData, locationFilter);
    const sourceRep = selectedRep
      ? locationScopedData.reps.find(
          (rep) =>
            rep.id === selectedRep ||
            (selectedRepLabel && normalizeName(rep.name) === normalizeName(selectedRepLabel))
        )
      : null;
    const sourceOrders = selectedRep
      ? sourceRep?.allTimeOrders || []
      : locationScopedData.scopedOrdersAllTime || [];

    return sourceOrders.filter((order) => providerMatches(order, providerFilter));
  }, [dashboardData, locationFilter, providerFilter, selectedRep, selectedRepLabel]);
  const trackerMetrics = useMemo(() => {
    const range = buildTrackerRange(dateRange);
    const filtered = trackerSourceOrders.filter(
      (order) =>
        !range.startId ||
        (getTrackerDateId(order) && getTrackerDateId(order) >= range.startId && getTrackerDateId(order) < range.endId)
    );
    return buildInstallTrackerMetrics(filtered);
  }, [dateRange, trackerSourceOrders]);
  const installStatusMetrics = useMemo(() => {
    const total =
      (trackerMetrics.installed || 0) +
      (trackerMetrics.pending || 0) +
      (trackerMetrics.pastDue || 0);
    return {
      installedActive: trackerMetrics.installed || 0,
      pendingInstalls: trackerMetrics.pending || 0,
      pastDueInstalls: trackerMetrics.pastDue || 0,
      pendingInstallRate:
        total > 0 ? ((trackerMetrics.pending || 0) / total) * 100 : 0,
    };
  }, [trackerMetrics]);
  const pendingOrders = useMemo(() => {
    const todayId = todayDateId();
    const range = buildTrackerRange(dateRange);
    return trackerSourceOrders
      .filter(
        (order) =>
          !range.startId ||
          (getTrackerDateId(order) && getTrackerDateId(order) >= range.startId && getTrackerDateId(order) < range.endId)
      )
      .filter(
        (order) =>
          order.classifications?.pending &&
          (!order.dueDateId || order.dueDateId >= todayId)
      )
      .sort((a, b) => (a.dueDateId || "9999-12-31").localeCompare(b.dueDateId || "9999-12-31"));
  }, [dateRange, trackerSourceOrders]);
  const pastDueOrders = useMemo(() => {
    const todayId = todayDateId();
    const range = buildTrackerRange(dateRange);
    return trackerSourceOrders
      .filter(
        (order) =>
          !range.startId ||
          (getTrackerDateId(order) && getTrackerDateId(order) >= range.startId && getTrackerDateId(order) < range.endId)
      )
      .filter(
        (order) =>
          order.classifications?.pending &&
          order.dueDateId &&
          order.dueDateId < todayId
      )
      .sort((a, b) => (a.dueDateId || "").localeCompare(b.dueDateId || ""));
  }, [dateRange, trackerSourceOrders]);
  const nextSevenDayPendingMetrics = useMemo(() => {
    const todayId = todayDateId();
    const nextWeekId = shiftDateId(7);
    const range = buildTrackerRange(dateRange);
    const nextSevenDayOrders = trackerSourceOrders.filter(
      (order) =>
        order.classifications?.pending &&
        order.dueDateId &&
        order.dueDateId >= todayId &&
        order.dueDateId <= nextWeekId &&
        (!range.startId || (order.dueDateId >= range.startId && order.dueDateId < range.endId))
    );

    return {
      count: nextSevenDayOrders.length,
      nextDueDateId:
        nextSevenDayOrders
          .map((order) => order.dueDateId)
          .sort((a, b) => a.localeCompare(b))[0] || "",
    };
  }, [dateRange, trackerSourceOrders]);

  const openAssignmentModal = (order) => {
    if (!canManageAssignments) return;
    setAssignmentOrder(order);
    const matchingRep = assignmentOptions.find(
      (rep) => normalizeName(rep.name) === normalizeName(order.repName)
    );
    setAssignmentRepId(matchingRep?.id || "");
  };

  const saveAssignment = async () => {
    if (!canManageAssignments) return;
    if (!assignmentOrder || !assignmentRepId) return;

    const rep = assignmentOptions.find((item) => item.id === assignmentRepId);
    if (!rep) return;

    const groupId = assignmentOrder.provider === "ATT" ? "att sales" : "t-fiber sales";
    const docId = assignmentOrder.uid;
    const assignedTeam = rep.team || rep.manager || "";
    const patch =
      assignmentOrder.provider === "ATT"
        ? {
            repName: rep.name || "",
            manager: assignedTeam,
            salespersonName: rep.name || "",
            agentManager: assignedTeam,
            salespersonId: rep.salesId || "",
          }
        : {
            repName: rep.name || "",
            manager: assignedTeam,
            repId: rep.salesId || assignmentOrder.repId || "",
          };

    setSavingAssignment(true);
    try {
      await updateDoc(doc(db, "salesUploads", groupId, "orders", docId), {
        ...patch,
        salespersonLocked: true,
        salespersonLockedAt: serverTimestamp(),
        salespersonLockedBy: authState.user?.uid || null,
        updatedAt: serverTimestamp(),
      });
      setAssignmentOrder(null);
      setAssignmentRepId("");
    } finally {
      setSavingAssignment(false);
    }
  };

  return (
    <div className="page-stack">
      <PageHero
        title="Performance"
        description="Sales, status, and install metrics from uploaded orders."
        stats={[
          { label: "Range", value: formatDateRangeSummary(dateRange) },
          { label: "Reps", value: filteredDashboardData.reps.length || 0 },
          { label: "Scope", value: selectedRep ? selectedRepLabel || "Selected rep" : "All reps" },
          { label: "Location", value: locationFilter || "All" },
          { label: "Sales", value: filteredDashboardData.companyKPIs.totalSales || 0 },
        ]}
      />

      <section className="toolbar-card">
        <SectionIntro
          title="Controls"
          description="Filter by manager, location, rep, and custom date range."
        />

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {!scope.hideFilters ? (
              <>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Manager
                  </span>
                  <select
                    value={effectiveScope.lockManagerFilter ? effectiveScope.managerFilter || "" : managerFilter}
                    onChange={(event) => handleManagerFilterChange(event.target.value)}
                    disabled={effectiveScope.lockManagerFilter}
                    className="select select-bordered h-12 w-full"
                  >
                    <option value="">{effectiveScope.lockManagerFilter ? "Assigned team" : "All managers"}</option>
                    {managerOptions.map((manager) => (
                      <option key={manager} value={manager}>
                        {manager}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Location
                  </span>
                  <select
                    value={scope.lockLocationFilter ? scope.locationFilter || "" : locationFilter}
                    onChange={(event) => handleLocationFilterChange(event.target.value)}
                    disabled={scope.lockLocationFilter}
                    className="select select-bordered h-12 w-full"
                  >
                    <option value="">{scope.lockLocationFilter ? "Assigned location" : "All locations"}</option>
                    {locationOptions.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Rep Scope
                  </span>
                <RepSelector
                    reps={filteredDashboardData.reps}
                    selectedRep={selectedRep}
                    onSelectRep={handleSelectRep}
                    selectedRepFallback={selectedRepSnapshot}
                  />
                </label>
              </>
            ) : null}

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Provider
              </span>
              <div className="join h-12 w-full">
                {PROVIDER_FILTERS.map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className={`btn join-item h-12 flex-1 ${
                      providerFilter === provider ? "btn-primary" : "btn-outline"
                    }`}
                    onClick={() => setProviderFilter(provider)}
                  >
                    {provider === "both" ? "Both" : provider}
                  </button>
                ))}
              </div>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Date Range
              </span>
              <div className="grid gap-3">
                <select
                  value={dateRangePreset}
                  onChange={(event) => handleDateRangePresetChange(event.target.value)}
                  className="select select-bordered h-12 w-full"
                >
                  {CONTROL_RANGE_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {formatRangePresetLabel(preset)}
                    </option>
                  ))}
                </select>
                <div className="grid gap-3 md:grid-cols-2">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(event) => handleDateRangeChange("startDate", event.target.value)}
                  className="input input-bordered h-12 w-full"
                />
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(event) => handleDateRangeChange("endDate", event.target.value)}
                  className="input input-bordered h-12 w-full"
                />
                </div>
              </div>
            </label>
          </div>

          <span className="metric-chip">
            <span className="metric-chip__dot" aria-hidden="true" />
            {selectedRep ? "Rep focus enabled" : "Company overview"}
          </span>
        </div>

        {loading ? (
          <LoadingPanel
            compact
            className="mt-4"
            label="Loading performance"
            detail="Reading DB sales uploads."
          />
        ) : null}
        {error ? (
          <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
            Failed to load DB performance data. Check Firestore permissions and the console.
          </div>
        ) : null}
      </section>

      <KPICards data={filteredDashboardData} selectedRep={selectedRep} />

      <StatusGauges metrics={activeMetrics} />

      <ComparisonSection
        selection={comparisonSelection}
        onSelectionChange={setComparisonSelection}
        comparisons={[
          {
            label: comparisonRanges.week.label,
            currentLabel: formatDateRangeSummary(comparisonRanges.week.current),
            previousLabel: formatDateRangeSummary(comparisonRanges.week.previous),
            currentMetrics: selectComparisonMetrics(
              currentWeekComparisonData,
              providerFilter,
              locationFilter,
              selectedRep,
              selectedRepLabel
            ),
            previousMetrics: selectComparisonMetrics(
              weekComparisonData,
              providerFilter,
              locationFilter,
              selectedRep,
              selectedRepLabel
            ),
          },
          {
            label: comparisonRanges.month.label,
            currentLabel: formatDateRangeSummary(comparisonRanges.month.current),
            previousLabel: formatDateRangeSummary(comparisonRanges.month.previous),
            currentMetrics: selectComparisonMetrics(
              currentMonthComparisonData,
              providerFilter,
              locationFilter,
              selectedRep,
              selectedRepLabel
            ),
            previousMetrics: selectComparisonMetrics(
              monthComparisonData,
              providerFilter,
              locationFilter,
              selectedRep,
              selectedRepLabel
            ),
          },
          {
            label: comparisonRanges.year.label,
            currentLabel: formatDateRangeSummary(comparisonRanges.year.current),
            previousLabel: formatDateRangeSummary(comparisonRanges.year.previous),
            currentMetrics: selectComparisonMetrics(
              currentYearComparisonData,
              providerFilter,
              locationFilter,
              selectedRep,
              selectedRepLabel
            ),
            previousMetrics: selectComparisonMetrics(
              yearComparisonData,
              providerFilter,
              locationFilter,
              selectedRep,
              selectedRepLabel
            ),
          },
        ]}
      />

      <InstallStatusChart metrics={installStatusMetrics} />

      <InstallTracker
        metrics={trackerMetrics}
        upcomingPendingMetrics={nextSevenDayPendingMetrics}
        dateRange={dateRange}
        providerFilter={providerFilter}
        onOpenPending={() => setPendingModalOpen(true)}
        onOpenPastDue={() => setPastDueModalOpen(true)}
      />

      {selectedRep ? (
        <OrdersTable
          orders={visibleOrders}
          selectedRepName={selectedRepLabel}
          onSelectOrder={setSelectedOrder}
          canEditAssignment={canManageAssignments}
          onEditAssignment={openAssignmentModal}
        />
      ) : null}

      {canSeeAdminReview ? (
        <AllSalesBox
          orders={filteredDashboardData.orders}
          onSelectOrder={setSelectedOrder}
          onEditAssignment={openAssignmentModal}
        />
      ) : null}

      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
      <PastDueOrdersModal
        title="Pending Orders"
        tone="pending"
        canDownload={canExportTrackerOrders}
        open={pendingModalOpen}
        orders={pendingOrders}
        onClose={() => setPendingModalOpen(false)}
        onSelectOrder={(order) => {
          setSelectedOrder(order);
          setPendingModalOpen(false);
        }}
      />
      <PastDueOrdersModal
        title="Past-Due Orders"
        tone="pastDue"
        canDownload={canExportTrackerOrders}
        open={pastDueModalOpen}
        orders={pastDueOrders}
        onClose={() => setPastDueModalOpen(false)}
        onSelectOrder={(order) => {
          setSelectedOrder(order);
          setPastDueModalOpen(false);
        }}
      />
      <AssignmentModal
        order={canManageAssignments ? assignmentOrder : null}
        assignmentRepId={assignmentRepId}
        setAssignmentRepId={setAssignmentRepId}
        options={assignmentOptions}
        savingAssignment={savingAssignment}
        onClose={() => {
          setAssignmentOrder(null);
          setAssignmentRepId("");
        }}
        onSave={saveAssignment}
      />
    </div>
  );
}

function StatusGauges({ metrics }) {
  const gauges = [
    {
      label: "Cancellations",
      count: metrics.cancellations || 0,
      percent: metrics.cancellationRate || 0,
      color: "#dc2626",
      bg: "#fee2e2",
    },
    {
      label: "Churned",
      count: metrics.churned || 0,
      percent: metrics.churnRate || 0,
      color: "#b45309",
      bg: "#fef3c7",
    },
    {
      label: "Install Active",
      count: metrics.installedActive || 0,
      percent: metrics.installedActiveRate || 0,
      color: "#059669",
      bg: "#d1fae5",
    },
  ];

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        title="Status Gauges"
        description="Cancellation, churn, and active install rates."
      />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {gauges.map((gauge) => (
          <GaugeCard key={gauge.label} {...gauge} />
        ))}
      </div>
    </section>
  );
}

function ComparisonSection({ comparisons, selection, onSelectionChange }) {
  const rows = [
    { key: "totalSales", label: "Sales", format: (value) => Number(value || 0).toLocaleString() },
    { key: "conversionRate", label: "Conversion", format: formatPct },
    { key: "installedActive", label: "Active Installs", format: (value) => Number(value || 0).toLocaleString() },
  ];
  const controls = {
    "Week vs Week": {
      label: "Compare Week",
      type: "date",
      value: selection.weekStartDate,
      onChange: (value) => {
        const selected = new Date(`${value}T00:00:00`);
        if (Number.isNaN(selected.getTime())) return;
        const day = (selected.getDay() + 6) % 7;
        const weekStart = addDays(selected, -day);
        onSelectionChange((current) => ({ ...current, weekStartDate: toDateId(weekStart) }));
      },
    },
    "Month vs Month": {
      label: "Compare Month",
      type: "month",
      value: selection.monthId,
      onChange: (value) => onSelectionChange((current) => ({ ...current, monthId: value })),
    },
    "Year vs Year": {
      label: "Compare Year",
      type: "number",
      value: selection.year,
      onChange: (value) => onSelectionChange((current) => ({ ...current, year: value })),
    },
  };

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        title="Period Comparison"
        description="Week-over-week, month-over-month, and year-over-year performance."
      />

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {comparisons.map((comparison) => {
          const control = controls[comparison.label];

          return (
          <article key={comparison.label} className="rounded-[24px] border border-slate-200/70 bg-white/78 p-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">{comparison.label}</h3>
                {control ? (
                  <label className="grid gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {control.label}
                    </span>
                    <input
                      type={control.type}
                      min={control.type === "number" ? "2000" : undefined}
                      max={control.type === "number" ? "2100" : undefined}
                      value={control.value}
                      onChange={(event) => control.onChange(event.target.value)}
                      className="input input-bordered input-sm w-40"
                    />
                  </label>
                ) : null}
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {comparison.previousLabel} vs {comparison.currentLabel}
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              {rows.map((row) => {
                const current = Number(comparison.currentMetrics?.[row.key] || 0);
                const previous = Number(comparison.previousMetrics?.[row.key] || 0);
                const delta = current - previous;
                const deltaPct = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0;
                const positive = delta >= 0;

                return (
                  <div key={row.key} className="rounded-[18px] bg-slate-50 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {row.label}
                      </span>
                      <span className={`text-xs font-bold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                        {positive ? "+" : ""}
                        {formatPct(deltaPct)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div className="font-display text-2xl font-bold text-slate-950">
                        {row.format(current)}
                      </div>
                      <div className="text-right text-xs font-semibold text-slate-500">
                        Prior {row.format(previous)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}

function GaugeCard({ label, count, percent, color, bg }) {
  const clamped = Math.max(0, Math.min(100, Number(percent || 0)));
  const background = `conic-gradient(${color} ${clamped * 3.6}deg, ${bg} 0deg)`;

  return (
    <article className="rounded-[24px] border border-slate-200/70 bg-white/78 p-4">
      <div className="flex items-center gap-4">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
          style={{ background }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-sm font-bold text-slate-950">
            {formatPct(percent)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-950">{label}</div>
          <div className="mt-1 font-display text-3xl font-bold text-slate-950">
            {count}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Orders
          </div>
        </div>
      </div>
    </article>
  );
}

function InstallStatusChart({ metrics }) {
  const chartData = [
    {
      name: "Installed",
      orders: metrics.installedActive || 0,
      fill: "#059669",
    },
    {
      name: "Pending",
      orders: metrics.pendingInstalls || 0,
      fill: "#2563eb",
    },
  ];

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        title="Installed vs Pending"
        description="Install status using the Install Tracker filters."
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.26)" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#5b6a84", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#5b6a84", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                contentStyle={{
                  borderRadius: 18,
                  border: "1px solid rgba(121, 143, 171, 0.18)",
                  background: "rgba(255,255,255,0.94)",
                  boxShadow: "0 18px 34px rgba(9,20,35,0.12)",
                }}
              />
              <Bar dataKey="orders" name="Orders" radius={[10, 10, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-[24px] border border-slate-200/70 bg-white/78 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Pending Installs
          </div>
          <div className="mt-2 font-display text-4xl font-bold text-slate-950">
            {metrics.pendingInstalls || 0}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-600">
            {formatPct(metrics.pendingInstallRate)} of orders
          </div>
        </div>
      </div>
    </section>
  );
}

function InstallTracker({
  metrics,
  upcomingPendingMetrics,
  dateRange,
  providerFilter,
  onOpenPending,
  onOpenPastDue,
}) {
  const stages = [
    {
      label: "Pending",
      count: metrics.pending || 0,
      note: formatDateLabel(metrics.nextPendingDueDateId),
      color: "#2563eb",
      ring: "rgba(37,99,235,0.2)",
    },
    {
      label: "Installed",
      count: metrics.installed || 0,
      note: "Active installs",
      color: "#059669",
      ring: "rgba(5,150,105,0.2)",
    },
    {
      label: "Past Due",
      count: metrics.pastDue || 0,
      note: metrics.pastDue ? formatDateLabel(metrics.oldestPastDueDateId) : "No overdue installs",
      color: "#dc2626",
      ring: "rgba(220,38,38,0.2)",
    },
  ];

  return (
    <section className="glass-panel p-5">
      <SectionIntro
        title="Install Tracker"
        description="Pending, installed, and past-due installs using the Controls filters."
      />

      <div className="mt-6">
        <div className="mb-5 flex flex-wrap justify-end gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span className="rounded-full border border-slate-200/70 bg-white/70 px-3 py-2">
            Provider: {providerFilter === "both" ? "Both" : providerFilter}
          </span>
          <span className="rounded-full border border-slate-200/70 bg-white/70 px-3 py-2">
            Range: {formatDateRangeSummary(dateRange)}
          </span>
        </div>

        <div className="relative mx-auto max-w-4xl">
          <div className="absolute left-[8%] right-[8%] top-5 h-0.5 bg-slate-300/70" />
          <div className="grid gap-4 md:grid-cols-3">
            {stages.map((stage) => (
              <div key={stage.label} className="relative text-center">
                {stage.label === "Pending" || stage.label === "Past Due" ? (
                  <button
                    type="button"
                    className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-4 bg-white text-sm font-bold transition hover:scale-105"
                    style={{
                      borderColor: stage.color,
                      color: stage.color,
                      boxShadow: `0 0 0 10px ${stage.ring}`,
                    }}
                    onClick={stage.label === "Pending" ? onOpenPending : onOpenPastDue}
                    title={stage.label === "Pending" ? "View pending orders" : "View past-due orders"}
                  >
                    {stage.count}
                  </button>
                ) : (
                  <div
                    className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-4 bg-white text-sm font-bold"
                    style={{
                      borderColor: stage.color,
                      color: stage.color,
                      boxShadow: `0 0 0 10px ${stage.ring}`,
                    }}
                  >
                    {stage.count}
                  </div>
                )}
                <div className="mt-4 text-sm font-semibold text-slate-950">{stage.label}</div>
                <div
                  className="mt-1 text-xs font-semibold uppercase tracking-[0.14em]"
                  style={{ color: stage.color }}
                >
                  {stage.note}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-slate-200/70 bg-white/78 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pending Installs For The Next 7 Days
            </div>
            <div className="mt-2 font-display text-4xl font-bold text-slate-950">
              {upcomingPendingMetrics.count || 0}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-600">
              Next due: {formatDateLabel(upcomingPendingMetrics.nextDueDateId)}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white/78 px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Past Due In Filter
            </div>
            <div className="mt-2 font-display text-4xl font-bold text-rose-600">
              {metrics.pastDue || 0}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-600">
              Oldest due:{" "}
              {metrics.pastDue
                ? formatDateLabel(metrics.oldestPastDueDateId)
                : "No overdue installs"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PastDueOrdersModal({
  title,
  tone = "pastDue",
  canDownload = false,
  open,
  orders,
  onClose,
  onSelectOrder,
}) {
  const isPastDue = tone === "pastDue";
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "dueDateId",
    direction: isPastDue ? "asc" : "asc",
  });
  const sortableColumns = [
    { key: "uid", label: "UID" },
    { key: "dueDateId", label: "Due Date" },
    { key: "orderDateId", label: "Sale Date" },
    { key: "customerName", label: "Customer" },
    { key: "repName", label: "Rep" },
    { key: "provider", label: "Provider" },
    { key: "status", label: "Status" },
  ];
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? orders.filter((order) => {
          const haystack = [
            order.uid,
            order.dueDateId,
            order.orderDateId,
            order.customerName,
            order.repName,
            order.provider,
            order.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        })
      : orders;

    return [...searched].sort((a, b) => {
      const aValue = String(a[sortConfig.key] ?? "").trim();
      const bValue = String(b[sortConfig.key] ?? "").trim();
      const direction = sortConfig.direction === "desc" ? -1 : 1;
      return aValue.localeCompare(bValue, undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction;
    });
  }, [orders, search, sortConfig]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const toggleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const downloadCsv = () => {
    const rawHeaders = Array.from(
      new Set(
        filteredOrders.flatMap((order) => Object.keys(order.rawData || {}))
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const headers = [
      "UID",
      "Due Date",
      "Sale Date",
      "Customer",
      "Rep",
      "Provider",
      "Status",
      ...rawHeaders,
    ];
    const rows = filteredOrders.map((order) => [
      order.uid,
      order.dueDateId || "",
      order.orderDateId || "",
      order.customerName || "",
      order.repName || "",
      order.provider || "",
      order.status || "",
      ...rawHeaders.map((key) => order.rawData?.[key] ?? ""),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${tone}-orders-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-5xl">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Install Tracker
            </div>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {canDownload ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={downloadCsv}>
                Download CSV
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Search Orders
          </span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search UID, customer, rep, status..."
            className="input input-bordered w-full"
          />
        </label>

        <div className="data-table-shell">
          <div className="data-table-scroll">
            <table className="table table-sm w-full">
              <thead className="bg-slate-100/90 text-slate-700">
                <tr>
                  {sortableColumns.map((column) => (
                    <th key={column.key}>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold text-slate-700"
                        onClick={() => toggleSort(column.key)}
                      >
                        <span>{column.label}</span>
                        <span className="text-[10px] text-slate-400">
                          {sortConfig.key === column.key
                            ? sortConfig.direction === "asc"
                              ? "▲"
                              : "▼"
                            : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => (
                    <tr key={`${tone}-${order.id}`} className="hover:bg-slate-50">
                      <td className="font-mono text-xs">{order.uid}</td>
                      <td className={`font-semibold ${isPastDue ? "text-rose-600" : "text-blue-600"}`}>
                        {order.dueDateId || "No due date"}
                      </td>
                      <td>{order.orderDateId || ""}</td>
                      <td>
                        <button
                          type="button"
                          className="font-semibold text-slate-950 underline-offset-4 hover:underline"
                          onClick={() => onSelectOrder(order)}
                        >
                          {order.customerName || "Unknown customer"}
                        </button>
                      </td>
                      <td>{order.repName || ""}</td>
                      <td>{order.provider}</td>
                      <td>{order.status || "No status"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      {search.trim()
                        ? "No orders match this search."
                        : isPastDue
                          ? "No past-due orders for the current scope."
                          : "No pending orders for the current scope."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OrdersTable({
  orders,
  selectedRepName,
  onSelectOrder,
  canEditAssignment = false,
  onEditAssignment,
}) {
  return (
    <section className="glass-panel p-5">
      <SectionIntro
        title={selectedRepName ? selectedRepName : "Orders"}
        description="Orders for the selected rep."
      />

      <div className="data-table-shell mt-5">
        <div className="data-table-scroll">
          <table className="table table-sm w-full">
            <thead className="bg-slate-100/90 text-slate-700">
              <tr>
                <th>UID</th>
                <th>Sale Date</th>
                <th>Customer</th>
                <th>Rep</th>
                <th>Provider</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="font-mono text-xs">{order.uid}</td>
                    <td>{order.orderDateId || ""}</td>
                    <td>
                      <button
                        type="button"
                        className="font-semibold text-slate-950 underline-offset-4 hover:underline"
                        onClick={() => onSelectOrder(order)}
                      >
                        {order.customerName || "Unknown customer"}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{order.repName || ""}</span>
                        {canEditAssignment ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => onEditAssignment?.(order)}
                          >
                            Change
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{order.provider}</td>
                    <td>{order.status || "No status"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    No DB sales orders found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AllSalesBox({ orders, onSelectOrder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    repName: "",
    provider: "",
    status: "",
  });
  const [sortConfig, setSortConfig] = useState({ key: "orderDateId", direction: "desc" });
  const sortableColumns = [
    { key: "uid", label: "UID" },
    { key: "orderDateId", label: "Sale Date" },
    { key: "customerName", label: "Customer" },
    { key: "repName", label: "Salesperson" },
    { key: "provider", label: "Provider" },
    { key: "status", label: "Status" },
  ];
  const repOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => String(order.repName || "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [orders]
  );
  const providerOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => String(order.provider || "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [orders]
  );
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => String(order.status || "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => {
        const orderDateId = order.orderDateId || "";
        const matchesSearch =
          !search.trim() ||
          [
            order.uid,
            order.orderDateId,
            order.customerName,
            order.repName,
            order.provider,
            order.status,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.trim().toLowerCase());

        return (
          matchesSearch &&
          (!filters.startDate || (orderDateId && orderDateId >= filters.startDate)) &&
          (!filters.endDate || (orderDateId && orderDateId <= filters.endDate)) &&
          matchesExactFilterValue(order.repName, filters.repName) &&
          matchesExactFilterValue(order.provider, filters.provider) &&
          matchesExactFilterValue(order.status, filters.status)
        );
      })
      .sort((a, b) => {
        const aValue = String(a[sortConfig.key] ?? "").trim();
        const bValue = String(b[sortConfig.key] ?? "").trim();
        const direction = sortConfig.direction === "desc" ? -1 : 1;
        return (
          aValue.localeCompare(bValue, undefined, {
            numeric: true,
            sensitivity: "base",
          }) * direction
        );
      });
  }, [filters, orders, search, sortConfig]);

  const toggleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const downloadCsv = () => {
    const rawHeaders = Array.from(
      new Set(
        filteredOrders.flatMap((order) => Object.keys(order.rawData || {}))
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    const headers = [
      "UID",
      "Provider",
      "Sale Date",
      "Salesperson",
      "Status",
      ...rawHeaders,
    ];
    const rows = filteredOrders.map((order) => [
      order.uid,
      order.provider || "",
      order.orderDateId || "",
      order.repName || "",
      order.status || "",
      ...rawHeaders.map((key) => order.rawData?.[key] ?? ""),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `all-sales-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="glass-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">All Sales</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {open ? (
            <button className="btn btn-outline btn-sm" type="button" onClick={downloadCsv}>
              Download DB CSV
            </button>
          ) : null}
          <button className="btn btn-sm" type="button" onClick={() => setOpen((current) => !current)}>
            {open ? "Hide" : `Show All Sales (${orders.length})`}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-5 space-y-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="input input-bordered w-full"
            placeholder="Search UID, customer, rep, provider, or status"
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Start Date
              </span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, startDate: event.target.value }))
                }
                className="input input-bordered w-full"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                End Date
              </span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, endDate: event.target.value }))
                }
                className="input input-bordered w-full"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Salesperson
              </span>
              <ColumnDropdown
                value={filters.repName}
                options={repOptions}
                onChange={(value) => setFilters((current) => ({ ...current, repName: value }))}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Provider
              </span>
              <ColumnDropdown
                value={filters.provider}
                options={providerOptions}
                onChange={(value) => setFilters((current) => ({ ...current, provider: value }))}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Status
              </span>
              <ColumnDropdown
                value={filters.status}
                options={statusOptions}
                onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setFilters({
                  startDate: "",
                  endDate: "",
                  repName: "",
                  provider: "",
                  status: "",
                })
              }
            >
              Clear Filters
            </button>
          </div>

          <div className="data-table-shell">
            <div className="data-table-scroll">
              <table className="table table-sm w-full">
                <thead className="bg-slate-100/90 text-slate-700">
                  <tr>
                    {sortableColumns.map((column) => (
                      <th key={column.key}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold text-slate-700"
                          onClick={() => toggleSort(column.key)}
                        >
                          <span>{column.label}</span>
                          <span className="text-[10px] text-slate-400">
                            {sortConfig.key === column.key
                              ? sortConfig.direction === "asc"
                                ? "▲"
                                : "▼"
                              : "↕"}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map((order) => (
                      <tr key={`all-${order.id}`} className="hover:bg-slate-50">
                        <td className="font-mono text-xs">{order.uid}</td>
                        <td>{order.orderDateId || ""}</td>
                        <td>
                          <button
                            type="button"
                            className="font-semibold text-slate-950 underline-offset-4 hover:underline"
                            onClick={() => onSelectOrder(order)}
                          >
                            {order.customerName || "Unknown customer"}
                          </button>
                        </td>
                        <td>{order.repName || ""}</td>
                        <td>{order.provider}</td>
                        <td>{order.status || "No status"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-slate-500">
                        No sales matched the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ColumnDropdown({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="select select-bordered select-xs h-8 min-h-8 w-full"
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function OrderDetailModal({ order, onClose }) {
  const rawRows = order ? buildRawDetailRows(order) : [];

  return (
    <Modal open={!!order} onClose={onClose} maxWidth="max-w-3xl">
      {order ? (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {order.provider} Order
              </div>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                {order.customerName || "Unknown customer"}
              </h3>
              <p className="mt-1 font-mono text-xs text-slate-500">{order.uid}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailItem label="Status" value={order.status || "No status"} />
            <DetailItem label="Sale Date" value={order.orderDateId || ""} />
            <DetailItem label="Rep" value={order.repName || ""} />
            <DetailItem label="Phone" value={order.phone || "Not in file"} />
            <DetailItem label="Email" value={order.email || "Not in file"} />
            <DetailItem label="Address" value={order.address || "Not in file"} />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-950">Uploaded Fields</h4>
            <div className="mt-3 max-h-[42vh] overflow-auto rounded-2xl border border-slate-200">
              <table className="table table-sm">
                <tbody>
                  {rawRows.map(([key, value]) => (
                    <tr key={key}>
                      <td className="w-1/3 font-semibold text-slate-600">{key}</td>
                      <td className="break-all text-slate-800">{String(value ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function AssignmentModal({
  order,
  assignmentRepId,
  setAssignmentRepId,
  options,
  savingAssignment,
  onClose,
  onSave,
}) {
  return (
    <Modal open={!!order} onClose={onClose} maxWidth="max-w-lg">
      {order ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Salesperson Assignment
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                {order.customerName || order.uid}
              </h3>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Salesperson
            </span>
            <select
              className="select select-bordered w-full"
              value={assignmentRepId}
              onChange={(event) => setAssignmentRepId(event.target.value)}
            >
              <option value="">Select rep</option>
              {options.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name} {rep.team || rep.manager ? `- ${rep.team || rep.manager}` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSave}
              disabled={!assignmentRepId || savingAssignment}
            >
              {savingAssignment ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function buildRawDetailRows(order) {
  return Object.entries(order.rawData || {})
    .filter(([, value]) => String(value ?? "").trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b));
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchesExactFilterValue(value, filterValue) {
  if (!filterValue) return true;
  return String(value ?? "").trim() === filterValue.trim();
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
