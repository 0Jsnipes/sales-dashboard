import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  collection,
  setDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../lib/firebase";
import { DAYS, prevWeekISO } from "../utils/weeks.js";
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

export default function WeeklyTable({
  base = "weeks",
  weekISO,
  canEdit = false,
  metricKey = "sales",
  goalKey = "salesGoal",
  title = "Weekly Grid",
  teamFilter = "All",
  managerFilter = "All",
}) {
  const { user, isSuperAdmin } = useAuthRole();
  const isDemo = useDemoMode();
  const [rows, setRows] = useState([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [repToEdit, setRepToEdit] = useState(null); // <-- per-rep edit
  const [highlightedRepId, setHighlightedRepId] = useState(null);
  const [inactiveModalOpen, setInactiveModalOpen] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const attFileInputRef = useRef(null);
  const tmobileFileInputRef = useRef(null);
  const knockFileInputRef = useRef(null);
  const showHeaderActions = canEdit || rows.length > 0;

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
      const matchesFilters = (rep) =>
        (teamFilterNorm === "" ||
          teamFilterNorm === "All" ||
          normalizeFilter(rep.team) === teamFilterNorm) &&
        (managerFilterNorm === "" ||
          managerFilterNorm === "All" ||
          normalizeFilter(rep.manager) === managerFilterNorm);

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

      setRows(demoRows);
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
        const matchesFilters = (rep) =>
          (teamFilterNorm === "" ||
            teamFilterNorm === "All" ||
            normalizeFilter(rep.team) === teamFilterNorm) &&
          (managerFilterNorm === "" ||
            managerFilterNorm === "All" ||
            normalizeFilter(rep.manager) === managerFilterNorm);

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
            manager: data.manager || "",
            team: data.team || "",
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

        if (!cancelled) setRows(merged);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [base, weekISO, teamFilter, managerFilter, metricKey, isDemo]);

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
      manager: rep.manager || "",
      team: rep.team || "",
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
        manager: rep.manager || "",
        team: rep.team || "",
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

  const handleSalesImport = async (event, importType) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      if (metricKey !== "sales") {
        setImportStatus("ATT sales import is only available on the sales grid.");
        return;
      }

      setImportStatus("Reading sales file...");

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

      const talliesByDate =
        importType === "tmobile"
          ? await tallyTMobileSalesByDates(file, targetDates)
          : await tallyAttSalesByDates(file, targetDates);
      const snap = await getDocs(collection(db, base, weekISO, "reps"));
      const allReps = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((rep) => !rep.deleted);

      let matchedCount = 0;
      const unmatchedNames = [];

      for (const targetDate of targetDates) {
        const tally = talliesByDate[toDateString(targetDate)] || {};
        const targetDayIndex = getDayIndexWithinWeek(targetDate, weekISO);

        for (const [salespersonName, salesCount] of Object.entries(tally)) {
          const matchingRep = allReps.find(
            (rep) => normalizeName(rep.name) === normalizeName(salespersonName)
          );

          if (!matchingRep) {
            const unmatchedKey = normalizeName(salespersonName);
            if (
              unmatchedKey &&
              !unmatchedNames.some((name) => normalizeName(name) === unmatchedKey)
            ) {
              unmatchedNames.push(salespersonName);
            }
            continue;
          }

          const sales = Array.isArray(matchingRep.sales)
            ? [...matchingRep.sales]
            : Array(7).fill(0);

          sales[targetDayIndex] = clampNum(sales[targetDayIndex]) + salesCount;
          matchingRep.sales = sales;

          await setDoc(
            doc(db, base, weekISO, "reps", matchingRep.id),
            {
              name: matchingRep.name || "",
              manager: matchingRep.manager || "",
              team: matchingRep.team || "",
              salesGoal: clampNum(matchingRep.salesGoal),
              knocksGoal: clampNum(matchingRep.knocksGoal),
              sales,
            },
            { merge: true }
          );

          matchedCount += 1;
        }
      }

      setImportStatus(
        unmatchedNames.length > 0
          ? `${importType === "tmobile" ? "T-Mobile" : "ATT"} import complete for ${
              formatDayList(targetDates, weekISO)
            }. Updated ${matchedCount} reps. Unmatched: ${unmatchedNames.join(
              ", "
            )}`
          : `${importType === "tmobile" ? "T-Mobile" : "ATT"} import complete for ${
              formatDayList(targetDates, weekISO)
            }. Updated ${matchedCount} reps.`
      );
    } catch (error) {
      console.error(error);
      setImportStatus("Import failed. Check the console for details.");
    } finally {
      event.target.value = "";
    }
  };

  const handleKnocksImport = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

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
            (rep) => getRepMatchKey(rep.name) === repMatchKey
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
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="glass-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <SectionIntro
          eyebrow="Grid"
          title={title}
          description="Daily inputs, totals, goals, and progress for each rep in one place. Mobile gets a stacked card layout; desktop keeps the full spreadsheet."
        />

        {showHeaderActions && (
          <div className="flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200/70 bg-white/74 p-2 shadow-sm">
            <button className="btn btn-sm" onClick={downloadExcel} type="button">
              <DownloadIcon />
              <span>Download Excel</span>
            </button>
            {canEdit && metricKey === "sales" && (
              <>
                <input
                  ref={attFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => handleSalesImport(event, "att")}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => attFileInputRef.current?.click()}
                >
                  <span>ATT Sales Upload</span>
                </button>
                <input
                  ref={tmobileFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => handleSalesImport(event, "tmobile")}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => tmobileFileInputRef.current?.click()}
                >
                  <span>T-Mobile Upload</span>
                </button>
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
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => knockFileInputRef.current?.click()}
                >
                  <span>Knocks Upload</span>
                </button>
              </>
            )}
            {canEdit ? (
              <button className="btn btn-primary btn-sm" onClick={() => setOpenAdd(true)} type="button">
                <PlusIcon />
                <span>Add Reps</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

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
        <div className="mt-5 grid gap-4 md:hidden">
          {inactivitySummary.rows.map((r) => {
            const arr = r[metricKey] || Array(7).fill(0);
            const total = arr.reduce((sum, value) => sum + clampNum(value), 0);
            const goal = clampNum(r[goalKey]);
            const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;
            const nameHighlightClass =
              !isSuperAdmin
                ? ""
                : r.inactivityTone === "red"
                ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                : r.inactivityTone === "yellow"
                ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                : "";

            return (
              <article key={`mobile-${r.id}`} className="mobile-rep-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${nameHighlightClass}`}>
                      {r.name}
                    </span>
                    <div className="mt-2 text-sm text-slate-600">
                      {r.manager || "No manager"} - {r.team || "No location"}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200/70 bg-slate-50 px-3 py-2 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Total
                    </div>
                    <div className="font-display text-2xl font-bold text-slate-950">{total}</div>
                  </div>
                </div>

                <div className="mt-4 mobile-day-grid">
                  {DAYS.map((day, index) => (
                    <div key={`mobile-${r.id}-${day}`} className="mobile-day-pill">
                      <div className="mobile-day-pill__label">
                        {day} {fmtHeaderDate(headerDates[index])}
                      </div>
                      {canEdit ? (
                        <input
                          key={`${r.id}-${weekISO}-mobile-${index}-${arr[index] ?? 0}`}
                          type="number"
                          min="0"
                          defaultValue={arr[index] ?? ""}
                          className="input input-bordered weekly-grid-input mt-2 h-11 w-full"
                          data-type="day"
                          data-rep={r.id}
                          data-day={index}
                          onFocus={() => setHighlightedRepId(r.id)}
                          onClick={() => setHighlightedRepId(r.id)}
                          onBlur={(event) => saveCell(r, index, event.target.value)}
                        />
                      ) : (
                        <div className="mobile-day-pill__value text-center">{arr[index] ?? 0}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Goal
                    </div>
                    {canEdit ? (
                      <input
                        key={`${r.id}-${weekISO}-mobile-goal-${goal ?? 0}`}
                        type="number"
                        min="0"
                        defaultValue={goal ?? ""}
                        className="input input-bordered weekly-grid-input mt-2 h-11 w-full"
                        data-type="goal"
                        data-rep={r.id}
                        onBlur={(event) => saveGoal(r, event.target.value)}
                      />
                    ) : (
                      <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                        {goal === 0 ? 0 : goal || ""}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Progress
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{pct}%</span>
                    </div>
                    <div className="mt-3">
                      <progress className="progress w-full" value={pct} max="100" />
                    </div>
                  </div>
                </div>

                {canEdit ? (
                  <div className="mt-4 flex justify-end gap-2">
                    <button className="btn btn-outline btn-sm" onClick={() => setRepToEdit(r)} type="button">
                      Edit
                    </button>
                    <button className="btn btn-error btn-sm" onClick={() => removeRep(r.id)} type="button">
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          <article className="mobile-rep-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Weekly Totals
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                  {colTotals.weekTotal}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Goal
                </div>
                <div className="mt-2 font-display text-2xl font-bold text-slate-950">
                  {colTotals.goalTotal}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>Team progress</span>
                <span>{totalsPct}%</span>
              </div>
              <progress className="progress w-full" value={totalsPct} max="100" />
            </div>
          </article>
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
                  {canEdit ? <th className="w-[8%] px-2" /> : null}
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
                          {canEdit ? (
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

                      <td className="px-1 text-center font-semibold">{total}</td>

                      <td className="px-1 text-center">
                        {canEdit ? (
                          <input
                            key={`${r.id}-${weekISO}-goal-${goal ?? 0}`}
                            type="number"
                            min="0"
                            defaultValue={goal ?? ""}
                            className="input input-bordered input-xs weekly-grid-input h-8 w-14 min-h-8"
                            data-type="goal"
                            data-rep={r.id}
                            onBlur={(e) => saveGoal(r, e.target.value)}
                            onKeyDown={handleKeyNav}
                          />
                        ) : (
                          <span className="inline-flex w-full justify-center">
                            {goal === 0 ? 0 : goal || ""}
                          </span>
                        )}
                      </td>

                      <td>
                        <div className="flex items-center gap-1">
                          <progress className="progress w-24" value={pct} max="100" />
                          <span className="w-8 text-[11px] opacity-70">{pct}%</span>
                        </div>
                      </td>

                      <td className="truncate text-sm" title={r.team || ""}>
                        {r.team || ""}
                      </td>

                      {canEdit ? (
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
                  <th className="px-1 text-center">{colTotals.weekTotal}</th>
                  <th className="px-1 text-center">{colTotals.goalTotal}</th>
                  <th>
                    <div className="flex items-center gap-1">
                      <progress className="progress w-24" value={totalsPct} max="100" />
                      <span className="w-8 text-[11px] opacity-70">{totalsPct}%</span>
                    </div>
                  </th>
                  <th>-</th>
                  {canEdit ? <th /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      {canEdit ? (
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
        isAdmin={canEdit}
      />

      <EditRepsModal
        open={!!repToEdit}
        onClose={() => setRepToEdit(null)}
        base={base} // "weeks" or "knocks"
        weekISO={weekISO}
        reps={repToEdit ? [repToEdit] : []}
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

async function tallyAttSalesByDates(file, targetDates) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: true,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });
  const talliesByDate = createEmptyTallies(targetDates);
  const targetDateSet = new Set(Object.keys(talliesByDate));

  rows.forEach((row) => {
    const orderDate = normalizeDate(row.OrderDate);
    const salesperson = String(row.SalespersonName || "").trim();

    if (!salesperson || !targetDateSet.has(orderDate)) return;

    let salesCount = 0;

    if (hasValue(row.Internet_Package)) salesCount += 1;
    if (hasValue(row.Video_Package)) salesCount += 1;
    if (hasValue(row.Voice_Package)) salesCount += 1;
    if (salesCount === 0) return;

    const tally = talliesByDate[orderDate];
    tally[salesperson] = (tally[salesperson] || 0) + salesCount;
  });

  return talliesByDate;
}

async function tallyTMobileSalesByDates(file, targetDates) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: true,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });
  const talliesByDate = createEmptyTallies(targetDates);
  const targetDateSet = new Set(Object.keys(talliesByDate));

  rows.forEach((row) => {
    const orderDate = normalizeDate(row["Order Date"]);
    const dealerName = String(row.dealername || "").trim();

    if (!dealerName || !targetDateSet.has(orderDate)) return;

    const tally = talliesByDate[orderDate];
    tally[dealerName] = (tally[dealerName] || 0) + 1;
  });

  return talliesByDate;
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

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function safePositiveNumber(value, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeDate(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return toDateString(value);
  }

  const parsedDate = new Date(String(value).trim());

  if (!Number.isNaN(parsedDate.getTime())) {
    return toDateString(parsedDate);
  }

  return String(value).trim();
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function toDateString(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
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

function createEmptyTallies(targetDates) {
  return Object.fromEntries(targetDates.map((date) => [toDateString(date), {}]));
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
