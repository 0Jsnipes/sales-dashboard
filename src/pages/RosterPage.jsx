import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDocs,
  collectionGroup,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { normalizeEmail } from "../lib/access";
import { useAuthRole } from "../hooks/useAuth";
import { extractRosterFieldsFromPdf } from "../lib/rosterPdf";
import Modal from "../components/Modal";

export default function RosterPage({
  canViewRoster = false,
  accessLoading = false,
}) {
  const { user, isAdmin, permissions, loading } = useAuthRole();
  const canEditRoster = isAdmin && permissions.canEditRoster;
  const getInitialTerminationEmailDraft = () => ({
    rep: null,
    entityFullName: "",
    entityDisplayName: "",
    effectiveDate: "",
    lastSaleDate: "",
    attChargebackEndDate: "",
    attFundingDate: "",
    tFiberChargebackEndDate: "",
    tFiberFundingDate: "",
    directvChargebackEndDate: "",
    directvFundingDate: "",
    loading: false,
  });

  const [reps, setReps] = useState([]);
  const [options, setOptions] = useState({
    manager: [],
    location: [],
    program: [],
  });
  const [managerFilter, setManagerFilter] = useState("All");

  // form state
  const [name, setName] = useState("");
  const [salesId, setSalesId] = useState("");
  const [manager, setManager] = useState("");
  const [location, setLocation] = useState("");
  const [program, setProgram] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [social, setSocial] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfDropActive, setPdfDropActive] = useState(false);
  const [optionInputs, setOptionInputs] = useState({
    manager: "",
    location: "",
    program: "",
  });
  const [showOptionEditor, setShowOptionEditor] = useState(false);
  const optionTypes = ["manager", "location", "program"];
  const [terminated, setTerminated] = useState([]);
  const [showTerminated, setShowTerminated] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editDraft, setEditDraft] = useState({
    name: "",
    salesId: "",
    manager: "",
    location: "",
    program: "",
    email: "",
    phone: "",
    social: "",
    referredBy: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [detailOpen, setDetailOpen] = useState(null);
  const [importing, setImporting] = useState(false);
  const [salesTotals, setSalesTotals] = useState({});
  const [, setLoadingSalesTotals] = useState(false);
  const [terminationEmailDraft, setTerminationEmailDraft] = useState(() =>
    getInitialTerminationEmailDraft()
  );
  const csvFileInputRef = useRef(null);
  const pdfFileInputRef = useRef(null);

  const escapeCell = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const splitName = (fullName) => {
    const parts = String(fullName ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    };
  };

  const normalizeProgram = (p) => {
    const val = (p || "").toLowerCase();
    if (val.includes("att") || val.includes("at&t")) return "att";
    if (val.includes("fiber")) return "tfiber";
    if (val.includes("frontier")) return "frontier";
    return null;
  };

  const defaultChecksForProgram = (p) => {
    const key = normalizeProgram(p);
    const map = {
      att: ["adp", "saraplus", "uid"],
      tfiber: ["adp", "clear", "dtv", "submitted", "backgroundCheck"],
      frontier: ["adp", "dtv", "submitted", "headshot"],
    };
    const tasks = map[key] || [];
    const checks = {};
    tasks.forEach((t) => {
      checks[t] = false;
    });
    return checks;
  };

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return [];
    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.every((c) => c === "")) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] || "";
      });
      rows.push(obj);
    }
    return rows;
  };

  useEffect(() => {
    if (!user || !canViewRoster) return;
    const unsub = onSnapshot(collection(db, "roster"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // sort: name (alpha)
      list.sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });

      setReps(list);
    });

    return () => unsub();
  }, [canViewRoster, user]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const active = new Set(reps.map((r) => r.id));
      const next = new Set([...prev].filter((id) => active.has(id)));
      return next;
    });
  }, [reps]);

  useEffect(() => {
    if (!user || !canViewRoster) return;
    const unsub = onSnapshot(collection(db, "rosterOptions"), (snap) => {
      const grouped = { manager: [], location: [], program: [] };
      snap.forEach((d) => {
        const data = d.data();
        if (
          typeof data?.type === "string" &&
          typeof data?.value === "string" &&
          grouped[data.type]
        ) {
          grouped[data.type].push({ id: d.id, value: data.value });
        }
      });
      const sortAlpha = (arr) =>
        arr.sort((a, b) =>
          a.value.localeCompare(b.value, undefined, { sensitivity: "base" })
        );
      setOptions({
        manager: sortAlpha(grouped.manager),
        location: sortAlpha(grouped.location),
        program: sortAlpha(grouped.program),
      });
    });

    return () => unsub();
  }, [canViewRoster, user]);

  useEffect(() => {
    if (!user || !canViewRoster) return;
    const unsub = onSnapshot(collection(db, "rosterTerminated"), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const nameA = (a.name || "").toLowerCase();
          const nameB = (b.name || "").toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
        });
      setTerminated(list);
    });
    return () => unsub();
  }, [canViewRoster, user]);

  useEffect(() => {
    if (!user || !canViewRoster) return;
    let cancelled = false;

    const fetchTotals = async () => {
      setLoadingSalesTotals(true);
      try {
        const snap = await getDocs(collectionGroup(db, "reps"));
        const totals = {};
        snap.forEach((d) => {
          const data = d.data() || {};
          const key =
            (data.salesId || data.sid || "").trim() ||
            (data.name || "").trim().toLowerCase();
          if (!key) return;
          const salesArr = Array.isArray(data.sales) ? data.sales : [];
          const totalSales = salesArr.reduce(
            (sum, v) => sum + (Number.isFinite(+v) ? +v : 0),
            0
          );
          totals[key] = (totals[key] || 0) + totalSales;
        });
        if (!cancelled) setSalesTotals(totals);
      } catch (err) {
        console.error("Failed to load lifetime sales totals", err);
      } finally {
        if (!cancelled) setLoadingSalesTotals(false);
      }
    };

    fetchTotals();
    return () => {
      cancelled = true;
    };
  }, [canViewRoster, user]);

  const managers = useMemo(() => {
    const set = new Set(
      reps
        .map((r) => r.manager)
        .filter((m) => typeof m === "string" && m.trim().length > 0)
    );
    return ["All", ...Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )];
  }, [reps]);

  const visibleReps = useMemo(() => {
    if (managerFilter === "All") return reps;
    return reps.filter((r) => (r.manager || "") === managerFilter);
  }, [reps, managerFilter]);

  const allVisibleSelected =
    visibleReps.length > 0 &&
    visibleReps.every((r) => selectedIds.has(r.id));
  const selectedRosterReps = useMemo(
    () => reps.filter((r) => selectedIds.has(r.id)),
    [reps, selectedIds]
  );
  const exportRosterReps = selectedRosterReps.length ? selectedRosterReps : visibleReps;

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleReps.forEach((r) => next.delete(r.id));
      } else {
        visibleReps.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const resetForm = () => {
    setName("");
    setSalesId("");
    setManager("");
    setLocation("");
    setProgram("");
    setEmail("");
    setPhone("");
    setSocial("");
  };

  const pickRepFields = (rep) => ({
    name: rep?.name || "",
    salesId: rep?.salesId || "",
    manager: rep?.manager || "",
    location: rep?.location || "",
    program: rep?.program || "",
    email: rep?.email || "",
    emailNormalized: normalizeEmail(rep?.emailNormalized || rep?.email),
    phone: rep?.phone || "",
    social: rep?.social || "",
    referredBy: rep?.referredBy || "",
  });

  const logAudit = async ({ action, entity, entityId, before, after, meta }) => {
    try {
      await addDoc(collection(db, "auditLogs"), {
        action,
        entity,
        entityId: entityId || null,
        before: before || null,
        after: after || null,
        meta: meta || null,
        actor: {
          uid: user?.uid || null,
          email: user?.email || null,
        },
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to write audit log", err);
    }
  };

  const handleAddOption = async (type, directValue) => {
    const value = (directValue ?? optionInputs[type])?.trim();
    if (!value) return;
    const exists = options[type].some(
      (opt) => opt.value.toLowerCase() === value.toLowerCase()
    );
    if (exists) return;

    try {
      const docRef = await addDoc(collection(db, "rosterOptions"), {
        type,
        value,
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      });
      await logAudit({
        action: "create",
        entity: "rosterOption",
        entityId: docRef.id,
        after: { type, value },
      });
      setOptionInputs((prev) => ({ ...prev, [type]: "" }));
    } catch (err) {
      console.error(`Failed to add ${type} option`, err);
      alert("Failed to add option. Check console for details.");
    }
  };

  const handleDeleteOption = async (id, type) => {
    if (!window.confirm("Remove this option?")) return;
    const option = type
      ? options[type].find((opt) => opt.id === id)
      : null;
    try {
      await deleteDoc(doc(db, "rosterOptions", id));
      await logAudit({
        action: "delete",
        entity: "rosterOption",
        entityId: id,
        before: option ? { type, value: option.value } : null,
      });
    } catch (err) {
      console.error("Failed to delete option", err);
      alert("Failed to delete option. Check console for details.");
    }
  };

  const handleAddRep = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!name.trim()) return;

    const isOnboarded = window.confirm(
      "Is this rep fully onboarded?\nOK = Yes (won't appear in onboarding), Cancel = No (add to onboarding list)."
    );
    const onboardingPayload = {
      onboarded: isOnboarded,
      checks: defaultChecksForProgram(program),
    };

    setSaving(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      const payload = {
        name: name.trim(),
        salesId: salesId.trim(),
        manager: manager.trim(),
        location: location.trim(),
        program: program.trim(),
        email: email.trim(),
        emailNormalized: normalizedEmail,
        phone: phone.trim(),
        social: social.trim(),
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
        onboarding: onboardingPayload,
      };
      const docRef = await addDoc(collection(db, "roster"), payload);
      await logAudit({
        action: "create",
        entity: "roster",
        entityId: docRef.id,
        after: payload,
      });
      resetForm();
    } catch (err) {
      console.error("Failed to add rep to roster", err);
      alert("Failed to add rep. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRep = async (id) => {
    try {
      const target = reps.find((r) => r.id === id);
      const before = target ? pickRepFields(target) : null;
      if (target) {
        await addDoc(collection(db, "rosterTerminated"), {
          ...before,
          deletedAt: serverTimestamp(),
          deletedBy: user?.uid || null,
        });
      }
      await deleteDoc(doc(db, "roster", id));
      await logAudit({
        action: "delete",
        entity: "roster",
        entityId: id,
        before,
        meta: target ? { movedTo: "rosterTerminated" } : null,
      });
    } catch (err) {
      console.error("Failed to delete rep from roster", err);
      alert("Failed to delete rep. Check console for details.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this rep from the roster?")) return;
    setSaving(true);
    try {
      await deleteRep(id);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const count = ids.length;
    const confirmMsg = `Remove ${count} rep${count === 1 ? "" : "s"} from the roster?`;
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    try {
      for (const id of ids) {
        await deleteRep(id);
      }
      setSelectedIds(new Set());
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (rep) => {
    setDetailOpen(null);
    setEditingId(rep.id);
    setEditDraft({
      name: rep.name || "",
      salesId: rep.salesId || "",
      manager: rep.manager || "",
      location: rep.location || "",
      program: rep.program || "",
      email: rep.email || "",
      phone: rep.phone || "",
      social: rep.social || "",
      referredBy: rep.referredBy || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft({
      name: "",
      salesId: "",
      manager: "",
      location: "",
      program: "",
      email: "",
      phone: "",
      social: "",
      referredBy: "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const previous = reps.find((r) => r.id === editingId);
    const before = pickRepFields(previous);
    const payload = {
      name: editDraft.name.trim(),
      salesId: editDraft.salesId.trim(),
      manager: editDraft.manager.trim(),
      location: editDraft.location.trim(),
      program: editDraft.program.trim(),
      email: editDraft.email.trim(),
      emailNormalized: normalizeEmail(editDraft.email),
      phone: editDraft.phone.trim(),
      social: editDraft.social.trim(),
      referredBy: editDraft.referredBy.trim(),
    };
    if (!payload.name) return;
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, "roster", editingId), payload);
      await logAudit({
        action: "update",
        entity: "roster",
        entityId: editingId,
        before,
        after: payload,
      });
      handleCancelEdit();
    } catch (err) {
      console.error("Failed to update rep", err);
      alert("Failed to update rep. Check console for details.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRestore = async (id) => {
    const target = terminated.find((r) => r.id === id);
    if (!target) return;
    setSaving(true);
    try {
      const payload = {
        ...pickRepFields(target),
        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,
      };
      const docRef = await addDoc(collection(db, "roster"), payload);
      await logAudit({
        action: "restore",
        entity: "roster",
        entityId: docRef.id,
        before: pickRepFields(target),
        after: payload,
      });
      await deleteDoc(doc(db, "rosterTerminated", id));
    } catch (err) {
      console.error("Failed to restore rep to roster", err);
      alert("Failed to restore rep. Check console for details.");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async (file) => {
    if (!file) return;
    setImporting(true);
    setDetailOpen(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) {
        alert("No rows found in CSV.");
        return;
      }
      const isOnboarded = window.confirm(
        "Are these reps fully onboarded?\nOK = Yes (won't appear in onboarding), Cancel = No (add to onboarding list)."
      );

      for (const row of rows) {
        const nameVal = (row.name || row.fullname || "").trim();
        const salesIdVal = (row.salesid || row.sales_id || row.sid || "").trim();
        if (!nameVal) continue;
        const managerVal = (row.manager || "").trim();
        const locationVal = (row.location || "").trim();
        const programVal = (row.program || "").trim();
        const emailVal = (row.email || "").trim();
        const phoneVal = (row.phone || row.phonenumber || "").trim();
        const socialVal = (row.social || row.ssn || "").trim();

        const onboardingPayload = {
          onboarded: isOnboarded,
          checks: defaultChecksForProgram(programVal),
        };

        const payload = {
          name: nameVal,
          salesId: salesIdVal,
          manager: managerVal,
          location: locationVal,
          program: programVal,
          email: emailVal,
          emailNormalized: normalizeEmail(emailVal),
          phone: phoneVal,
          social: socialVal,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
          onboarding: onboardingPayload,
        };
        const docRef = await addDoc(collection(db, "roster"), payload);
        await logAudit({
          action: "create",
          entity: "roster",
          entityId: docRef.id,
          after: payload,
          meta: { source: "bulkImport" },
        });
      }
      alert("Bulk import completed.");
    } catch (err) {
      console.error("Bulk import failed", err);
      alert("Bulk import failed. Check console for details.");
    } finally {
      setImporting(false);
      if (csvFileInputRef.current) csvFileInputRef.current.value = "";
    }
  };

  const handlePdfAutofill = async (file) => {
    if (!file) return;
    setParsingPdf(true);
    setPdfDropActive(false);
    try {
      const extracted = await extractRosterFieldsFromPdf(file);
      if (!extracted.name && !extracted.email && !extracted.phone && !extracted.social) {
        alert("Couldn't find name, email, phone, or social in that PDF.");
        return;
      }

      if (extracted.name) setName(extracted.name);
      if (extracted.email) setEmail(extracted.email);
      if (extracted.phone) setPhone(extracted.phone);
      if (extracted.social) setSocial(extracted.social);
    } catch (err) {
      console.error("Failed to parse onboarding PDF", err);
      alert("Failed to read that PDF. Check console for details.");
    } finally {
      setParsingPdf(false);
      if (pdfFileInputRef.current) pdfFileInputRef.current.value = "";
    }
  };

  const handlePdfDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPdfDropActive(false);
    const file = [...(e.dataTransfer?.files || [])].find((item) =>
      item.name?.toLowerCase().endsWith(".pdf")
    );
    if (file) {
      await handlePdfAutofill(file);
    }
  };

  const handleExportRoster = () => {
    if (showTerminated) {
      alert("Switch back to the active roster to export.");
      return;
    }
    if (!visibleReps.length) {
      alert("No roster reps to export.");
      return;
    }

    const todayDate = new Date().toISOString().slice(0, 10);
    const headerCells = [
      "First Name",
      "Last Name",
      "Email",
      "Today's Date",
      "Social",
      "Phone Number",
    ];
    const bodyRows = exportRosterReps
      .map((rep) => {
        const { firstName, lastName } = splitName(rep.name);
        return `
          <tr>
            <td>${escapeCell(firstName)}</td>
            <td>${escapeCell(lastName)}</td>
            <td>${escapeCell(rep.email || "")}</td>
            <td>${escapeCell(todayDate)}</td>
            <td>${escapeCell(rep.social || "")}</td>
            <td>${escapeCell(rep.phone || "")}</td>
          </tr>
        `
      })
      .join("");

    const dateStamp = todayDate;
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
                  <x:Name>${escapeCell("Roster Export")}</x:Name>
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

    const blob = new Blob(["\ufeff", html], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `roster-export-${dateStamp}.xls`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const formatTimestamp = (ts) => {
    if (!ts?.toDate) return "";
    const d = ts.toDate();
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const parseLocalISODate = (value) => {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return new Date(Number(y), Number(m) - 1, Number(d));
      }
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  };

  const formatTerminationEmailDate = (dateObj) => {
    if (!dateObj || Number.isNaN(dateObj.getTime?.())) return "N/A";
    return dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatInputDate = (dateObj) => {
    if (!dateObj || Number.isNaN(dateObj.getTime?.())) return "";
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addDays = (dateObj, days) => {
    const next = new Date(dateObj);
    next.setDate(next.getDate() + days);
    return next;
  };

  const nextWednesday = (dateObj) => {
    const next = new Date(dateObj);
    const dow = next.getDay(); // 0=Sun..6=Sat
    const delta = (3 - dow + 7) % 7 || 7;
    next.setDate(next.getDate() + delta);
    return next;
  };

  const getTerminationTimelineDraftFields = (lastSaleDateValue) => {
    const lastSaleDateObj = parseLocalISODate(lastSaleDateValue);
    if (!lastSaleDateObj) {
      return {
        attChargebackEndDate: "",
        attFundingDate: "",
        tFiberChargebackEndDate: "",
        tFiberFundingDate: "",
        directvChargebackEndDate: "",
        directvFundingDate: "",
      };
    }

    const attChargebackEndDateObj = addDays(lastSaleDateObj, 90);
    const tFiberChargebackEndDateObj = addDays(lastSaleDateObj, 120);
    const directvChargebackEndDateObj = addDays(lastSaleDateObj, 180);

    return {
      attChargebackEndDate: formatInputDate(attChargebackEndDateObj),
      attFundingDate: formatInputDate(nextWednesday(attChargebackEndDateObj)),
      tFiberChargebackEndDate: formatInputDate(tFiberChargebackEndDateObj),
      tFiberFundingDate: formatInputDate(nextWednesday(tFiberChargebackEndDateObj)),
      directvChargebackEndDate: formatInputDate(directvChargebackEndDateObj),
      directvFundingDate: formatInputDate(nextWednesday(directvChargebackEndDateObj)),
    };
  };

  const normalizeRepName = (value) =>
    (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const getNameParts = (value) => normalizeRepName(value).split(" ").filter(Boolean);

  const stripNameSpaces = (value) => normalizeRepName(value).replace(/\s+/g, "");

  const getRepNameMatchScore = (targetName, candidateName) => {
    const targetNormalized = normalizeRepName(targetName);
    const candidateNormalized = normalizeRepName(candidateName);
    if (!targetNormalized || !candidateNormalized) return 0;
    if (targetNormalized === candidateNormalized) return 4;

    const targetCompact = stripNameSpaces(targetName);
    const candidateCompact = stripNameSpaces(candidateName);
    if (targetCompact && candidateCompact && targetCompact === candidateCompact) return 4;

    const targetParts = getNameParts(targetName);
    const candidateParts = getNameParts(candidateName);
    if (!targetParts.length || !candidateParts.length) return 0;

    const targetFirst = targetParts[0];
    const targetLast = targetParts[targetParts.length - 1];
    const candidateFirst = candidateParts[0];
    const candidateLast = candidateParts[candidateParts.length - 1];

    if (
      targetParts.length >= 2 &&
      candidateParts.length >= 2 &&
      targetFirst === candidateFirst &&
      targetLast === candidateLast
    ) {
      return 3;
    }

    if (
      targetParts.length >= 2 &&
      candidateParts.length >= 2 &&
      targetFirst === candidateLast &&
      targetLast === candidateFirst
    ) {
      return 3;
    }

    if (
      targetParts.length >= 2 &&
      candidateParts.length >= 2 &&
      candidateFirst.startsWith(targetFirst) &&
      candidateLast.startsWith(targetLast)
    ) {
      return 3;
    }

    if (
      targetNormalized.includes(candidateNormalized) ||
      candidateNormalized.includes(targetNormalized)
    ) {
      return 2;
    }

    const targetSet = new Set(targetParts);
    const sharedParts = candidateParts.filter((part) => targetSet.has(part));
    if (sharedParts.length >= 2) return 1;

    const sharedPrefixParts = candidateParts.filter((part) =>
      targetParts.some(
        (targetPart) =>
          part.startsWith(targetPart) ||
          targetPart.startsWith(part)
      )
    );
    if (sharedPrefixParts.length >= 2) return 1;

    return 0;
  };

  const findLastSaleDateForRep = async (rep) => {
    const targetName = (rep?.name || "").trim();
    if (!targetName) return null;

    const snap = await getDocs(collectionGroup(db, "reps"));
    let latest = null;
    let bestMatchScore = 0;

    snap.forEach((d) => {
      const path = d.ref.path || "";
      const data = d.data() || {};
      const matchScore = getRepNameMatchScore(targetName, data.name || "");
      if (!matchScore) return;

      let matchedDate = null;

      if (path.startsWith("days/")) {
        const parts = path.split("/");
        const dayId = parts[1];
        if (!dayId) return;
        const salesVal = Number(data.sales);
        if (!Number.isFinite(salesVal) || salesVal <= 0) return;
        matchedDate = parseLocalISODate(dayId);
      }

      if (!matchedDate && path.startsWith("weeks/")) {
        const parts = path.split("/");
        const weekId = parts[1];
        const weekStart = parseLocalISODate(weekId);
        if (!weekStart) return;
        const salesArr = Array.isArray(data.sales) ? data.sales : [];
        for (let i = salesArr.length - 1; i >= 0; i -= 1) {
          const val = Number(salesArr[i]);
          if (!Number.isFinite(val) || val <= 0) continue;
          matchedDate = addDays(weekStart, i);
          break;
        }
      }

      if (!matchedDate) return;
      if (
        matchScore > bestMatchScore ||
        (matchScore === bestMatchScore && (!latest || matchedDate > latest))
      ) {
        bestMatchScore = matchScore;
        latest = matchedDate;
      }
    });

    return latest;
  };

  const buildTerminationEmail = (draft) => {
    const rep = draft?.rep;
    const fallbackName = (rep?.name || "").trim();
    const entityFullName = (draft?.entityFullName || fallbackName || "the separated party").trim();
    const entityDisplayName = (draft?.entityDisplayName || entityFullName).trim();
    const effectiveDateObj = parseLocalISODate(draft?.effectiveDate);
    const lastSaleDateObj = parseLocalISODate(draft?.lastSaleDate);
    const attChargebackEndDateObj = parseLocalISODate(draft?.attChargebackEndDate);
    const attFundingDateObj = parseLocalISODate(draft?.attFundingDate);
    const tFiberChargebackEndDateObj = parseLocalISODate(draft?.tFiberChargebackEndDate);
    const tFiberFundingDateObj = parseLocalISODate(draft?.tFiberFundingDate);
    const directvChargebackEndDateObj = parseLocalISODate(draft?.directvChargebackEndDate);
    const directvFundingDateObj = parseLocalISODate(draft?.directvFundingDate);

    const subject = `Notification of Official Contract Termination - ${entityFullName}`;
    const bodyLines = [
      "Hello,",
      "",
      `This email is to make official the separation between ${entityFullName}, its associated independent contractors, and AB Marketing LLC, effective ${formatTerminationEmailDate(effectiveDateObj)}.`,
      "",
      "Please make turning in any property of AB Marketing a priority. As stated in your signed onboarding contract, remaining commission checks will be held until the end of the applicable chargeback period:",
      "",
      "- AT&T: 90 days after last sales date",
      "- T-Fiber: 120 days after last sales date",
      "- DIRECTV: 180 days after last sales date",
      "",
      `${entityDisplayName}'s last sale date was ${formatTerminationEmailDate(lastSaleDateObj)}.`,
      "",
      "Below is the final commission timeline:",
      "",
      "AT&T",
      `Chargeback period ends: ${formatTerminationEmailDate(attChargebackEndDateObj)}`,
      `Available to fund: ${formatTerminationEmailDate(attFundingDateObj)}`,
      "",
      "T-Fiber",
      `Chargeback period ends: ${formatTerminationEmailDate(tFiberChargebackEndDateObj)}`,
      `Available to fund: ${formatTerminationEmailDate(tFiberFundingDateObj)}`,
      "",
      "DIRECTV",
      `Chargeback period ends: ${formatTerminationEmailDate(directvChargebackEndDateObj)}`,
      `Available to fund: ${formatTerminationEmailDate(directvFundingDateObj)}`,
      "",
      "After deducting any chargebacks received during the applicable periods, remaining payroll can be requested for release on the dates listed above. Please reach out to Kristin Patterson (kristin@abenergymarketing.com) to formally make that request prior to the release dates.",
      "",
      "AB Marketing appreciates the work put forth, and we wish you the best in your future endeavors."
    ];

    const body = bodyLines.join("\n");

    return { subject, body };
  };

  const composeTerminationEmail = async (draft) => {
    const rep = draft?.rep;
    const to = (rep?.email || "").trim();
    if (!to) {
      alert("No email address is on file for this rep.");
      return;
    }
    const { subject, body } = buildTerminationEmail(draft);
    const cc = [
      "alex@abenergymarketing.com",
      "cj@abenergymarketing.com",
      "kristin@abenergymarketing.com",
      "j.sexton@abenergymarketing.com",
    ].join(",");
    const mailto = `mailto:${to}?cc=${encodeURIComponent(
      cc
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (rep?.id) {
      try {
        await updateDoc(doc(db, "rosterTerminated", rep.id), {
          terminationEmailSentAt: serverTimestamp(),
          terminationEmailSentBy: user?.uid || null,
        });
      } catch (err) {
        console.error("Failed to mark termination email sent", err);
      }
    }
    window.location.href = mailto;
  };

  const handleSendTerminationEmail = (rep) => {
    const to = (rep?.email || "").trim();
    if (!to) {
      alert("No email address is on file for this rep.");
      return;
    }

    const repName = (rep?.name || "").trim();
    const existingDate =
      formatInputDate(parseLocalISODate(rep?.lastSaleDate || rep?.lastSale || "")) || "";
    const timelineFields = getTerminationTimelineDraftFields(existingDate);
    setTerminationEmailDraft({
      ...getInitialTerminationEmailDraft(),
      rep,
      entityFullName: repName,
      entityDisplayName: repName,
      effectiveDate: formatInputDate(new Date()),
      lastSaleDate: existingDate,
      ...timelineFields,
      loading: true,
    });

    (async () => {
      let suggestedDate = existingDate;
      try {
        const lastSaleDateObj = await findLastSaleDateForRep(rep);
        if (lastSaleDateObj) {
          suggestedDate = formatInputDate(lastSaleDateObj);
        }
      } catch (err) {
        console.error("Failed to load last sale date", err);
      } finally {
        setTerminationEmailDraft((prev) => {
          if (prev.rep?.id !== rep?.id) return prev;
          if (prev.lastSaleDate) {
            return {
              ...prev,
              loading: false,
            };
          }
          return {
            ...prev,
            lastSaleDate: suggestedDate,
            ...getTerminationTimelineDraftFields(suggestedDate),
            loading: false,
          };
        });
      }
    })();
  };

  const closeTerminationEmailDraft = () => {
    setTerminationEmailDraft(getInitialTerminationEmailDraft());
  };

  const handleTerminationDraftFieldChange = (field, value) => {
    setTerminationEmailDraft((prev) => {
      const linkedFundingFieldByChargebackField = {
        attChargebackEndDate: "attFundingDate",
        tFiberChargebackEndDate: "tFiberFundingDate",
        directvChargebackEndDate: "directvFundingDate",
      };
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === "entityFullName") {
        const previousDisplayName = (prev.entityDisplayName || "").trim();
        const previousFullName = (prev.entityFullName || "").trim();
        if (!previousDisplayName || previousDisplayName === previousFullName) {
          next.entityDisplayName = value;
        }
      }

      if (field === "lastSaleDate") {
        return {
          ...next,
          ...getTerminationTimelineDraftFields(value),
        };
      }

      const linkedFundingField = linkedFundingFieldByChargebackField[field];
      if (linkedFundingField) {
        const previousFundingDate = prev[linkedFundingField] || "";
        const previousChargebackDateObj = parseLocalISODate(prev[field]);
        const previousSuggestedFundingDate = previousChargebackDateObj
          ? formatInputDate(nextWednesday(previousChargebackDateObj))
          : "";
        const chargebackDateObj = parseLocalISODate(value);
        const nextSuggestedFundingDate = chargebackDateObj
          ? formatInputDate(nextWednesday(chargebackDateObj))
          : "";

        if (!previousFundingDate || previousFundingDate === previousSuggestedFundingDate) {
          next[linkedFundingField] = nextSuggestedFundingDate;
        }
      }

      return next;
    });
  };

  const handleConfirmTerminationEmail = async () => {
    if (!terminationEmailDraft.rep) return;
    await composeTerminationEmail(terminationEmailDraft);
    closeTerminationEmailDraft();
  };

  const tierColors = ["bg-emerald-500", "bg-sky-500", "bg-purple-500", "bg-amber-500", "bg-pink-500"];
  const getRefProgress = (rep) => {
    if (!(rep.referredBy || "").trim()) return null;
    const key =
      (rep.salesId || "").trim() ||
      (rep.name || "").trim().toLowerCase();
    if (!key) return null;
    const total = salesTotals[key] || 0;
    const tier = Math.floor(total / 10);
    const percent = Math.min(((total % 10) / 10) * 100, 100);
    const color = tierColors[Math.min(tier, tierColors.length - 1)] || tierColors[0];
    return {
      total,
      tier,
      percent,
      color,
      nextTarget: (tier + 1) * 10,
    };
  };

  if (loading || accessLoading) {
    return <div className="p-6 text-slate-600">Loading...</div>;
  }

  if (!canViewRoster) {
    return <div className="p-6 text-slate-600">You must be on the roster to view this page.</div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Rep Roster</h1>
          {canEditRoster && (
            <button
              type="button"
              aria-label="Toggle terminated view"
              className={`btn btn-sm btn-ghost btn-circle ${showTerminated ? "text-white bg-rose-500 hover:bg-rose-600" : "text-slate-600"}`}
              onClick={() => {
                handleCancelEdit();
                setDetailOpen(null);
                setSelectedIds(new Set());
                setShowTerminated((v) => !v);
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path d="M4 7h16" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Manager:</span>
            <select
              className="select select-sm select-bordered"
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
            >
              {managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs opacity-70">
            Showing {visibleReps.length} of {reps.length} reps
          </span>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-4 text-sm font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:from-sky-100 hover:to-cyan-100 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleExportRoster}
            disabled={showTerminated || visibleReps.length === 0}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Export Excel
            {selectedRosterReps.length > 0 ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">
                {selectedRosterReps.length}
              </span>
            ) : null}
          </button>
          {canEditRoster && !showTerminated && (
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-rose-600 hover:to-red-600 disabled:cursor-not-allowed disabled:from-rose-300 disabled:to-red-300"
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0 || saving}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path d="M4 7h16" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
                <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete Selected</span>
              {selectedIds.size > 0 ? (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
                  {selectedIds.size}
                </span>
              ) : null}
            </button>
          )}
        </div>
      </div>

      {canEditRoster && (
        <div className="mb-6 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-cyan-50/50 p-5 shadow-[0_18px_50px_-24px_rgba(14,116,144,0.45)]">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-800">
                Add Rep to Roster
              </h2>
              <p className="text-xs text-slate-500">
                Create a rep manually or use the import tools below.
              </p>
            </div>
          </div>
          <form
            onSubmit={handleAddRep}
            className="grid grid-cols-1 gap-3 md:grid-cols-5"
          >
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="input input-sm input-bordered w-full"
              placeholder="Social"
              value={social}
              onChange={(e) => setSocial(e.target.value)}
            />
            <select
              className="select select-sm select-bordered w-full"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
            >
              <option value="">Manager</option>
              {options.manager.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.value}
                </option>
              ))}
            </select>
            <select
              className="select select-sm select-bordered w-full"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">Location</option>
              {options.location.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.value}
                </option>
              ))}
            </select>
            <select
              className="select select-sm select-bordered w-full"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            >
              <option value="">Program</option>
              {options.program.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.value}
                </option>
              ))}
            </select>
            <div className="flex justify-end pt-2 md:col-span-5">
              <button
                type="submit"
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-full border border-cyan-400/40 bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-16px_rgba(6,182,212,0.9)] transition hover:-translate-y-0.5 hover:from-sky-600 hover:via-cyan-500 hover:to-emerald-600 hover:shadow-[0_20px_40px_-20px_rgba(14,165,233,0.95)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                {saving ? "Saving rep..." : "Add To Roster"}
              </button>
            </div>
          </form>

          <div className="mt-4">
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div
                className={`rounded-xl border border-dashed p-3 transition ${
                  pdfDropActive
                    ? "border-primary bg-primary/10"
                    : "border-slate-300 bg-slate-50/60"
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPdfDropActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!pdfDropActive) setPdfDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  setPdfDropActive(false);
                }}
                onDrop={handlePdfDrop}
              >
                <div className="flex h-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">
                      Autofill From Onboarding PDF
                    </div>
                    <div className="text-xs text-slate-600">
                      Drag and drop a PDF here, or upload one to fill name, email, phone number,
                      and social.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={pdfFileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePdfAutofill(file);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => pdfFileInputRef.current?.click()}
                      disabled={parsingPdf}
                    >
                      {parsingPdf ? "Reading PDF..." : "Upload PDF"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                <div className="flex h-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-700">Bulk CSV Import</div>
                  <div className="text-xs text-slate-600">
                    Columns: name, salesId, manager, location, program, email, phone, social.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBulkImport(file);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => csvFileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? "Importing..." : "Upload CSV"}
                  </button>
                </div>
              </div>
            </div>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
              onClick={() => setShowOptionEditor((v) => !v)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              {showOptionEditor ? "Hide add boxes" : "Add manager / location / program"}
            </button>

            {showOptionEditor && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {optionTypes.map((type) => (
                  <div
                    key={type}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.7)]"
                  >
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {type}
                    </div>
                    <div className="mb-3 flex items-center gap-2">
                      <input
                        className="input input-sm input-bordered w-full border-slate-200 bg-slate-50/70"
                        placeholder={`Add ${type}`}
                        value={optionInputs[type]}
                        onChange={(e) =>
                          setOptionInputs((prev) => ({
                            ...prev,
                            [type]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddOption(type);
                          }
                        }}
                      />
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-cyan-400/40 bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_12px_24px_-18px_rgba(14,165,233,0.95)] transition hover:from-sky-600 hover:to-cyan-600"
                        type="button"
                        onClick={() => handleAddOption(type)}
                      >
                        Add
                      </button>
                    </div>
                    <div className="max-h-40 space-y-1 overflow-auto pr-1 text-sm">
                      {options[type].map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2"
                        >
                          <span className="truncate">{opt.value}</span>
                          <button
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => handleDeleteOption(opt.id, type)}
                            type="button"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {options[type].length === 0 && (
                        <div className="text-xs text-slate-500">
                          No options yet.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={`rounded-2xl p-4 shadow ${showTerminated ? "bg-rose-50 border border-rose-100" : "bg-base-100"}`}
      >
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead
              className={`text-slate-700 [&>tr>th]:border-b [&>tr>th]:border-slate-200 ${
                showTerminated ? "bg-rose-100/90" : "bg-slate-100/90"
              }`}
            >
              <tr>
                {!showTerminated && (
                  <th className="w-[44px] text-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Select all visible reps"
                    />
                  </th>
                )}
                <th className="min-w-[160px] text-center">Name</th>
                <th className="min-w-[140px] text-center">Manager</th>
                <th className="min-w-[140px] text-center">Location</th>
                <th className="min-w-[140px] text-center">Program</th>
                <th className="min-w-[170px] text-center">
                  {showTerminated ? "Deleted" : "Added"}
                </th>
                {canEditRoster && <th className="w-[100px]" />}
              </tr>
            </thead>
            <tbody
              className="
                [&>tr:nth-child(odd)]:bg-white
                [&>tr:nth-child(even)]:bg-slate-50
                [&>tr>td]:border-b [&>tr>td]:border-slate-200
              "
            >
              {(showTerminated ? terminated : visibleReps).map((r) => {
                const isEditing = !showTerminated && editingId === r.id;
                const progress = getRefProgress(r);
                const isEmailed = showTerminated && !!r.terminationEmailSentAt;
                return (
                  <tr
                    key={r.id}
                    style={isEmailed ? { backgroundColor: "#fee2e2" } : undefined}
                  >
                    {!showTerminated && (
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          aria-label={`Select ${r.name || "rep"}`}
                        />
                      </td>
                    )}
                    <td className="font-medium text-center">
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            className="input input-xs input-bordered w-full"
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft((prev) => ({ ...prev, name: e.target.value }))
                            }
                          />
                          <div className="grid grid-cols-1 gap-1 text-left text-xs">
                            <input
                              className="input input-xs input-bordered w-full"
                              placeholder="Sales ID"
                              value={editDraft.salesId}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, salesId: e.target.value }))
                              }
                            />
                            <input
                              className="input input-xs input-bordered w-full"
                              placeholder="Referred By"
                              value={editDraft.referredBy}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, referredBy: e.target.value }))
                              }
                            />
                            <input
                              className="input input-xs input-bordered w-full"
                              placeholder="Email"
                              value={editDraft.email}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, email: e.target.value }))
                              }
                            />
                            <input
                              className="input input-xs input-bordered w-full"
                              placeholder="Phone"
                              value={editDraft.phone}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, phone: e.target.value }))
                              }
                            />
                            <input
                              className="input input-xs input-bordered w-full"
                              placeholder="Social"
                              value={editDraft.social}
                              onChange={(e) =>
                                setEditDraft((prev) => ({ ...prev, social: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="relative flex items-center justify-center gap-3">
                          <span>{r.name}</span>
                          {progress && (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full ${progress.color}`}
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-500">
                                {progress.total} / {progress.nextTarget}
                              </span>
                            </div>
                          )}
                          {!showTerminated && (
                            <div className="relative">
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() =>
                                  setDetailOpen((prev) => (prev === r.id ? null : r.id))
                                }
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  className="h-4 w-4"
                                >
                                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              {detailOpen === r.id && (
                                <div className="relative rounded-lg max-width-100% border border-slate-200 bg-white p-3 text-left text-xs shadow-lg">
                                  <div className="font-semibold text-slate-800">{r.name}</div>
                                  <div className="mt-1 space-y-1 text-slate-600">
                                    <div>
                                      <span className="font-semibold">Sales ID:</span>{" "}
                                      {r.salesId || "N/A"}
                                    </div>
                                    <div>
                                      <span className="font-semibold">Referred by:</span>{" "}
                                      {r.referredBy || "N/A"}
                                    </div>
                                    {progress && (
                                      <div>
                                        <span className="font-semibold">Lifetime sales:</span>{" "}
                                        {progress.total} (Tier {progress.tier + 1})
                                      </div>
                                    )}
                                    <div>
                                      <span className="font-semibold">Email:</span>{" "}
                                      {r.email || "N/A"}
                                    </div>
                                    <div>
                                      <span className="font-semibold">Phone:</span>{" "}
                                      {r.phone || "N/A"}
                                    </div>
                                    <div>
                                      <span className="font-semibold">Social:</span>{" "}
                                      {r.social || "N/A"}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-center">
                      {isEditing ? (
                        <select
                          className="select select-xs select-bordered w-full"
                          value={editDraft.manager}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, manager: e.target.value }))
                          }
                        >
                          <option value="">Manager</option>
                          {options.manager.map((opt) => (
                            <option key={opt.id} value={opt.value}>
                              {opt.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.manager || ""
                      )}
                    </td>
                    <td className="text-center">
                      {isEditing ? (
                        <select
                          className="select select-xs select-bordered w-full"
                          value={editDraft.location}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, location: e.target.value }))
                          }
                        >
                          <option value="">Location</option>
                          {options.location.map((opt) => (
                            <option key={opt.id} value={opt.value}>
                              {opt.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.location || ""
                      )}
                    </td>
                    <td className="text-center">
                      {isEditing ? (
                        <select
                          className="select select-xs select-bordered w-full"
                          value={editDraft.program}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, program: e.target.value }))
                          }
                        >
                          <option value="">Program</option>
                          {options.program.map((opt) => (
                            <option key={opt.id} value={opt.value}>
                              {opt.value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.program || ""
                      )}
                    </td>
                    <td className="text-center text-sm text-slate-600">
                      {showTerminated
                        ? formatTimestamp(r.deletedAt)
                        : formatTimestamp(r.createdAt)}
                    </td>
                    {canEditRoster && (
                      <td className="text-right">
                        {showTerminated ? (
                          <div className="flex justify-end gap-2">
                            <button
                              className="btn btn-outline btn-xs btn-square"
                              type="button"
                              onClick={() => handleSendTerminationEmail(r)}
                              disabled={!r.email}
                              aria-label="Compose termination email"
                              title={r.email ? "Compose termination email" : "No email on file"}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                className="h-4 w-4"
                              >
                                <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
                                <path d="m22 8-10 6L2 8" />
                              </svg>
                            </button>
                            <button
                              className="btn btn-success btn-xs"
                              onClick={() => handleRestore(r.id)}
                              disabled={saving}
                            >
                              Restore
                            </button>
                          </div>
                        ) : isEditing ? (
                          <div className="flex justify-end gap-2">
                            <button
                              className="btn btn-ghost btn-xs"
                              type="button"
                              onClick={handleCancelEdit}
                              disabled={savingEdit}
                            >
                              Cancel
                            </button>
                            <button
                              className="btn btn-primary btn-xs"
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving..." : "Save"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              className="btn btn-ghost btn-xs"
                              type="button"
                              onClick={() => handleStartEdit(r)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-xs text-error"
                              onClick={() => handleDelete(r.id)}
                              disabled={saving}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {(showTerminated ? terminated : visibleReps).length === 0 && (
                <tr>
                  <td
                    colSpan={canEditRoster ? (showTerminated ? 6 : 7) : 5}
                    className="py-6 text-center text-sm text-slate-500"
                  >
                    {showTerminated
                      ? "No terminated reps logged yet."
                      : "No reps found for this manager."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Modal
        open={!!terminationEmailDraft.rep}
        onClose={closeTerminationEmailDraft}
        maxWidth="max-w-2xl bg-white"
      >
        <h3 className="text-lg font-semibold text-slate-900">Draft Termination Email</h3>
        <p className="mt-2 text-sm text-slate-600">
          Review the names and dates for{" "}
          <span className="font-medium text-slate-800">
            {terminationEmailDraft.rep?.name || "this rep"}
          </span>
          {" "}before opening the email.
        </p>
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="termination-entity-full-name">
                Separation name
              </label>
              <input
                id="termination-entity-full-name"
                type="text"
                className="input input-bordered mt-2 w-full"
                value={terminationEmailDraft.entityFullName}
                onChange={(e) =>
                  handleTerminationDraftFieldChange("entityFullName", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="termination-entity-display-name">
                Last sale line name
              </label>
              <input
                id="termination-entity-display-name"
                type="text"
                className="input input-bordered mt-2 w-full"
                value={terminationEmailDraft.entityDisplayName}
                onChange={(e) =>
                  handleTerminationDraftFieldChange("entityDisplayName", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="termination-effective-date">
                Effective date
              </label>
              <input
                id="termination-effective-date"
                type="date"
                className="input input-bordered mt-2 w-full"
                value={terminationEmailDraft.effectiveDate}
                onChange={(e) =>
                  handleTerminationDraftFieldChange("effectiveDate", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="last-sale-date">
                Last sale date
              </label>
              <input
                id="last-sale-date"
                type="date"
                className="input input-bordered mt-2 w-full"
                value={terminationEmailDraft.lastSaleDate}
                onChange={(e) =>
                  handleTerminationDraftFieldChange("lastSaleDate", e.target.value)
                }
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {terminationEmailDraft.loading
              ? "Checking sales history for a suggested date..."
              : "Last sale date will auto-fill the timeline below. You can still edit any date manually."}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">AT&amp;T</h4>
              <div className="mt-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="att-chargeback-end-date">
                  Chargeback period ends
                </label>
                <input
                  id="att-chargeback-end-date"
                  type="date"
                  className="input input-bordered mt-2 w-full"
                  value={terminationEmailDraft.attChargebackEndDate}
                  onChange={(e) =>
                    handleTerminationDraftFieldChange("attChargebackEndDate", e.target.value)
                  }
                />
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="att-funding-date">
                  Available to fund
                </label>
                <input
                  id="att-funding-date"
                  type="date"
                  className="input input-bordered mt-2 w-full"
                  value={terminationEmailDraft.attFundingDate}
                  onChange={(e) =>
                    handleTerminationDraftFieldChange("attFundingDate", e.target.value)
                  }
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">T-Fiber</h4>
              <div className="mt-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="tfiber-chargeback-end-date">
                  Chargeback period ends
                </label>
                <input
                  id="tfiber-chargeback-end-date"
                  type="date"
                  className="input input-bordered mt-2 w-full"
                  value={terminationEmailDraft.tFiberChargebackEndDate}
                  onChange={(e) =>
                    handleTerminationDraftFieldChange("tFiberChargebackEndDate", e.target.value)
                  }
                />
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="tfiber-funding-date">
                  Available to fund
                </label>
                <input
                  id="tfiber-funding-date"
                  type="date"
                  className="input input-bordered mt-2 w-full"
                  value={terminationEmailDraft.tFiberFundingDate}
                  onChange={(e) =>
                    handleTerminationDraftFieldChange("tFiberFundingDate", e.target.value)
                  }
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">DIRECTV</h4>
              <div className="mt-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="directv-chargeback-end-date">
                  Chargeback period ends
                </label>
                <input
                  id="directv-chargeback-end-date"
                  type="date"
                  className="input input-bordered mt-2 w-full"
                  value={terminationEmailDraft.directvChargebackEndDate}
                  onChange={(e) =>
                    handleTerminationDraftFieldChange("directvChargebackEndDate", e.target.value)
                  }
                />
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="directv-funding-date">
                  Available to fund
                </label>
                <input
                  id="directv-funding-date"
                  type="date"
                  className="input input-bordered mt-2 w-full"
                  value={terminationEmailDraft.directvFundingDate}
                  onChange={(e) =>
                    handleTerminationDraftFieldChange("directvFundingDate", e.target.value)
                  }
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={closeTerminationEmailDraft}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleConfirmTerminationEmail}
            disabled={!terminationEmailDraft.lastSaleDate || !terminationEmailDraft.effectiveDate}
          >
            Open Email
          </button>
        </div>
      </Modal>
    </div>
  );
}
