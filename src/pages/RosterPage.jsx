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
import { isEmailAllowed, rosterViewAllowlist } from "../lib/access";
import { useAuthRole } from "../hooks/useAuth";

export default function RosterPage() {
  const { user, isAdmin, permissions, loading } = useAuthRole();
  const canEditRoster = isAdmin && permissions.canEditRoster;
  const canViewRoster = isAdmin || isEmailAllowed(rosterViewAllowlist, user?.email);

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
  const [loadingSalesTotals, setLoadingSalesTotals] = useState(false);
  const fileInputRef = useRef(null);

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
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const active = new Set(reps.map((r) => r.id));
      const next = new Set([...prev].filter((id) => active.has(id)));
      return next;
    });
  }, [reps]);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

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
      const payload = {
        name: name.trim(),
        salesId: salesId.trim(),
        manager: manager.trim(),
        location: location.trim(),
        program: program.trim(),
        email: email.trim(),
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  const formatDate = (dateObj) => {
    if (!dateObj) return "N/A";
    return dateObj.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
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

  const getFirstName = (fullName) => {
    const trimmed = (fullName || "").trim();
    if (!trimmed) return "";
    return trimmed.split(/\s+/)[0] || "";
  };

  const findLastSaleDateForRep = async (rep) => {
    const targetName = (rep?.name || "").trim().toLowerCase();
    if (!targetName) return null;

    const snap = await getDocs(collectionGroup(db, "reps"));
    let latest = null;

    snap.forEach((d) => {
      const path = d.ref.path || "";
      const data = d.data() || {};
      const name = (data.name || "").trim().toLowerCase();
      if (!name || name !== targetName) return;

      if (path.startsWith("days/")) {
        const parts = path.split("/");
        const dayId = parts[1];
        if (!dayId) return;
        const salesVal = Number(data.sales);
        if (!Number.isFinite(salesVal) || salesVal <= 0) return;
        const dateObj = parseLocalISODate(dayId);
        if (!dateObj) return;
        if (!latest || dateObj > latest) latest = dateObj;
        return;
      }

      if (path.startsWith("weeks/")) {
        const parts = path.split("/");
        const weekId = parts[1];
        const weekStart = parseLocalISODate(weekId);
        if (!weekStart) return;
        const salesArr = Array.isArray(data.sales) ? data.sales : [];
        for (let i = salesArr.length - 1; i >= 0; i -= 1) {
          const val = Number(salesArr[i]);
          if (!Number.isFinite(val) || val <= 0) continue;
          const dateObj = addDays(weekStart, i);
          if (!latest || dateObj > latest) latest = dateObj;
          break;
        }
      }
    });

    return latest;
  };

  const buildTerminationEmail = (rep, lastSaleOverride) => {
    const agentName = (rep?.name || "").trim() || "the agent";
    const firstName = getFirstName(agentName) || agentName;
    const terminationDate = rep?.deletedAt?.toDate?.()
      ? formatDate(rep.deletedAt.toDate())
      : "N/A";
    const lastSaleRaw = rep?.lastSaleDate || rep?.lastSale || "";
    const lastSaleDateObj = lastSaleOverride || parseLocalISODate(lastSaleRaw);
    const lastSaleDisplay = lastSaleDateObj
      ? formatDate(lastSaleDateObj)
      : (typeof lastSaleRaw === "string" && lastSaleRaw.trim()
        ? lastSaleRaw.trim()
        : "N/A");
    const processingDateObj = lastSaleDateObj
      ? addDays(lastSaleDateObj, 90)
      : null;
    const processingDateDisplay = processingDateObj
      ? formatDate(processingDateObj)
      : "N/A";
    const fundingDateObj = processingDateObj
      ? nextWednesday(processingDateObj)
      : null;
    const fundingDateDisplay = fundingDateObj ? formatDate(fundingDateObj) : "N/A";

    const subject = `Notification of Official Contract Termination - ${agentName}`;
    const bodyLines = [
      "Hello,",
      "",
      `This email is to make official the separation between ${agentName} and AB Marketing LLC effective ${terminationDate}.`,
    ];

    if (lastSaleDateObj) {
      bodyLines.push(
        "Please make turning in any property of AB Marketing a priority.",
        "As stated, and signed in the contract when onboarding, your remaining commission checks will be held until the end of the stated chargeback period (90 days after last sales date).",
        `${firstName}'s last sale date was ${lastSaleDisplay}.`,
        `The final commission checks will be available to be processed on ${processingDateDisplay}.`,
        `After deducting any chargebacks that may come through during that time, the payroll will be available to be funded on ${fundingDateDisplay}.`,
        `Please reach out to Kristin Patterson (kristin@abenergymarketing.com) prior to ${fundingDateDisplay} to request your exit hold be released.`
      );
    }

    bodyLines.push(
      "",
      "AB Marketing appreciates the work put forth, and we wish you the best in future endeavors.",
      "",
      "Kindly,"
    );

    const body = bodyLines.join("\n");

    return { subject, body };
  };

  const handleSendTerminationEmail = (rep) => {
    const to = (rep?.email || "").trim();
    if (!to) {
      alert("No email address is on file for this rep.");
      return;
    }
    (async () => {
      let lastSaleDateObj = null;
      try {
        lastSaleDateObj = await findLastSaleDateForRep(rep);
      } catch (err) {
        console.error("Failed to load last sale date", err);
      }
      const { subject, body } = buildTerminationEmail(rep, lastSaleDateObj);
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
    })();
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

  if (loading) {
    return <div className="p-6 text-slate-600">Loading...</div>;
  }

  if (!canViewRoster) {
    return <div className="p-6 text-slate-600">Admin access required.</div>;
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
          {canEditRoster && !showTerminated && (
            <button
              type="button"
              className="btn btn-error btn-sm"
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0 || saving}
            >
              Delete Selected {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </button>
          )}
        </div>
      </div>

      {canEditRoster && (
        <div className="mb-6 rounded-2xl bg-base-100 p-4 shadow">
          <h2 className="mb-3 text-sm font-semibold">Add Rep to Roster</h2>
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
              placeholder="Sales ID (optional)"
              value={salesId}
              onChange={(e) => setSalesId(e.target.value)}
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
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={handleAddRep}
                className="btn btn-primary btn-sm whitespace-nowrap"
                disabled={saving}
              >
                {saving ? "Saving..." : "Add"}
              </button>
            </div>

          </form>

          <div className="mt-4">
            <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-700">Bulk CSV Import</div>
                  <div className="text-xs text-slate-600">
                    Columns: name, salesId, manager, location, program, email, phone, social.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
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
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? "Importing..." : "Upload CSV"}
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowOptionEditor((v) => !v)}
            >
              {showOptionEditor ? "Hide add boxes" : "Add manager / location / program"}
            </button>

            {showOptionEditor && (
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {optionTypes.map((type) => (
                  <div
                    key={type}
                    className="rounded-xl border border-base-300 p-3 shadow-sm"
                  >
                    <div className="mb-2 text-xs font-semibold uppercase text-slate-600">
                      {type}
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        className="input input-xs input-bordered w-full"
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
                        className="btn btn-primary btn-xs"
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
                          className="flex items-center justify-between rounded bg-base-200 px-2 py-1"
                        >
                          <span className="truncate">{opt.value}</span>
                          <button
                            className="btn btn-ghost btn-xs text-error"
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
                {canEditRoster && !showTerminated && (
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
                    {canEditRoster && !showTerminated && (
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
    </div>
  );
}

