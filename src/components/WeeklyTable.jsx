import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  collection,
  collectionGroup,
  documentId,
  query,
  setDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../lib/firebase";
import { isEmailAllowed, teamManagerAllowlist } from "../lib/access.js";
import { DAYS, prevWeekISO } from "../utils/weeks.js";
import { buildWeeklySalesRows, normalizeSalesUploadOrder } from "../lib/weeklySalesUploads.js";
import AddRepsModal from "./AddRepsModal";
import EditRepsModal from "./EditRepsModal";
import Modal from "./Modal";
import { SectionIntro } from "./PageLayout.jsx";
import { useAuthRole } from "../hooks/useAuth.js";
import { useDemoMode } from "../hooks/useDemoMode";
import { getDemoWeekRows } from "../demo/demoData.js";

// Parse "YYYY-MM-DD" as LOCAL date to avoid UTC shift
function parseLocalISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const clampNum = (v) =>
  Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : 0;

const escapeCell = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function getPreviousLocalDay() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - 1);
  return now;
}

function getInactiveDayCount(rep, endIndex) {
  const sales = Array.isArray(rep.sales) ? rep.sales : Array(7).fill(0);
  const knocks = Array.isArray(rep.knocks) ? rep.knocks : Array(7).fill(0);
  let count = 0;

  for (let i = endIndex; i >= 0; i -= 1) {
    if (clampNum(sales[i]) > 0 || clampNum(knocks[i]) > 0) break;
    count += 1;
  }

  return count;
}

function getInactivityTone(daysInactive) {
  if (daysInactive >= 3) return "red";
  if (daysInactive >= 2) return "yellow";
  return "none";
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function sanitizeFilename(value) {
  return String(value || "all-managers")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "") || "all-managers";
}

function uniqueSortedValues(values) {
  const seen = new Set();
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function isAffiliateManaged(rep) {
  return (rep?.manager || "").trim().toLowerCase() === "affiliate";
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 3.5v8" />
      <path d="m6.75 8.75 3.25 3.25 3.25-3.25" />
      <path d="M4 14.5h12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 4.5v11" />
      <path d="M4.5 10h11" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 14.5v-8" />
      <path d="m6.75 8 3.25-3.25L13.25 8" />
      <path d="M4 15.5h12" />
    </svg>
  );
}

function UploadChip({
  title,
  active = false,
  className = "",
  onClick,
  onKeyDown,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`inline-flex h-9 min-w-[108px] cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2.5 text-center transition ${
        active
          ? "border-slate-900 bg-slate-900/8 shadow-sm"
          : "border-slate-300 bg-white/68 hover:border-slate-400 hover:bg-white"
      } ${className}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <UploadIcon />
      <span className="text-[11px] font-semibold tracking-[0.02em] text-slate-900">{title}</span>
    </div>
  );
}

export default function WeeklyTable({
  base = "weeks",
  weekISO,
  canEdit = false,
  canEditReps = false,
  metricKey = "sales",
  goalKey = "salesGoal",
  title = "Weekly Grid",
  teamFilter = "All",
  managerFilter = "All",
  repNameFilter = "",
  onTotalsChange,
}) {
  const { user, isSuperAdmin } = useAuthRole();
  const isDemo = useDemoMode();
  const [rawRows, setRawRows] = useState([]);
  const [salesUploadOrders, setSalesUploadOrders] = useState([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [repToEdit, setRepToEdit] = useState(null); // <-- per-rep edit
  const [highlightedRepId, setHighlightedRepId] = useState(null);
  const [inactiveModalOpen, setInactiveModalOpen] = useState(false);
  const [teamManagerOpen, setTeamManagerOpen] = useState(false);
  const [teamManagerSaving, setTeamManagerSaving] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [activeDropzone, setActiveDropzone] = useState("");
  const [mobileSalesUploadOpen, setMobileSalesUploadOpen] = useState(false);
  const [dbUploadDatesOpen, setDbUploadDatesOpen] = useState(false);
  const [dbUploadDateInput, setDbUploadDateInput] = useState("");
  const [dbUploadDateIds, setDbUploadDateIds] = useState([]);
  const [uploadedStyleOpen, setUploadedStyleOpen] = useState(false);
  const [uploadedStyleAllTime, setUploadedStyleAllTime] = useState(false);
  const [uploadedStyleDateInput, setUploadedStyleDateInput] = useState("");
  const [uploadedStyleDateIds, setUploadedStyleDateIds] = useState([]);
  const attDbFileInputRef = useRef(null);
  const tFiberDbFileInputRef = useRef(null);
  const knockFileInputRef = useRef(null);
  const rows = useMemo(
    () =>
      metricKey === "sales"
        ? buildWeeklySalesRows(rawRows, salesUploadOrders, weekISO)
        : rawRows,
    [metricKey, rawRows, salesUploadOrders, weekISO]
  );
  const showHeaderActions = canEdit || rows.length > 0;
  const canManageReps = canEdit || canEditReps;
  const canUseSalesAdminTools =
    metricKey === "sales" && isEmailAllowed(teamManagerAllowlist, user?.email);
  const repManagerOptions = useMemo(
    () => uniqueSortedValues(rows.map((row) => row.manager)),
    [rows]
  );
  const repTeamOptions = useMemo(
    () => uniqueSortedValues(rows.map((row) => row.team)),
    [rows]
  );

  // Header dates for Mon..Sun
  const headerDates = useMemo(() => {
    const start = parseLocalISO(weekISO);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(start);
      dt.setDate(start.getDate() + i);
      return dt;
    });
  }, [weekISO]);

  const fmtHeaderDate = (dt) =>
    dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // Load rows (alphabetical) with previous-week fallback (zeroed)
  useEffect(() => {
    if (isDemo) {
      const normalizeFilter = (v) => (v ?? "").trim();
      const teamFilterNorm = normalizeFilter(teamFilter);
      const managerFilterNorm = normalizeFilter(managerFilter);
      const repNameFilterNorm = normalizeFilter(repNameFilter).toLowerCase();
      const matchesFilters = (rep) =>
        (teamFilterNorm === "" ||
          teamFilterNorm === "All" ||
          normalizeFilter(rep.team) === teamFilterNorm) &&
        (managerFilterNorm === "" ||
          managerFilterNorm === "All" ||
          normalizeFilter(rep.manager) === managerFilterNorm) &&
        (repNameFilterNorm === "" ||
          normalizeFilter(rep.name).toLowerCase() === repNameFilterNorm);

      const demoRows = getDemoWeekRows(weekISO)
        .filter((row) => !row.deleted && matchesFilters(row))
        .map((row) => ({
          ...row,
          sales:
            Array.isArray(row.sales) && row.sales.length === 7
              ? row.sales
              : Array(7).fill(0),
          knocks:
            Array.isArray(row.knocks) && row.knocks.length === 7
              ? row.knocks
              : Array(7).fill(0),
          salesGoal: clampNum(row.salesGoal),
          knocksGoal: clampNum(row.knocksGoal),
          deleted: !!row.deleted,
        }))
        .sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );

      setRawRows(demoRows);
      return undefined;
    }

    let cancelled = false;

    const keyForRep = (rep) => {
      const sid = (rep.salesId || rep.sid || "").trim().toLowerCase();
      if (sid) return `sid:${sid}`;
      const name = (rep.name || "").trim().toLowerCase();
      if (name) return `name:${name}`;
      return null;
    };
    const keyForRow = (rep) => keyForRep(rep) || (rep.id ? `id:${rep.id}` : null);

    const ensureRowShape = (r) => ({
      ...r,
      sales: Array.isArray(r.sales) && r.sales.length === 7 ? r.sales : Array(7).fill(0),
      knocks: Array.isArray(r.knocks) && r.knocks.length === 7 ? r.knocks : Array(7).fill(0),
      aliases: Array.isArray(r.aliases) ? r.aliases : [],
      salesGoal: clampNum(r.salesGoal),
      knocksGoal: clampNum(r.knocksGoal),
      deleted: !!r.deleted,
    });

    const unsub = onSnapshot(
      collection(db, base, weekISO, "reps"),
      async (s) => {
        if (cancelled) return;

        const normalizeFilter = (v) => (v ?? "").trim();
        const teamFilterNorm = normalizeFilter(teamFilter);
        const managerFilterNorm = normalizeFilter(managerFilter);
        const repNameFilterNorm = normalizeFilter(repNameFilter).toLowerCase();
        const matchesFilters = (rep) =>
          (teamFilterNorm === "" ||
            teamFilterNorm === "All" ||
            normalizeFilter(rep.team) === teamFilterNorm) &&
          (managerFilterNorm === "" ||
            managerFilterNorm === "All" ||
            normalizeFilter(rep.manager) === managerFilterNorm) &&
          (repNameFilterNorm === "" ||
            normalizeFilter(rep.name).toLowerCase() === repNameFilterNorm);

        const allRows = s.docs.map((d) =>
          ensureRowShape({ id: d.id, ...d.data() })
        );

        const current = allRows.filter((r) => !r.deleted && matchesFilters(r));
        const deletedKeys = new Set(
          allRows
            .filter((r) => r.deleted)
            .map((r) => keyForRow(r))
            .filter(Boolean)
        );

        // Backfill missing reps from previous week directly into Firestore so rows are real docs
        const prevISO = prevWeekISO(weekISO);
        const prevSnap = await getDocs(collection(db, base, prevISO, "reps"));
        const existingKeys = new Set([
          ...allRows.map((r) => keyForRow(r)).filter(Boolean),
          ...deletedKeys,
        ]);

        const missingWrites = [];
        prevSnap.forEach((d) => {
          const data = ensureRowShape({ id: d.id, ...d.data() });
          const key = keyForRow(data);
          if (!key) return;
          if (data.deleted) {
            existingKeys.add(key);
            return;
          }
          if (existingKeys.has(key)) return;

          existingKeys.add(key);
          const payload = {
            name: data.name || "",
            email: data.email || "",
            manager: data.manager || "",
            team: data.team || "",
            aliases: Array.isArray(data.aliases) ? data.aliases : [],
            salesGoal: data.salesGoal,
            knocksGoal: data.knocksGoal,
            sales: Array(7).fill(0),
            knocks: Array(7).fill(0),
          };
          missingWrites.push({ id: d.id, payload });
        });

        if (missingWrites.length) {
          await Promise.all(
            missingWrites.map(({ id, payload }) =>
              setDoc(doc(db, base, weekISO, "reps", id), payload, { merge: true })
            )
          );
        }

        // Combine current docs with any just-created placeholders for immediate UI display
        const mergedMap = new Map();
        const rowScore = (row) => {
          const arr = row[metricKey] || Array(7).fill(0);
          return arr.reduce((s, v) => s + clampNum(v), 0);
        };
        const addRow = (row) => {
          const k = keyForRow(row);
          if (!k || !matchesFilters(row) || row.deleted) return;
          const existing = mergedMap.get(k);
          if (!existing || rowScore(row) > rowScore(existing)) {
            mergedMap.set(k, row);
          }
        };
        current.forEach(addRow);
        missingWrites.forEach(({ id, payload }) => addRow({ id, ...payload }));

        const merged = Array.from(mergedMap.values()).sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );

        if (!cancelled) setRawRows(merged);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [base, weekISO, teamFilter, managerFilter, repNameFilter, metricKey, isDemo]);

  useEffect(() => {
    if (isDemo || metricKey !== "sales") {
      setSalesUploadOrders([]);
      return undefined;
    }

    const unsubAtt = onSnapshot(
      collection(db, "salesUploads", ATT_DB_GROUP, "orders"),
      (snap) => {
        setSalesUploadOrders((current) => {
          const tfiber = current.filter((order) => order.provider !== "ATT");
          return [...tfiber, ...snap.docs.map((docSnap) => normalizeSalesUploadOrder(ATT_DB_GROUP, docSnap))];
        });
      }
    );

    const unsubTFiber = onSnapshot(
      collection(db, "salesUploads", T_FIBER_DB_GROUP, "orders"),
      (snap) => {
        setSalesUploadOrders((current) => {
          const att = current.filter((order) => order.provider === "ATT");
          return [...att, ...snap.docs.map((docSnap) => normalizeSalesUploadOrder(T_FIBER_DB_GROUP, docSnap))];
        });
      }
    );

    return () => {
      unsubAtt();
      unsubTFiber();
    };
  }, [isDemo, metricKey]);

  // Totals
  const colTotals = useMemo(() => {
    const dayTotals = Array(7).fill(0);
    let weekTotal = 0;
    let goalTotal = 0;
    rows.forEach((r) => {
      const arr = r[metricKey] || Array(7).fill(0);
      arr.forEach((v, i) => (dayTotals[i] += clampNum(v)));
      weekTotal += arr.reduce((a, b) => a + clampNum(b), 0);
      goalTotal += clampNum(r[goalKey]);
    });
    return { dayTotals, weekTotal, goalTotal };
  }, [rows, metricKey, goalKey]);

  const totalsPct =
    colTotals.goalTotal > 0
      ? Math.min(100, Math.round((colTotals.weekTotal / colTotals.goalTotal) * 100))
      : 0;

  useEffect(() => {
    onTotalsChange?.({
      weekTotal: colTotals.weekTotal,
      goalTotal: colTotals.goalTotal,
      percentToGoal: totalsPct,
    });
  }, [colTotals.goalTotal, colTotals.weekTotal, onTotalsChange, totalsPct]);

  const inactivitySummary = useMemo(() => {
    const weekStart = parseLocalISO(weekISO);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const previousDay = getPreviousLocalDay();

    if (weekStart > previousDay) {
      return {
        effectiveDate: null,
        rows: rows.map((row) => ({
          ...row,
          inactiveDays: 0,
          inactivityTone: "none",
        })),
        inactiveRows: [],
      };
    }

    const effectiveDate = previousDay < weekEnd ? previousDay : weekEnd;
    const effectiveDayIndex = Math.min(
      6,
      Math.max(
        0,
        Math.floor((effectiveDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
      )
    );

    const annotatedRows = rows.map((row) => {
      if (isAffiliateManaged(row)) {
        return {
          ...row,
          inactiveDays: 0,
          inactivityTone: "none",
        };
      }

      const inactiveDays = getInactiveDayCount(row, effectiveDayIndex);
      return {
        ...row,
        inactiveDays,
        inactivityTone: getInactivityTone(inactiveDays),
      };
    });

    return {
      effectiveDate,
      rows: annotatedRows,
      inactiveRows: annotatedRows
        .filter((row) => row.inactiveDays >= 3)
        .sort(
          (a, b) =>
            b.inactiveDays - a.inactiveDays ||
            (a.name || "").localeCompare(b.name || "", undefined, {
              sensitivity: "base",
            })
        ),
    };
  }, [rows, weekISO]);

  const inactivityDateLabel = inactivitySummary.effectiveDate
    ? inactivitySummary.effectiveDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Log per-day totals for the current week when data changes
  useEffect(() => {
    if (!weekISO) return;
    const perRep = rows.map((r) => ({
      rep: r.name || r.id,
      days: (r[metricKey] || Array(7).fill(0)).map((v) => clampNum(v)),
    }));
    console.log(`[WeeklyTable] ${metricKey} per-day totals for week ${weekISO}:`, perRep);
  }, [rows, weekISO, metricKey]);

  // Saves
  const saveCell = async (rep, dayIdx, value) => {
    const n = value === "" ? 0 : clampNum(value);
    const prev = clampNum((rep[metricKey] || [])[dayIdx] ?? 0);
    const arr = [...(rep[metricKey] || Array(7).fill(0))];
    arr[dayIdx] = n;
    const baseFields = {
      name: rep.name || "",
      email: rep.email || "",
      manager: rep.manager || "",
      team: rep.team || "",
      aliases: Array.isArray(rep.aliases) ? rep.aliases : [],
      salesGoal: clampNum(rep.salesGoal),
      knocksGoal: clampNum(rep.knocksGoal),
    };
    await setDoc(
      doc(db, base, weekISO, "reps", rep.id),
      { ...baseFields, [metricKey]: arr },
      { merge: true }
    );
    if (metricKey === "sales" && prev !== n) {
      try {
        await addDoc(collection(db, "auditLogs"), {
          action: "update",
          entity: "sales",
          entityId: rep.id || null,
          before: { value: prev },
          after: { value: n },
          meta: {
            weekISO,
            dayIndex: dayIdx,
            repName: rep.name || "",
            base,
          },
          actor: {
            uid: user?.uid || null,
            email: user?.email || null,
          },
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Failed to write sales audit log", err);
      }
    }
  };

  const saveGoal = async (rep, value) =>
    setDoc(
      doc(db, base, weekISO, "reps", rep.id),
      {
        name: rep.name || "",
        email: rep.email || "",
        manager: rep.manager || "",
        team: rep.team || "",
        aliases: Array.isArray(rep.aliases) ? rep.aliases : [],
        [goalKey]: value === "" ? 0 : clampNum(value),
      },
      { merge: true }
    );

  const removeRep = async (id) =>
    setDoc(
      doc(db, base, weekISO, "reps", id),
      { deleted: true, deletedAt: serverTimestamp() },
      { merge: true }
    );

  const removeAll = async () => {
    const msgs = [
      "Are you sure?",
      "Are you really sure?",
      "Do you know what this will do?",
      "Okay your funeral if you mess this up!",
    ];
    for (const m of msgs) {
      if (!window.confirm(m)) return;
    }
    const snap = await getDocs(collection(db, base, weekISO, "reps"));
    const deletes = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);
  };

  // Excel-like navigation (save THEN move)
  const moveFocus = useCallback((td, rowDelta, colDelta) => {
    if (!td) return;
    const row = td.parentElement;
    const tbody = row?.parentElement;
    if (!row || !tbody) return;

    const colIndex = [...row.children].indexOf(td);
    const nextRow =
      rowDelta < 0
        ? row.previousElementSibling
        : rowDelta > 0
        ? row.nextElementSibling
        : row;
    if (!nextRow) return;

    let nextCol = colIndex + colDelta;
    nextCol = Math.max(0, Math.min(nextRow.children.length - 1, nextCol));

    const input = nextRow.children[nextCol]?.querySelector("input");
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const commitThenMove = async (e, td, dir) => {
    const el = e.target;
    const type = el.dataset.type; // "day" | "goal"
    const repId = el.dataset.rep;
    const rep = rows.find((x) => x.id === repId);
    if (!rep) return;

    if (type === "day") {
      await saveCell(rep, Number(el.dataset.day), el.value);
    } else if (type === "goal") {
      await saveGoal(rep, el.value);
    }

    const map = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] };
    const [dr, dc] = map[dir] || [0, 0];
    moveFocus(td, dr, dc);
  };

  const handleKeyNav = async (e) => {
    const td = e.target.closest("td");
    if (!td) return;

    // Left/right only jump when caret at edges
    if (e.key === "ArrowRight") {
      if (e.target.selectionStart === e.target.value.length) {
        e.preventDefault();
        moveFocus(td, 0, 1);
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      if (e.target.selectionStart === 0) {
        e.preventDefault();
        moveFocus(td, 0, -1);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      await commitThenMove(e, td, "down");
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      await commitThenMove(e, td, "up");
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      await commitThenMove(e, td, e.shiftKey ? "up" : "down");
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      await commitThenMove(e, td, e.shiftKey ? "left" : "right");
      return;
    }
  };

  const downloadExcel = () => {
    const metricLabel = metricKey === "knocks" ? "Knocks" : "Sales";
    const goalLabel = metricKey === "knocks" ? "Knocks Goal" : "Sales Goal";
    const filenamePrefix = metricKey === "knocks" ? "knocks" : "sales";

    const exportRows = rows.map((r) => {
      const metricValues =
        Array.isArray(r[metricKey]) && r[metricKey].length === 7
          ? r[metricKey]
          : Array(7).fill(0);
      const metricTotal = metricValues.reduce((sum, v) => sum + clampNum(v), 0);

      return {
        name: r.name || "",
        manager: r.manager || "",
        team: r.team || "",
        metricValues,
        metricTotal,
        goalValue: clampNum(r[goalKey]),
      };
    });

    const headerCells = [
      "Agent",
      "Manager",
      "Location",
      ...DAYS.map((day, i) => `${day} ${metricLabel} (${fmtHeaderDate(headerDates[i])})`),
      `Weekly ${metricLabel} Total`,
      goalLabel,
    ];

    const bodyRows = exportRows
      .map((row) => {
        const dayCells = DAYS.map((_, i) => `<td>${clampNum(row.metricValues[i])}</td>`).join("");

        return `
          <tr>
            <td>${escapeCell(row.name)}</td>
            <td>${escapeCell(row.manager)}</td>
            <td>${escapeCell(row.team)}</td>
            ${dayCells}
            <td>${row.metricTotal}</td>
            <td>${row.goalValue}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <!--[if gte mso 9]><xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>${escapeCell(`${title} ${weekISO}`)}</x:Name>
                  <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml><![endif]-->
        </head>
        <body>
          <table>
            <thead>
              <tr>${headerCells.map((cell) => `<th>${escapeCell(cell)}</th>`).join("")}</tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([html], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenamePrefix}-${weekISO}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadInactiveCsv = () => {
    const csvRows = [
      ["Agent", "Manager", "Location", "Inactive Days", "As Of"],
      ...inactivitySummary.inactiveRows.map((row) => [
        row.name || "",
        row.manager || "",
        row.team || "",
        row.inactiveDays,
        inactivityDateLabel || "",
      ]),
    ];

    const csvContent = csvRows
      .map((row) => row.map((cell) => escapeCsv(cell)).join(","))
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inactive-agents-${weekISO}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getUploadedStyleSalesOrders = () => {
    const weekStart = parseLocalISO(weekISO);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekEndId = formatDateId(weekEnd);
    const selectedDateSet = new Set(uploadedStyleDateIds);
    const visibleRepKeys = new Set(rows.map((row) => getRepMatchKey(row.name)).filter(Boolean));

    return salesUploadOrders.filter((order) => {
      if (!order.orderDateId) {
        return false;
      }
      if (uploadedStyleDateIds.length > 0 && !selectedDateSet.has(order.orderDateId)) {
        return false;
      }
      if (!uploadedStyleAllTime && uploadedStyleDateIds.length === 0 && (order.orderDateId < weekISO || order.orderDateId > weekEndId)) {
        return false;
      }
      const repKey = getRepMatchKey(order.repName);
      return !visibleRepKeys.size || visibleRepKeys.has(repKey);
    });
  };

  const downloadUploadedStyleExcel = () => {
    if (metricKey !== "sales") return;
    const weekOrders = getUploadedStyleSalesOrders();
    if (!weekOrders.length) {
      window.alert("No uploaded sales rows found for the selected export dates and filters.");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const providers = [
      { key: "ATT", sheetName: "ATT" },
      { key: "T-Fiber", sheetName: "T-Fiber" },
    ];

    providers.forEach(({ key, sheetName }) => {
      const providerOrders = weekOrders
        .filter((order) => order.provider === key)
        .sort((a, b) =>
          (b.orderDateId || "").localeCompare(a.orderDateId || "") ||
          String(b.uid || "").localeCompare(String(a.uid || ""))
        );
      if (!providerOrders.length) return;

      const headers = Array.from(
        new Set(
          providerOrders.flatMap((order) => Object.keys(order.rawData || {}))
        )
      );
      const orderDateHeader = headers.find((header) =>
        key === "ATT" ? header === "OrderDate" : header === "Order Date"
      );
      const orderedHeaders = orderDateHeader
        ? [orderDateHeader, ...headers.filter((header) => header !== orderDateHeader)]
        : headers;
      const exportRows = providerOrders.map((order) => {
        const row = {};
        orderedHeaders.forEach((header) => {
          row[header] = order.rawData?.[header] ?? "";
        });
        return row;
      });
      const sheet = XLSX.utils.json_to_sheet(exportRows, { header: orderedHeaders });
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    });

    if (!workbook.SheetNames.length) {
      window.alert("No uploaded sales rows with original fields were found for the current filters.");
      return;
    }

    const managerLabel =
      managerFilter && managerFilter !== "All"
        ? managerFilter
        : rows.length === 1
          ? rows[0].manager || "all-managers"
          : "all-managers";
    XLSX.writeFile(workbook, `${sanitizeFilename(managerLabel)}-orders to date.xlsx`);
  };

  const saveTeamManagers = async (drafts) => {
    if (!canUseSalesAdminTools) return;
    const changedRows = rows.filter((row) => {
      const nextManager = cleanCell(drafts[row.id]);
      return nextManager !== cleanCell(row.manager);
    });

    if (!changedRows.length) {
      setTeamManagerOpen(false);
      return;
    }

    setTeamManagerSaving(true);
    try {
      const operations = [];
      const seenRefs = new Set();
      const addUpdate = (ref, manager) => {
        const path = ref.path;
        if (seenRefs.has(path)) return;
        seenRefs.add(path);
        operations.push((batch) =>
          batch.set(
            ref,
            {
              manager,
              updatedAt: serverTimestamp(),
              updatedBy: user?.uid || null,
            },
            { merge: true }
          )
        );
      };

      for (const row of changedRows) {
        const nextManager = cleanCell(drafts[row.id]);
        const repQueries = [];

        if (row.name) {
          repQueries.push(query(collectionGroup(db, "reps"), where("name", "==", row.name)));
        }
        if (row.email) {
          repQueries.push(query(collectionGroup(db, "reps"), where("email", "==", row.email)));
        }

        addUpdate(doc(db, base, weekISO, "reps", row.id), nextManager);

        for (const repQuery of repQueries) {
          const repSnap = await getDocs(repQuery);
          repSnap.docs
            .filter((docSnap) => docSnap.ref.path.startsWith(`${base}/`))
            .forEach((docSnap) => addUpdate(docSnap.ref, nextManager));
        }

        const rosterQueries = [];
        if (row.name) {
          rosterQueries.push(query(collection(db, "roster"), where("name", "==", row.name)));
        }
        if (row.email) {
          rosterQueries.push(query(collection(db, "roster"), where("email", "==", row.email)));
        }

        for (const rosterQuery of rosterQueries) {
          const rosterSnap = await getDocs(rosterQuery);
          rosterSnap.docs.forEach((rosterDoc) => addUpdate(rosterDoc.ref, nextManager));
        }

        const salesUploadQueries = [];
        if (row.name) {
          salesUploadQueries.push({
            ref: query(
              collection(db, "salesUploads", ATT_DB_GROUP, "orders"),
              where("repName", "==", row.name)
            ),
            patch: {
              manager: nextManager,
              agentManager: nextManager,
              rawData: { AgentManager: nextManager },
              data: { agentManager: nextManager },
            },
          });
          salesUploadQueries.push({
            ref: query(
              collection(db, "salesUploads", ATT_DB_GROUP, "orders"),
              where("salespersonName", "==", row.name)
            ),
            patch: {
              manager: nextManager,
              agentManager: nextManager,
              rawData: { AgentManager: nextManager },
              data: { agentManager: nextManager },
            },
          });
          salesUploadQueries.push({
            ref: query(
              collection(db, "salesUploads", T_FIBER_DB_GROUP, "orders"),
              where("repName", "==", row.name)
            ),
            patch: {
              manager: nextManager,
              rawData: { Manager: nextManager },
              data: { manager: nextManager },
            },
          });
        }

        for (const uploadQuery of salesUploadQueries) {
          const uploadSnap = await getDocs(uploadQuery.ref);
          uploadSnap.docs.forEach((uploadDoc) => {
            const path = uploadDoc.ref.path;
            if (seenRefs.has(path)) return;
            seenRefs.add(path);
            operations.push((batch) =>
              batch.set(
                uploadDoc.ref,
                {
                  ...uploadQuery.patch,
                  updatedAt: serverTimestamp(),
                  updatedBy: user?.uid || null,
                },
                { merge: true }
              )
            );
          });
        }
      }

      await commitBatchOperations(operations, 350);

      setTeamManagerOpen(false);
    } finally {
      setTeamManagerSaving(false);
    }
  };

  const addDbUploadDate = () => {
    if (!dbUploadDateInput) return;
    setDbUploadDateIds((current) =>
      Array.from(new Set([...current, dbUploadDateInput])).sort()
    );
    setDbUploadDateInput("");
  };

  const removeDbUploadDate = (dateId) => {
    setDbUploadDateIds((current) => current.filter((item) => item !== dateId));
  };

  const addUploadedStyleDate = () => {
    if (!uploadedStyleDateInput) return;
    setUploadedStyleDateIds((current) =>
      Array.from(new Set([...current, uploadedStyleDateInput])).sort()
    );
    setUploadedStyleDateInput("");
    setUploadedStyleAllTime(false);
  };

  const removeUploadedStyleDate = (dateId) => {
    setUploadedStyleDateIds((current) => current.filter((item) => item !== dateId));
  };

  const importTFiberSalesToDb = async (file) => {
    if (!file) return;

    try {
      if (metricKey !== "sales") {
        setImportStatus("T-Fiber DB upload is only available on the sales grid.");
        return;
      }

      setImportStatus("Reading T-Fiber sales file for DB upload...");

      const parsed = filterDbUploadByDates(
        await parseTFiberSalesDbUpload(file),
        dbUploadDateIds
      );

      if (!parsed.orders.length) {
        setImportStatus(getEmptyDbUploadMessage("T-Fiber", "Alt Order ID", parsed));
        return;
      }

      const skippedMessage =
        parsed.skippedRows.length > 0
          ? ` Skipped ${parsed.skippedRows.length} rows with missing or invalid Alt Order ID.`
          : "";
      const duplicateMessage =
        parsed.duplicateRows > 0
          ? ` ${parsed.duplicateRows} duplicate Alt Order ID rows were collapsed to the last row in the file.`
          : "";
      const dateFilterMessage = getDbUploadDateFilterMessage(parsed);
      const confirmed = window.confirm(
        `Upsert ${parsed.orders.length} T-Fiber sales rows to salesUploads/${T_FIBER_DB_GROUP}/orders using Alt Order ID as the UID? Matching UIDs update; new UIDs create records.${dateFilterMessage}${skippedMessage}${duplicateMessage}`
      );

      if (!confirmed) {
        setImportStatus("T-Fiber DB upload cancelled.");
        return;
      }

      const existingOrdersById = await loadExistingOrdersMap(
        T_FIBER_DB_GROUP,
        parsed.orders.map((order) => order.altOrderId)
      );

      const operations = parsed.orders.map((order) => (batch) => {
        const existingOrder = existingOrdersById.get(order.altOrderId);
        const orderRef = doc(
          db,
          "salesUploads",
          T_FIBER_DB_GROUP,
          "orders",
          order.altOrderId
        );

        batch.set(
          orderRef,
          {
            ...mergeLockedSalesAssignment(order, existingOrder, "tfiber"),
            group: T_FIBER_DB_GROUP,
            sourceFileName: file.name,
            sourceSheetName: parsed.sheetName,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      operations.push((batch) => {
        const uploadLogRef = doc(
          collection(db, "salesUploads", T_FIBER_DB_GROUP, "uploadLogs")
        );

        batch.set(uploadLogRef, {
          type: "t_fiber_sales_db_upload",
          group: T_FIBER_DB_GROUP,
          fileName: file.name,
          sheetName: parsed.sheetName,
          rowsRead: parsed.totalRows,
          rowsUploaded: parsed.orders.length,
          rowsSkipped: parsed.skippedRows.length,
          duplicateRows: parsed.duplicateRows,
          selectedDateIds: parsed.selectedDateIds,
          dateFilteredOutRows: parsed.dateFilteredOutRows,
          uploadedAt: serverTimestamp(),
          uploadedBy: {
            uid: user?.uid || null,
            email: user?.email || null,
          },
        });
      });

      await commitBatchOperations(operations);

      setImportStatus(
        `T-Fiber DB upload complete. Upserted ${parsed.orders.length} rows to ${T_FIBER_DB_GROUP}.${dateFilterMessage}${skippedMessage}${duplicateMessage}`
      );
    } catch (error) {
      console.error(error);
      setImportStatus(
        error?.message || "T-Fiber DB upload failed. Check the console for details."
      );
    }
  };

  const handleTFiberDbUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importTFiberSalesToDb(file);
    event.target.value = "";
  };

  const importAttSalesToDb = async (file) => {
    if (!file) return;

    try {
      if (metricKey !== "sales") {
        setImportStatus("ATT DB upload is only available on the sales grid.");
        return;
      }

      setImportStatus("Reading ATT sales file for DB upload...");

      const parsed = filterDbUploadByDates(
        await parseAttSalesDbUpload(file),
        dbUploadDateIds
      );

      if (!parsed.orders.length) {
        setImportStatus(getEmptyDbUploadMessage("ATT", "OrderID", parsed));
        return;
      }

      const skippedMessage =
        parsed.skippedRows.length > 0
          ? ` Skipped ${parsed.skippedRows.length} rows with missing or invalid OrderID.`
          : "";
      const duplicateMessage =
        parsed.duplicateRows > 0
          ? ` ${parsed.duplicateRows} duplicate OrderID rows were collapsed to the last row in the file.`
          : "";
      const dateFilterMessage = getDbUploadDateFilterMessage(parsed);
      const confirmed = window.confirm(
        `Upsert ${parsed.orders.length} ATT sales rows to salesUploads/${ATT_DB_GROUP}/orders using OrderID as the UID? Matching UIDs update; new UIDs create records.${dateFilterMessage}${skippedMessage}${duplicateMessage}`
      );

      if (!confirmed) {
        setImportStatus("ATT DB upload cancelled.");
        return;
      }

      const existingOrdersById = await loadExistingOrdersMap(
        ATT_DB_GROUP,
        parsed.orders.map((order) => order.orderId)
      );

      const operations = parsed.orders.map((order) => (batch) => {
        const existingOrder = existingOrdersById.get(order.orderId);
        const orderRef = doc(
          db,
          "salesUploads",
          ATT_DB_GROUP,
          "orders",
          order.orderId
        );

        batch.set(
          orderRef,
          {
            ...mergeLockedSalesAssignment(order, existingOrder, "att"),
            group: ATT_DB_GROUP,
            sourceFileName: file.name,
            sourceSheetName: parsed.sheetName,
            internetStatusUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      operations.push((batch) => {
        const uploadLogRef = doc(
          collection(db, "salesUploads", ATT_DB_GROUP, "uploadLogs")
        );

        batch.set(uploadLogRef, {
          type: "att_sales_db_upload",
          group: ATT_DB_GROUP,
          fileName: file.name,
          sheetName: parsed.sheetName,
          rowsRead: parsed.totalRows,
          rowsUploaded: parsed.orders.length,
          rowsSkipped: parsed.skippedRows.length,
          duplicateRows: parsed.duplicateRows,
          totalSales: parsed.totalSales,
          selectedDateIds: parsed.selectedDateIds,
          dateFilteredOutRows: parsed.dateFilteredOutRows,
          uploadedAt: serverTimestamp(),
          uploadedBy: {
            uid: user?.uid || null,
            email: user?.email || null,
          },
        });
      });

      await commitBatchOperations(operations);

      setImportStatus(
        `ATT DB upload complete. Upserted ${parsed.orders.length} rows to ${ATT_DB_GROUP} with ${parsed.totalSales} counted sales.${dateFilterMessage}${skippedMessage}${duplicateMessage}`
      );
    } catch (error) {
      console.error(error);
      setImportStatus(
        error?.message || "ATT DB upload failed. Check the console for details."
      );
    }
  };

  const handleAttDbUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importAttSalesToDb(file);
    event.target.value = "";
  };

  const importKnocksFile = async (file) => {
    try {
      if (metricKey !== "knocks") {
        setImportStatus("Knocks import is only available on the knocks grid.");
        return;
      }

      setImportStatus("Reading knock report...");

      const targetDates = getImportTargetDates();
      const targetWeekISO = toLocalISO(startOfLocalWeek(targetDates[0]));

      if (weekISO !== targetWeekISO) {
        setImportStatus(
          `Import failed. This upload targets ${formatDateList(
            targetDates
          )}, which belongs to the week of ${targetWeekISO}.`
        );
        return;
      }

      const targetDateIds = targetDates.map((date) => toLocalISO(date));
      const parsedReport = await parseKnockReportByDate(file, targetDateIds);
      const snap = await getDocs(collection(db, base, weekISO, "reps"));
      const allReps = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((rep) => !rep.deleted);

      let matchedCount = 0;
      const unmatchedNames = [];

      for (const targetDate of targetDates) {
        const dateId = toLocalISO(targetDate);
        const knocksForDate = parsedReport.byDate[dateId] || {};
        const targetDayIndex = getDayIndexWithinWeek(targetDate, weekISO);

        for (const [repMatchKey, knockData] of Object.entries(knocksForDate)) {
          const matchingRep = allReps.find(
            (rep) => repMatchesReportKey(rep, repMatchKey)
          );

          if (!matchingRep) {
            if (
              repMatchKey &&
              !unmatchedNames.some((name) => getRepMatchKey(name) === repMatchKey)
            ) {
              unmatchedNames.push(knockData.repNameFromReport);
            }
            continue;
          }

          const repRef = doc(db, base, weekISO, "reps", matchingRep.id);
          const updatedKnocks = await runTransaction(db, async (transaction) => {
            const repSnap = await transaction.get(repRef);
            const repData = repSnap.exists() ? repSnap.data() : matchingRep;
            const knocks =
              Array.isArray(repData.knocks) && repData.knocks.length === 7
                ? [...repData.knocks]
                : Array(7).fill(0);

            knocks[targetDayIndex] =
              clampNum(knocks[targetDayIndex]) + knockData.totalKnocks;

            transaction.set(
              repRef,
              {
                name: cleanCell(repData.name ?? matchingRep.name),
                manager: cleanCell(repData.manager ?? matchingRep.manager),
                team: cleanCell(repData.team ?? matchingRep.team),
                aliases: Array.isArray(repData.aliases) ? repData.aliases : matchingRep.aliases || [],
                salesGoal: clampNum(repData.salesGoal ?? matchingRep.salesGoal),
                knocksGoal: clampNum(repData.knocksGoal ?? matchingRep.knocksGoal),
                knocks,
              },
              { merge: true }
            );

            return knocks;
          });

          matchingRep.knocks = updatedKnocks;

          matchedCount += 1;
        }
      }

      setImportStatus(
        unmatchedNames.length > 0
          ? `Knocks import complete for ${formatDayList(
              targetDates,
              weekISO
            )}. Updated ${matchedCount} reps. Unmatched: ${unmatchedNames.join(
              ", "
            )}`
          : `Knocks import complete for ${formatDayList(
              targetDates,
              weekISO
            )}. Updated ${matchedCount} reps.`
      );
    } catch (error) {
      console.error(error);
      setImportStatus("Knocks import failed. Check the console for details.");
    }
  };

  const handleKnocksImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importKnocksFile(file);
    event.target.value = "";
  };

  const getDropzoneHandlers = (zoneKey, onFile) => ({
    onDragEnter: (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveDropzone(zoneKey);
    },
    onDragOver: (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setActiveDropzone(zoneKey);
    },
    onDragLeave: (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setActiveDropzone((current) => (current === zoneKey ? "" : current));
    },
    onDrop: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveDropzone("");
      const [file] = Array.from(event.dataTransfer?.files || []);
      if (!file) return;
      await onFile(file);
    },
  });

  const openFilePickerOnKey = (event, ref) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ref.current?.click();
    }
  };

  const isSalesUploadMobileFab = canEdit && metricKey === "sales";
  const metricLabel = metricKey === "knocks" ? "Knocks" : "Sales";
  const mobileSalesUploadFab = isSalesUploadMobileFab
    ? createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] md:hidden">
          <div className="mx-auto flex w-full max-w-7xl justify-end px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6">
            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <div
                className={`flex flex-col items-end gap-2 transition-all duration-200 ${
                  mobileSalesUploadOpen
                    ? "pointer-events-auto translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                }`}
              >
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-slate-900 shadow-[0_14px_28px_rgba(9,20,35,0.12)] backdrop-blur"
                  onClick={() => {
                    setMobileSalesUploadOpen(false);
                    attDbFileInputRef.current?.click();
                  }}
                >
                  ATT DB
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200/80 bg-white/92 px-3 py-2 text-[11px] font-semibold text-slate-900 shadow-[0_14px_28px_rgba(9,20,35,0.12)] backdrop-blur"
                  onClick={() => {
                    setMobileSalesUploadOpen(false);
                    tFiberDbFileInputRef.current?.click();
                  }}
                >
                  T-Fiber DB
                </button>
              </div>

              <button
                type="button"
                className="btn btn-primary h-12 min-h-12 w-12 rounded-[18px] p-0 shadow-[0_18px_34px_rgba(9,20,35,0.18)]"
                onClick={() => setMobileSalesUploadOpen((current) => !current)}
                aria-expanded={mobileSalesUploadOpen}
                aria-label={
                  mobileSalesUploadOpen
                    ? "Close sales upload actions"
                    : "Open sales upload actions"
                }
              >
                <UploadIcon />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;
  const mobileSummaryCard =
    inactivitySummary.rows.length > 0 ? (
      <div className="mt-4 grid gap-4 md:hidden">
        <article className="mobile-rep-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Weekly {metricLabel}
              </div>
              <div className="mt-2 rounded-[20px] border border-lime-300 bg-lime-50 px-4 py-3">
                <div className="font-display text-2xl font-bold text-zinc-950">
                  {colTotals.weekTotal}
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Rep-by-rep details are hidden on mobile for a cleaner view.
              </p>
            </div>
            <div className="rounded-[20px] border border-lime-300 bg-lime-50 px-4 py-3 text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Goal
              </div>
              <div className="mt-2 font-display text-2xl font-bold text-zinc-950">
                {colTotals.goalTotal}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Active Reps
              </div>
              <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                {inactivitySummary.rows.length}
              </div>
            </div>
            <div className="rounded-[20px] border border-lime-300 bg-lime-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Team Progress
              </div>
              <div className="mt-2 font-display text-2xl font-bold text-zinc-950">
                {totalsPct}%
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>Team progress</span>
              <span>{totalsPct}%</span>
            </div>
            <progress className="progress progress-secondary w-full" value={totalsPct} max="100" />
          </div>
        </article>
      </div>
    ) : null;

  return (
    <section className="glass-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <SectionIntro
            title={title}
            description={
              metricKey === "sales"
                ? "Daily sales totals for the selected week."
                : "Daily knock totals for the selected week."
            }
          />
          {mobileSummaryCard}
        </div>

        {showHeaderActions && (
          <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200/70 bg-white/74 p-2 shadow-sm">
            <button className="btn btn-sm" onClick={downloadExcel} type="button">
              <DownloadIcon />
              <span>Download Excel</span>
            </button>
            {canUseSalesAdminTools ? (
              <div className="relative">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setUploadedStyleOpen((current) => !current)}
                  type="button"
                  aria-expanded={uploadedStyleOpen}
                >
                  <DownloadIcon />
                  <span>Uploaded Style</span>
                </button>

                {uploadedStyleOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(88vw,360px)] rounded-[18px] border border-slate-200 bg-white p-3 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
                    <div className="grid gap-2">
                      <button
                        type="button"
                        className={`btn btn-sm ${!uploadedStyleAllTime && uploadedStyleDateIds.length === 0 ? "btn-primary" : "btn-outline"}`}
                        onClick={() => {
                          setUploadedStyleAllTime(false);
                          setUploadedStyleDateIds([]);
                        }}
                      >
                        Current Week
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${uploadedStyleAllTime ? "btn-primary" : "btn-outline"}`}
                        onClick={() => {
                          setUploadedStyleAllTime(true);
                          setUploadedStyleDateIds([]);
                        }}
                      >
                        All Time
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="date"
                        className="input input-bordered input-sm h-9 min-h-9 min-w-0 flex-1"
                        value={uploadedStyleDateInput}
                        onChange={(event) => setUploadedStyleDateInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addUploadedStyleDate();
                          }
                        }}
                        aria-label="Uploaded style export date"
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={addUploadedStyleDate}
                        disabled={!uploadedStyleDateInput}
                      >
                        Add
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {uploadedStyleDateIds.length > 0 ? (
                        uploadedStyleDateIds.map((dateId) => (
                          <button
                            key={dateId}
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-800"
                            onClick={() => removeUploadedStyleDate(dateId)}
                            title="Remove export date"
                          >
                            <span>{dateId}</span>
                            <span aria-hidden="true">x</span>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                          {uploadedStyleAllTime
                            ? "Export will include every uploaded order in the current filters."
                            : "No dates selected. Export will use the current week."}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex justify-end gap-2">
                      {uploadedStyleDateIds.length > 0 || uploadedStyleAllTime ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setUploadedStyleAllTime(false);
                            setUploadedStyleDateIds([]);
                          }}
                        >
                          Reset
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          downloadUploadedStyleExcel();
                          setUploadedStyleOpen(false);
                        }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {canEdit && metricKey === "sales" && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDbUploadDatesOpen((current) => !current)}
                    aria-expanded={dbUploadDatesOpen}
                  >
                    DB Dates{dbUploadDateIds.length ? ` (${dbUploadDateIds.length})` : ""}
                  </button>

                  {dbUploadDatesOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(88vw,340px)] rounded-[18px] border border-slate-200 bg-white p-3 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          className="input input-bordered input-sm h-9 min-h-9 min-w-0 flex-1"
                          value={dbUploadDateInput}
                          onChange={(event) => setDbUploadDateInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addDbUploadDate();
                            }
                          }}
                          aria-label="DB upload order date"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={addDbUploadDate}
                          disabled={!dbUploadDateInput}
                        >
                          Add
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {dbUploadDateIds.length > 0 ? (
                          dbUploadDateIds.map((dateId) => (
                            <button
                              key={dateId}
                              type="button"
                              className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-800"
                              onClick={() => removeDbUploadDate(dateId)}
                              title="Remove DB upload date"
                            >
                              <span>{dateId}</span>
                              <span aria-hidden="true">x</span>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                            No dates selected. DB uploads will use every valid row in the file.
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex justify-end gap-2">
                        {dbUploadDateIds.length > 0 ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDbUploadDateIds([])}
                          >
                            Clear
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setDbUploadDatesOpen(false)}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <input
                  ref={attDbFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleAttDbUpload}
                />
                <input
                  ref={tFiberDbFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleTFiberDbUpload}
                />
                <div className="hidden items-center gap-2 md:flex">
                  <UploadChip
                    title="ATT DB"
                    active={activeDropzone === "att-db-sales"}
                    onClick={() => {
                      setDbUploadDatesOpen(false);
                      attDbFileInputRef.current?.click();
                    }}
                    onKeyDown={(event) =>
                      openFilePickerOnKey(event, attDbFileInputRef)
                    }
                    {...getDropzoneHandlers("att-db-sales", importAttSalesToDb)}
                  />
                  <UploadChip
                    title="T-Fiber DB"
                    active={activeDropzone === "tfiber-db-sales"}
                    onClick={() => {
                      setDbUploadDatesOpen(false);
                      tFiberDbFileInputRef.current?.click();
                    }}
                    onKeyDown={(event) =>
                      openFilePickerOnKey(event, tFiberDbFileInputRef)
                    }
                    {...getDropzoneHandlers("tfiber-db-sales", importTFiberSalesToDb)}
                  />
                </div>
              </>
            )}
            {canEdit && metricKey === "knocks" && (
              <>
                <input
                  ref={knockFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleKnocksImport}
                />
                <UploadChip
                  title="Knocks"
                  active={activeDropzone === "knocks-upload"}
                  onClick={() => knockFileInputRef.current?.click()}
                  onKeyDown={(event) => openFilePickerOnKey(event, knockFileInputRef)}
                  {...getDropzoneHandlers("knocks-upload", importKnocksFile)}
                />
              </>
            )}
            {canManageReps ? (
              <button className="btn btn-primary btn-sm" onClick={() => setOpenAdd(true)} type="button">
                <PlusIcon />
                <span>Add Reps</span>
              </button>
            ) : null}
            {canUseSalesAdminTools ? (
              <button className="btn btn-outline btn-sm" onClick={() => setTeamManagerOpen(true)} type="button">
                Team Managers
              </button>
            ) : null}
          </div>
        )}
      </div>

      {mobileSalesUploadFab}

      {canEdit && (metricKey === "sales" || metricKey === "knocks") && importStatus ? (
        <div className="mt-4 rounded-[22px] border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {importStatus}
        </div>
      ) : null}

      {isSuperAdmin && inactivityDateLabel ? (
        <div className="mt-4 flex justify-end">
          <button className="btn btn-outline btn-sm" onClick={() => setInactiveModalOpen(true)} type="button">
            View inactive ({inactivitySummary.inactiveRows.length})
          </button>
        </div>
      ) : null}

      {inactivitySummary.rows.length === 0 ? (
        <div className="mt-5 rounded-[24px] border border-dashed border-slate-200 bg-white/62 px-4 py-8 text-center text-sm text-slate-500">
          No reps found for the current filters.
        </div>
      ) : null}

      {inactivitySummary.rows.length > 0 ? (
        <div className="data-table-shell mt-5 hidden md:block">
          <div className="data-table-scroll">
            <table className="table table-sm w-full table-fixed">
              <thead className="bg-slate-100/90 text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200 [&>tr>th]:px-2">
                <tr>
                  <th className="w-[15%]">Agent</th>
                  <th className="w-[11%]">Manager</th>

                  {DAYS.map((d, i) => (
                    <th key={d} className="w-[5%] px-1 text-center">
                      <div className="flex flex-col items-center leading-tight">
                        <span className="font-medium">{d}</span>
                        <span className="text-xs text-slate-500">{fmtHeaderDate(headerDates[i])}</span>
                      </div>
                    </th>
                  ))}

                  <th className="w-[5%] px-1 text-center">TOTAL</th>
                  <th className="w-[6%] px-1 text-center">GOAL</th>
                  <th className="w-[12%] px-2">Progress</th>
                  <th className="w-[8%] px-2">Location</th>
                  {canManageReps ? <th className="w-[8%] px-2" /> : null}
                </tr>
              </thead>

              <tbody
                className="
                  [&>tr:nth-child(odd)]:bg-white
                  [&>tr:nth-child(even)]:bg-slate-50
                  [&>tr>td]:border-b [&>tr>td]:border-slate-200 [&>tr>td]:px-2
                "
              >
                {inactivitySummary.rows.map((r) => {
                  const arr = r[metricKey] || Array(7).fill(0);
                  const total = arr.reduce((a, b) => a + clampNum(b), 0);
                  const goal = clampNum(r[goalKey]);
                  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
                  const isHighlighted = highlightedRepId === r.id;
                  const nameHighlightClass =
                    !isSuperAdmin
                      ? ""
                      : r.inactivityTone === "red"
                      ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                      : r.inactivityTone === "yellow"
                      ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                      : "";

                  return (
                    <tr key={`${r.id}-${r.name}`} className={isHighlighted ? "!bg-slate-100" : undefined}>
                      <td className="font-medium">
                        <span
                          className={`inline-flex max-w-full truncate rounded-lg px-2 py-1 ${nameHighlightClass || ""}`}
                          title={r.name}
                        >
                          {r.name}
                        </span>
                      </td>

                      <td className="truncate text-sm" title={r.manager || ""}>
                        {r.manager || ""}
                      </td>

                      {DAYS.map((d, i) => (
                        <td key={d} className="px-1 text-center">
                          {canEdit && metricKey !== "sales" ? (
                            <input
                              key={`${r.id}-${weekISO}-${i}-${arr[i] ?? 0}`}
                              type="number"
                              min="0"
                              defaultValue={arr[i] ?? ""}
                              className="input input-bordered input-xs weekly-grid-input h-8 w-11 min-h-8"
                              data-type="day"
                              data-rep={r.id}
                              data-day={i}
                              onFocus={() => setHighlightedRepId(r.id)}
                              onClick={() => setHighlightedRepId(r.id)}
                              onBlur={(e) => saveCell(r, i, e.target.value)}
                              onKeyDown={handleKeyNav}
                            />
                          ) : (
                            <span className="inline-flex w-full justify-center">{arr[i] ?? ""}</span>
                          )}
                        </td>
                      ))}

                      <td className="border-l border-lime-300 bg-lime-50/90 px-1 text-center font-bold text-zinc-950">
                        {total}
                      </td>

                      <td className="border-x border-lime-300 bg-lime-50/90 px-1 text-center">
                        {canEdit ? (
                          <input
                            key={`${r.id}-${weekISO}-goal-${goal ?? 0}`}
                            type="number"
                            min="0"
                            defaultValue={goal ?? ""}
                            className="input input-bordered input-xs weekly-grid-input h-8 w-14 min-h-8 border-lime-300 bg-white font-semibold text-zinc-950"
                            data-type="goal"
                            data-rep={r.id}
                            onBlur={(e) => saveGoal(r, e.target.value)}
                            onKeyDown={handleKeyNav}
                          />
                        ) : (
                          <span className="inline-flex w-full justify-center font-semibold text-zinc-950">
                            {goal === 0 ? 0 : goal || ""}
                          </span>
                        )}
                      </td>

                      <td className="border-r border-lime-300 bg-lime-50/90">
                        <div className="flex items-center gap-2 px-2">
                          <progress className="progress progress-secondary w-28" value={pct} max="100" />
                          <span className="w-10 text-[12px] font-bold text-zinc-950">{pct}%</span>
                        </div>
                      </td>

                      <td className="truncate text-sm" title={r.team || ""}>
                        {r.team || ""}
                      </td>

                      {canManageReps ? (
                        <td className="text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              className="btn btn-ghost btn-xs h-8 min-h-8 px-2 text-[11px]"
                              onClick={() => setRepToEdit(r)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-xs h-8 min-h-8 px-2 text-[11px] text-error"
                              onClick={() => removeRep(r.id)}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="bg-slate-100/90 [&>tr>th]:border-t [&>tr>th]:border-slate-200">
                <tr>
                  <th className="text-right">Totals</th>
                  <th />
                  {colTotals.dayTotals.map((value, index) => (
                    <th key={index} className="px-1 text-center">
                      {value}
                    </th>
                  ))}
                  <th className="border-l border-lime-300 bg-lime-100 px-1 text-center font-bold text-zinc-950">
                    {colTotals.weekTotal}
                  </th>
                  <th className="border-x border-lime-300 bg-lime-100 px-1 text-center font-bold text-zinc-950">
                    {colTotals.goalTotal}
                  </th>
                  <th className="border-r border-lime-300 bg-lime-100">
                    <div className="flex items-center gap-2 px-2">
                      <progress className="progress progress-secondary w-28" value={totalsPct} max="100" />
                      <span className="w-10 text-[12px] font-bold text-zinc-950">{totalsPct}%</span>
                    </div>
                  </th>
                  <th>-</th>
                  {canManageReps ? <th /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      {canManageReps ? (
        <div className="mt-4 flex justify-end">
          <button className="btn btn-error btn-sm" onClick={removeAll} type="button">
            Delete All
          </button>
        </div>
      ) : null}

      <AddRepsModal
        weekISO={weekISO}
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        isAdmin={canManageReps}
      />

      <EditRepsModal
        open={!!repToEdit}
        onClose={() => setRepToEdit(null)}
        base={base} // "weeks" or "knocks"
        weekISO={weekISO}
        reps={repToEdit ? [repToEdit] : []}
        managerOptions={repManagerOptions}
        teamOptions={repTeamOptions}
      />

      <TeamManagerModal
        open={teamManagerOpen}
        rows={rows}
        saving={teamManagerSaving}
        onClose={() => setTeamManagerOpen(false)}
        onSave={saveTeamManagers}
      />

      <Modal
        open={inactiveModalOpen}
        onClose={() => setInactiveModalOpen(false)}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Inactive Agents</h3>
              {inactivityDateLabel && (
                <p className="text-sm text-slate-600">
                  Based on activity through {inactivityDateLabel}.
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setInactiveModalOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              className="btn btn-sm rounded-xl border border-slate-200 bg-white px-4 text-slate-700 shadow-sm transition hover:bg-slate-100 hover:text-slate-900"
              onClick={downloadInactiveCsv}
            >
              Download CSV
            </button>
          </div>

          {inactivitySummary.inactiveRows.length > 0 ? (
            <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200">
              <div className="divide-y divide-slate-200">
                {inactivitySummary.inactiveRows.map((row) => (
                  <div
                    key={`inactive-${row.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-sm text-slate-500">
                        {row.manager || "No manager"}
                        {row.team ? ` - ${row.team}` : ""}
                      </div>
                    </div>
                    <div className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                      {row.inactiveDays} days
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              No agents are currently inactive for 3 or more straight days.
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}

function TeamManagerModal({ open, rows, saving, onClose, onSave }) {
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (!open) return;
    setDrafts(Object.fromEntries((rows || []).map((row) => [row.id, row.manager || ""])));
  }, [open, rows]);

  const sortedRows = useMemo(
    () =>
      [...(rows || [])].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
      ),
    [rows]
  );

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-4xl">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Sales Admin
            </div>
            <h3 className="mt-1 text-xl font-semibold text-slate-950">Team Managers</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>

        <div className="max-h-[62vh] overflow-auto rounded-2xl border border-slate-200">
          <table className="table table-sm w-full">
            <thead className="bg-slate-100/90 text-slate-700">
              <tr>
                <th>Rep</th>
                <th>Location</th>
                <th>Manager</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length > 0 ? (
                sortedRows.map((row) => (
                  <tr key={`team-manager-${row.id}`}>
                    <td className="font-semibold text-slate-900">{row.name || "Unnamed rep"}</td>
                    <td>{row.team || ""}</td>
                    <td>
                      <input
                        type="text"
                        className="input input-bordered input-sm w-full"
                        value={drafts[row.id] ?? ""}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-sm text-slate-500">
                    No reps found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(drafts)} disabled={saving}>
            {saving ? "Saving..." : "Save Managers"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const ATT_DB_GROUP = "att sales";
const T_FIBER_DB_GROUP = "t-fiber sales";
const ATT_SALE_PACKAGE_COLUMNS = [
  "Video_Package",
  "Internet_Package",
  "Wireless_Package",
];
const ATT_DATE_COLUMNS = new Set([
  "OrderDate",
  "Video_ActiveDate",
  "Video_InstallDate",
  "Video_CancelDate",
  "Internet_ActiveDate",
  "Internet_InstallDate",
  "Internet_CancelDate",
  "Voice_ActiveDate",
  "Voice_InstallDate",
  "Voice_CancelDate",
  "Wireless_ActiveDate",
  "Wireless_CancelDate",
  "HomeAutomation_ActiveDate",
  "HomeAutomation_CancelDate",
  "HomeAutomation_InstallDate",
]);
const T_FIBER_DATE_COLUMNS = new Set([
  "Order Month",
  "Order Date",
  "Pre-Order Conversion Date",
  "Track Until Date",
  "Est. Installation Date",
  "Order Cancellation Date",
  "Activation Date",
  "Termination Request Date",
  "Deactivation Date",
  "Eligibility Date",
]);

async function parseAttSalesDbUpload(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });
  const ordersByOrderId = new Map();
  const skippedRows = [];

  rows.forEach((row, index) => {
    const normalizedRow = normalizeAttDbRow(row);
    const orderId = cleanCell(normalizedRow.rawData.OrderID);

    if (!orderId) {
      skippedRows.push({
        rowNumber: index + 2,
        reason: "Missing OrderID",
      });
      return;
    }

    if (orderId.includes("/")) {
      skippedRows.push({
        rowNumber: index + 2,
        reason: "OrderID contains / and cannot be used as a Firestore document ID",
        orderId,
      });
      return;
    }

    const saleCount = ATT_SALE_PACKAGE_COLUMNS.reduce((total, columnName) => {
      return total + (hasValue(normalizedRow.rawData[columnName]) ? 1 : 0);
    }, 0);

    ordersByOrderId.set(orderId, {
      uid: orderId,
      orderId,
      saleCount,
      countedPackages: Object.fromEntries(
        ATT_SALE_PACKAGE_COLUMNS.map((columnName) => [
          columnName,
          hasValue(normalizedRow.rawData[columnName]),
        ])
      ),
      salespersonId: cleanCell(normalizedRow.rawData.SalespersonID),
      salespersonName: cleanCell(normalizedRow.rawData.SalespersonName),
      repName: cleanCell(normalizedRow.rawData.SalespersonName),
      agentManager: cleanCell(normalizedRow.rawData.AgentManager),
      manager: cleanCell(normalizedRow.rawData.AgentManager),
      campaign: cleanCell(normalizedRow.rawData.Campaign),
      orderDate: normalizeDbDate(row.OrderDate),
      orderDateId: normalizeDbDateId(row.OrderDate),
      internetCurrentStatus: cleanCell(
        normalizedRow.rawData.Internet_CurrentStatus
      ),
      internetInstallDate: normalizeDbDate(row.Internet_InstallDate),
      internetInstallDateId: normalizeDbDateId(row.Internet_InstallDate),
      rawData: normalizedRow.rawData,
      data: normalizedRow.data,
    });
  });

  const orders = Array.from(ordersByOrderId.values());

  return {
    sheetName,
    totalRows: rows.length,
    orders,
    skippedRows,
    duplicateRows: rows.length - skippedRows.length - orders.length,
    totalSales: orders.reduce((total, order) => total + order.saleCount, 0),
  };
}

function normalizeAttDbRow(row) {
  const rawData = {};
  const data = {};

  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = cleanFieldName(key);
    if (!cleanKey) return;

    const normalizedValue = ATT_DATE_COLUMNS.has(cleanKey)
      ? normalizeDbDate(value) || ""
      : value ?? "";

    rawData[cleanKey] = normalizedValue;
    data[toCamelCase(cleanKey)] = normalizedValue;
  });

  return { rawData, data };
}

async function parseTFiberSalesDbUpload(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });
  const ordersByAltId = new Map();
  const skippedRows = [];

  rows.forEach((row, index) => {
    const normalizedRow = normalizeTFiberDbRow(row);
    const altOrderId = cleanCell(normalizedRow.rawData["Alt Order ID"]);

    if (!altOrderId) {
      skippedRows.push({
        rowNumber: index + 2,
        reason: "Missing Alt Order ID",
      });
      return;
    }

    if (altOrderId.includes("/")) {
      skippedRows.push({
        rowNumber: index + 2,
        reason: "Alt Order ID contains / and cannot be used as a Firestore document ID",
        altOrderId,
      });
      return;
    }

    ordersByAltId.set(altOrderId, {
      uid: altOrderId,
      altOrderId,
      orderId: cleanCell(normalizedRow.rawData["Order #"]),
      repId: cleanCell(normalizedRow.rawData["Rep ID"]),
      repName: cleanCell(normalizedRow.rawData.dealername),
      manager: cleanCell(normalizedRow.rawData.Manager),
      accountStatus: cleanCell(normalizedRow.rawData["Account Status"]),
      orderDate: normalizeDbDate(row["Order Date"]),
      orderDateId: normalizeDbDateId(row["Order Date"]),
      rawData: normalizedRow.rawData,
      data: normalizedRow.data,
    });
  });

  return {
    sheetName,
    totalRows: rows.length,
    orders: Array.from(ordersByAltId.values()),
    skippedRows,
    duplicateRows: rows.length - skippedRows.length - ordersByAltId.size,
  };
}

function normalizeTFiberDbRow(row) {
  const rawData = {};
  const data = {};

  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = cleanFieldName(key);
    if (!cleanKey) return;

    const normalizedValue = T_FIBER_DATE_COLUMNS.has(cleanKey)
      ? normalizeDbDate(value) || ""
      : value ?? "";

    rawData[cleanKey] = normalizedValue;
    data[toCamelCase(cleanKey)] = normalizedValue;
  });

  return { rawData, data };
}

function filterDbUploadByDates(parsed, selectedDateIds = []) {
  const cleanDateIds = selectedDateIds.filter(Boolean);

  if (!cleanDateIds.length) {
    return {
      ...parsed,
      selectedDateIds: [],
      dateFilteredOutRows: 0,
    };
  }

  const selectedDateSet = new Set(cleanDateIds);
  const orders = parsed.orders.filter((order) =>
    selectedDateSet.has(order.orderDateId)
  );

  return {
    ...parsed,
    orders,
    selectedDateIds: cleanDateIds,
    dateFilteredOutRows: parsed.orders.length - orders.length,
    totalSales:
      "totalSales" in parsed
        ? orders.reduce((total, order) => total + order.saleCount, 0)
        : parsed.totalSales,
  };
}

function getDbUploadDateFilterMessage(parsed) {
  if (!parsed.selectedDateIds?.length) return "";

  return ` Date filter: ${parsed.selectedDateIds.join(", ")}. Filtered out ${parsed.dateFilteredOutRows} valid rows from other dates.`;
}

function getEmptyDbUploadMessage(label, uidColumnName, parsed) {
  if (parsed.selectedDateIds?.length) {
    return `${label} DB upload failed. No valid rows matched selected order dates: ${parsed.selectedDateIds.join(
      ", "
    )}.`;
  }

  return `${label} DB upload failed. No valid rows had a ${uidColumnName}.`;
}

function cleanFieldName(value) {
  return cleanCell(value).replace(/\s+/g, " ");
}

function toCamelCase(value) {
  return cleanFieldName(value)
    .replace(/[#.]/g, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function normalizeDbDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;

    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      parsed.S || 0
    ).toISOString();
  }

  const parsedDate = new Date(String(value).trim());
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

function normalizeDbDateId(value) {
  const iso = normalizeDbDate(value);
  return iso ? iso.slice(0, 10) : "";
}

async function commitBatchOperations(operations, initialChunkSize = 75) {
  let index = 0;
  let chunkSize = initialChunkSize;

  while (index < operations.length) {
    const batch = writeBatch(db);
    const chunk = operations.slice(index, index + chunkSize);

    chunk.forEach((operation) => {
      operation(batch);
    });

    try {
      await batch.commit();
      index += chunk.length;
    } catch (error) {
      const message = String(error?.message || error || "");
      const canRetrySmaller =
        chunkSize > 1 &&
        /transaction too big|request.*too large|maximum.*size|too many writes/i.test(
          message
        );

      if (!canRetrySmaller) {
        throw error;
      }

      chunkSize = Math.max(1, Math.floor(chunkSize / 2));
    }
  }
}

async function loadExistingOrdersMap(groupId, ids) {
  const uniqueIds = Array.from(
    new Set(
      (ids || [])
        .map((value) => cleanCell(value))
        .filter(Boolean)
    )
  );

  if (!uniqueIds.length) {
    return new Map();
  }

  const ordersRef = collection(db, "salesUploads", groupId, "orders");
  const existingOrders = new Map();

  for (let index = 0; index < uniqueIds.length; index += 10) {
    const chunk = uniqueIds.slice(index, index + 10);
    const snap = await getDocs(query(ordersRef, where(documentId(), "in", chunk)));
    snap.forEach((docSnap) => {
      existingOrders.set(docSnap.id, docSnap.data());
    });
  }

  return existingOrders;
}

function mergeLockedSalesAssignment(order, existingOrder, provider) {
  if (!existingOrder?.salespersonLocked) {
    return order;
  }

  if (provider === "att") {
    return {
      ...order,
      repName: cleanCell(existingOrder.repName) || order.repName,
      manager: cleanCell(existingOrder.manager) || order.manager,
      salespersonName:
        cleanCell(existingOrder.salespersonName) ||
        cleanCell(existingOrder.repName) ||
        order.salespersonName,
      agentManager:
        cleanCell(existingOrder.agentManager) ||
        cleanCell(existingOrder.manager) ||
        order.agentManager,
      salespersonId: cleanCell(existingOrder.salespersonId) || order.salespersonId,
      salespersonLocked: true,
      ...(existingOrder.salespersonLockedAt
        ? { salespersonLockedAt: existingOrder.salespersonLockedAt }
        : {}),
      ...(existingOrder.salespersonLockedBy
        ? { salespersonLockedBy: existingOrder.salespersonLockedBy }
        : {}),
    };
  }

  return {
    ...order,
    repName: cleanCell(existingOrder.repName) || order.repName,
    manager: cleanCell(existingOrder.manager) || order.manager,
    repId: cleanCell(existingOrder.repId) || order.repId,
    salespersonLocked: true,
    ...(existingOrder.salespersonLockedAt
      ? { salespersonLockedAt: existingOrder.salespersonLockedAt }
      : {}),
    ...(existingOrder.salespersonLockedBy
      ? { salespersonLockedBy: existingOrder.salespersonLockedBy }
      : {}),
  };
}

async function parseKnockReportByDate(file, allowedDateIds = []) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });
  const allowedDateSet = new Set(allowedDateIds);
  const byDate = {};
  const skippedRows = [];

  for (const row of rows) {
    const rawRep = cleanCell(row.Rep);
    const repMatchKey = getRepMatchKey(rawRep);
    const status = cleanCell(row.Status);
    const recordCount = safePositiveNumber(row["Record Count"], 1);
    const dispositionDate = parseDispositionDate(row["Disposition Time (Eastern)"]);

    if (!rawRep || !repMatchKey || !dispositionDate) {
      skippedRows.push({
        reason: "Missing rep name or disposition date",
        row,
      });
      continue;
    }

    if (allowedDateSet.size > 0 && !allowedDateSet.has(dispositionDate)) {
      continue;
    }

    if (!byDate[dispositionDate]) {
      byDate[dispositionDate] = {};
    }

    if (!byDate[dispositionDate][repMatchKey]) {
      byDate[dispositionDate][repMatchKey] = {
        repNameFromReport: rawRep,
        repMatchKey,
        totalKnocks: 0,
        statuses: {},
      };
    }

    byDate[dispositionDate][repMatchKey].totalKnocks += recordCount;

    if (status) {
      byDate[dispositionDate][repMatchKey].statuses[status] =
        (byDate[dispositionDate][repMatchKey].statuses[status] || 0) + recordCount;
    }
  }

  return {
    sheetName,
    totalRows: rows.length,
    targetDates: allowedDateIds,
    byDate,
    skippedRows,
  };
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function safePositiveNumber(value, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeRepName(value) {
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

function getRepMatchKey(value) {
  return normalizeRepName(value);
}

function getRepAliasValues(rep) {
  if (Array.isArray(rep?.aliases)) return rep.aliases;
  if (Array.isArray(rep?.reportAliases)) return rep.reportAliases;
  return [];
}

function repMatchesReportKey(rep, reportKey) {
  return [rep?.name, ...getRepAliasValues(rep)].some(
    (value) => getRepMatchKey(value) === reportKey
  );
}

function formatDateId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDispositionDate(value) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateId(value);
  }

  const raw = String(value).trim();
  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return formatDateId(parsed);
  }

  return null;
}

function startOfLocalWeek(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function toLocalISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayIndexWithinWeek(date, weekISO) {
  const weekStart = parseLocalISO(weekISO);
  return Math.max(
    0,
    Math.min(
      6,
      Math.floor((date.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
    )
  );
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getImportTargetDates() {
  const previousDay = getPreviousLocalDay();

  if (new Date().getDay() !== 1) {
    return [previousDay];
  }

  return [3, 2, 1].map((daysAgo) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    return date;
  });
}

function formatDayList(dates, weekISO) {
  return dates
    .map((date) => DAYS[getDayIndexWithinWeek(date, weekISO)])
    .join(", ");
}

function formatDateList(dates) {
  return dates.map((date) => formatLongDate(date)).join(", ");
}
