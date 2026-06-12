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
const CONTROL_RANGE_PRESETS = ["currentWeek", "mtd", "ytd", "7d", "30d", "90d", "custom"];
const TRACKER_RANGES = ["currentWeek", "mtd", "ytd", "7d", "30d", "90d"];
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
const createMonthToDateWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    startDate: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-01`,
    endDate: todayDateId(),
  };
};
const createYearToDateWindow = () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    startDate: `${current.getFullYear()}-01-01`,
    endDate: todayDateId(),
  };
};
const createDateWindowFromPreset = (preset) => {
  if (preset === "currentWeek") return createCurrentWeekWindow();
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
  if (matches(createMonthToDateWindow())) return "mtd";
  if (matches(createYearToDateWindow())) return "ytd";
  if (matches(createRelativeDateWindow(7))) return "7d";
  if (matches(createRelativeDateWindow(30))) return "30d";
  if (matches(createRelativeDateWindow(90))) return "90d";
  return "custom";
};
const buildTrackerRange = (range) => {
  const window = createDateWindowFromPreset(range);
  const endExclusive = new Date(`${window.endDate}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return {
    startId: window.startDate,
    endId: `${endExclusive.getFullYear()}-${String(endExclusive.getMonth() + 1).padStart(2, "0")}-${String(
      endExclusive.getDate()
    ).padStart(2, "0")}`,
  };
};

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
const formatRangePresetLabel = (preset) =>
  preset === "currentWeek"
    ? "Current Week"
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

export default function PerformanceDashboard() {
  const authState = useAuthRole();
  const scope = buildAccessScope(authState);
  const isPrimarySuperAdmin = authState.actualIsPrimarySuperAdmin;
  const canSeeAdminReview = authState.isManager || authState.isAdminRole || authState.isSuperAdmin;
  const canExportTrackerOrders = authState.isAdminRole || authState.isSuperAdmin;
  const canManageAssignments = isPrimarySuperAdmin && !authState.isPreviewing;
  const [managerFilter, setManagerFilter] = useState(scope.managerFilter || "");
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
  const [trackerRange, setTrackerRange] = useState("90d");
  const [managerOptions, setManagerOptions] = useState([]);

  const effectiveScope = useMemo(
    () => ({
      ...scope,
      managerFilter: scope.lockManagerFilter ? scope.managerFilter || "" : managerFilter,
    }),
    [managerFilter, scope]
  );

  const { data, loading, error } = usePerformanceData(dateRange, effectiveScope);
  const dashboardData = data || emptyData;

  useEffect(() => {
    window.localStorage.setItem(DATE_RANGE_STORAGE_KEY, JSON.stringify(dateRange));
  }, [dateRange]);

  useEffect(() => {
    setManagerFilter(scope.managerFilter || "");
  }, [scope.managerFilter]);

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
    if (scope.hideFilters) return undefined;

    const unsubscribe = onSnapshot(collection(db, "roster"), (snapshot) => {
      const options = Array.from(
        new Set(
          snapshot.docs
            .map((docRef) => String(docRef.data()?.manager || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

      setManagerOptions(options);
    });

    return () => unsubscribe();
  }, [scope.hideFilters]);

  useEffect(() => {
    if (!effectiveScope.repNameFilter || dashboardData.reps.length === 0) return;
    const matchingRep = dashboardData.reps.find(
      (rep) =>
        (rep.name || "").trim().toLowerCase() ===
        effectiveScope.repNameFilter.trim().toLowerCase()
    );
    if (matchingRep && selectedRep !== matchingRep.id) {
      setSelectedRep(matchingRep.id);
      setSelectedRepSnapshot({ id: matchingRep.id, name: matchingRep.name });
    }
  }, [dashboardData.reps, effectiveScope.repNameFilter, selectedRep]);

  useEffect(() => {
    if (!selectedRep) return;
    const stillVisible = dashboardData.reps.some((rep) => rep.id === selectedRep);
    if (!stillVisible) {
      setSelectedRep(null);
      setSelectedRepSnapshot(null);
    }
  }, [dashboardData.reps, selectedRep]);

  const handleSelectRep = (repId) => {
    setSelectedRep(repId || null);
    if (!repId) {
      setSelectedRepSnapshot(null);
      return;
    }

    const rep = dashboardData.reps.find((item) => item.id === repId);
    setSelectedRepSnapshot(rep ? { id: rep.id, name: rep.name } : selectedRepSnapshot);
  };

  const handleManagerFilterChange = (value) => {
    setManagerFilter(value);
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
    ? dashboardData.reps.find((rep) => rep.id === selectedRep)
    : null;
  const selectedRepLabel = selectedRepData?.name || selectedRepSnapshot?.name || "";
  const activeMetrics = selectedRep
    ? selectedRepData || { ...emptyMetrics, id: selectedRep, name: selectedRepLabel }
    : dashboardData.companyKPIs;
  const visibleOrders = useMemo(
    () => (selectedRep ? selectedRepData?.orders || [] : dashboardData.orders || []),
    [dashboardData.orders, selectedRep, selectedRepData]
  );
  const trackerSourceOrders = useMemo(
    () =>
      selectedRep
        ? selectedRepData?.allTimeOrders || []
        : dashboardData.scopedOrdersAllTime || [],
    [dashboardData.scopedOrdersAllTime, selectedRep, selectedRepData]
  );
  const trackerMetrics = useMemo(() => {
    const range = buildTrackerRange(trackerRange);
    const filtered = trackerSourceOrders.filter(
      (order) =>
        !range.startId ||
        (order.orderDateId && order.orderDateId >= range.startId && order.orderDateId < range.endId)
    );
    return buildInstallTrackerMetrics(filtered);
  }, [trackerRange, trackerSourceOrders]);
  const pendingOrders = useMemo(() => {
    const todayId = todayDateId();
    const range = buildTrackerRange(trackerRange);
    return trackerSourceOrders
      .filter(
        (order) =>
          !range.startId ||
          (order.orderDateId && order.orderDateId >= range.startId && order.orderDateId < range.endId)
      )
      .filter(
        (order) =>
          order.classifications?.pending &&
          (!order.dueDateId || order.dueDateId >= todayId)
      )
      .sort((a, b) => (a.dueDateId || "9999-12-31").localeCompare(b.dueDateId || "9999-12-31"));
  }, [trackerRange, trackerSourceOrders]);
  const pastDueOrders = useMemo(() => {
    const todayId = todayDateId();
    const range = buildTrackerRange(trackerRange);
    return trackerSourceOrders
      .filter(
        (order) =>
          !range.startId ||
          (order.orderDateId && order.orderDateId >= range.startId && order.orderDateId < range.endId)
      )
      .filter(
        (order) =>
          order.classifications?.pending &&
          order.dueDateId &&
          order.dueDateId < todayId
      )
      .sort((a, b) => (a.dueDateId || "").localeCompare(b.dueDateId || ""));
  }, [trackerRange, trackerSourceOrders]);
  const nextSevenDayPendingMetrics = useMemo(() => {
    const todayId = todayDateId();
    const nextWeekId = shiftDateId(7);
    const nextSevenDayOrders = trackerSourceOrders.filter(
      (order) =>
        order.classifications?.pending &&
        order.dueDateId &&
        order.dueDateId >= todayId &&
        order.dueDateId <= nextWeekId
    );

    return {
      count: nextSevenDayOrders.length,
      nextDueDateId:
        nextSevenDayOrders
          .map((order) => order.dueDateId)
          .sort((a, b) => a.localeCompare(b))[0] || "",
    };
  }, [trackerSourceOrders]);

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
          { label: "Reps", value: dashboardData.reps.length || 0 },
          { label: "Scope", value: selectedRep ? selectedRepLabel || "Selected rep" : "All reps" },
          { label: "Sales", value: dashboardData.companyKPIs.totalSales || 0 },
        ]}
      />

      <section className="toolbar-card">
        <SectionIntro
          title="Controls"
          description="Filter by manager, rep, and custom date range."
        />

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                    Rep Scope
                  </span>
                  <RepSelector
                    reps={dashboardData.reps}
                    selectedRep={selectedRep}
                    onSelectRep={handleSelectRep}
                    selectedRepFallback={selectedRepSnapshot}
                  />
                </label>
              </>
            ) : null}

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

      <KPICards data={dashboardData} selectedRep={selectedRep} />

      <StatusGauges metrics={activeMetrics} />

      <InstallStatusChart metrics={activeMetrics} />

      <InstallTracker
        metrics={trackerMetrics}
        upcomingPendingMetrics={nextSevenDayPendingMetrics}
        allTimeMetrics={{
          pastDue: activeMetrics.allTimePastDueInstalls || 0,
          oldestPastDueDateId: activeMetrics.allTimeOldestPastDueDateId || "",
        }}
        range={trackerRange}
        onRangeChange={setTrackerRange}
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
          orders={dashboardData.orders}
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
        description="Install status for the current selection."
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
  allTimeMetrics,
  range,
  onRangeChange,
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
        description="Pending, installed, and past-due installs."
      />

      <div className="mt-6">
        <div className="mb-5 flex justify-end">
          <select
            value={range}
            onChange={(event) => onRangeChange(event.target.value)}
            className="select select-bordered select-sm w-36"
          >
            {TRACKER_RANGES.map((option) => (
              <option key={option} value={option}>
                {formatRangePresetLabel(option)}
              </option>
            ))}
          </select>
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
              All-Time Past Due
            </div>
            <div className="mt-2 font-display text-4xl font-bold text-rose-600">
              {allTimeMetrics.pastDue || 0}
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-600">
              Oldest due:{" "}
              {allTimeMetrics.pastDue
                ? formatDateLabel(allTimeMetrics.oldestPastDueDateId)
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
  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;

    return orders.filter((order) => {
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
    });
  }, [orders, search]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

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
                  <th>UID</th>
                  <th>Due Date</th>
                  <th>Sale Date</th>
                  <th>Customer</th>
                  <th>Rep</th>
                  <th>Provider</th>
                  <th>Status</th>
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
    saleDate: "",
    status: "",
  });
  const saleDateOptions = useMemo(
    () =>
      Array.from(new Set(orders.map((order) => order.orderDateId).filter(Boolean))).sort((a, b) =>
        b.localeCompare(a)
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
          matchesExactFilterValue(order.orderDateId, filters.saleDate) &&
          matchesExactFilterValue(order.status, filters.status)
        );
      })
      .sort((a, b) => (b.orderDateId || "").localeCompare(a.orderDateId || ""));
  }, [filters, orders, search]);

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

          <div className="data-table-shell">
            <div className="data-table-scroll">
              <table className="table table-sm w-full">
                <thead className="bg-slate-100/90 text-slate-700">
                  <tr>
                    <th>UID</th>
                    <th>Sale Date</th>
                    <th>Customer</th>
                    <th>Salesperson</th>
                    <th>Provider</th>
                    <th>Status</th>
                  </tr>
                  <tr>
                    <th />
                    <th>
                      <ColumnDropdown
                        value={filters.saleDate}
                        options={saleDateOptions}
                        onChange={(value) =>
                          setFilters((current) => ({ ...current, saleDate: value }))
                        }
                      />
                    </th>
                    <th />
                    <th />
                    <th />
                    <th>
                      <ColumnDropdown
                        value={filters.status}
                        options={statusOptions}
                        onChange={(value) =>
                          setFilters((current) => ({ ...current, status: value }))
                        }
                      />
                    </th>
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
