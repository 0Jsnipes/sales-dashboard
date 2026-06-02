import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../lib/firebase";
import { todayId } from "../utils/date";
import { startOfWeek, toISO } from "../utils/weeks";

export default function SalesTable({ isAdmin }) {
  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const dayRows = new Map();
    const weekRows = new Map();

    const syncRows = () => {
      const merged = new Map();

      for (const row of weekRows.values()) {
        const key = normalizeName(row.name);
        if (!key) continue;

        merged.set(key, {
          id: row.id,
          docId: row.id,
          name: row.name || "",
          sales: 0,
          source: "week",
        });
      }

      for (const row of dayRows.values()) {
        const key = normalizeName(row.name);
        if (!key) continue;

        const existing = merged.get(key);
        merged.set(key, {
          id: row.id,
          docId: row.id,
          name: row.name || existing?.name || "",
          sales: row.sales ?? 0,
          source: "day",
        });
      }

      const nextRows = Array.from(merged.values()).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, {
          sensitivity: "base",
        })
      );

      setRows(nextRows);
    };

    const unsubDay = onSnapshot(collection(db, "days", todayId(), "reps"), (s) => {
      dayRows.clear();
      s.docs.forEach((d) => {
        dayRows.set(d.id, { id: d.id, ...d.data() });
      });
      syncRows();
    });

    const weekISO = toISO(startOfWeek());
    const unsubWeek = onSnapshot(collection(db, "weeks", weekISO, "reps"), (s) => {
      weekRows.clear();
      s.docs.forEach((d) => {
        const data = d.data();
        if (data?.deleted) return;
        weekRows.set(d.id, { id: d.id, ...data });
      });
      syncRows();
    });

    return () => {
      unsubDay();
      unsubWeek();
    };
  }, []);

  const updateSales = async (id, sales) => {
    const rep = rows.find((r) => r.id === id);

    await setDoc(
      doc(db, "days", todayId(), "reps", rep?.docId || id),
      { sales, name: rep?.name || "" },
      { merge: true }
    );
  };

  const addRep = async () => {
    if (!newName.trim()) return;

    await addDoc(collection(db, "days", todayId(), "reps"), {
      name: newName.trim(),
      sales: 0,
    });

    setNewName("");
  };

  const removeRep = async (id) => {
    const rep = rows.find((r) => r.id === id);
    if (!rep?.docId) return;

    await deleteDoc(doc(db, "days", todayId(), "reps", rep.docId));
  };

  const handleSalesImport = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setImportStatus("Reading sales file...");

      const tally = await tallyYesterdaySalesSimple(file);
      let matchedCount = 0;
      const unmatchedNames = [];

      for (const [salespersonName, salesCount] of Object.entries(tally)) {
        const matchingRep = rows.find(
          (row) => normalizeName(row.name) === normalizeName(salespersonName)
        );

        if (!matchingRep) {
          unmatchedNames.push(salespersonName);
          continue;
        }

        await setDoc(
          doc(db, "days", todayId(), "reps", matchingRep.docId || matchingRep.id),
          {
            name: matchingRep.name,
            sales: salesCount,
          },
          { merge: true }
        );

        matchedCount += 1;
      }

      setImportStatus(
        unmatchedNames.length > 0
          ? `Import complete. Updated ${matchedCount} reps. Unmatched: ${unmatchedNames.join(
              ", "
            )}`
          : `Import complete. Updated ${matchedCount} reps.`
      );
    } catch (error) {
      console.error(error);
      setImportStatus("Import failed. Check the console for details.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="rounded-2xl bg-base-100 p-4 shadow">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">Today's Sales</h2>

        {isAdmin && (
          <div className="flex flex-wrap justify-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleSalesImport}
            />
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              ATT Sales upload
            </button>
            <input
              className="input input-bordered input-sm"
              placeholder="New rep name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn-sm btn-primary" onClick={addRep}>
              Add
            </button>
          </div>
        )}
      </div>

      {isAdmin && importStatus && (
        <div className="mt-3 rounded-lg bg-base-200 p-2 text-sm">
          {importStatus}
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th>Rep</th>
              <th>Sales</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td className="w-48">
                  {isAdmin ? (
                    <input
                      type="number"
                      min="0"
                      className="input input-bordered input-sm w-28"
                      value={r.sales ?? 0}
                      onChange={(e) =>
                        updateSales(r.id, Number(e.target.value || 0))
                      }
                    />
                  ) : (
                    <span>{r.sales ?? 0}</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="text-right">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => removeRep(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function tallyYesterdaySalesSimple(file) {
  const data = await file.arrayBuffer();

  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: true,
  });

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });
  const yesterday = getYesterdayDateString();
  const tally = {};

  rows.forEach((row) => {
    const orderDate = normalizeDate(row.OrderDate);
    const salesperson = String(row.SalespersonName || "").trim();

    if (!salesperson || orderDate !== yesterday) {
      return;
    }

    let salesCount = 0;

    if (hasValue(row.Internet_Package)) salesCount += 1;
    if (hasValue(row.Video_Package)) salesCount += 1;
    if (hasValue(row.Voice_Package)) salesCount += 1;
    if (salesCount === 0) return;

    tally[salesperson] = (tally[salesperson] || 0) + salesCount;
  });

  return tally;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getYesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function normalizeDate(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`;
  }

  const parsedDate = new Date(String(value).trim());

  if (!Number.isNaN(parsedDate.getTime())) {
    return `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
  }

  return String(value).trim();
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
