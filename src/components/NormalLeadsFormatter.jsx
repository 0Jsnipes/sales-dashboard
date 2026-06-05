import { useState } from "react";
import {
  downloadNormalLeadsFile,
  prepareNormalLeadsFile,
} from "../utils/normalLeadsFormatter.js";

function getTodayStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NormalLeadsFormatter({ onFormatComplete }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const handleFormat = async () => {
    if (!file) {
      setError("Upload a Salesforce CSV or Excel file first.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const prepared = await prepareNormalLeadsFile(file, getTodayStamp());
      downloadNormalLeadsFile(prepared.rows, prepared.baseName, prepared.outputType);
      setSummary(prepared);
      if (onFormatComplete) {
        await onFormatComplete(prepared);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to build the Normal Leads file.");
      setSummary(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
      <h2 className="text-lg font-bold text-slate-900">Lead Formatter</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Upload a Salesforce export and download it back out as <span className="font-semibold">Normal Leads</span>,
        renamed from the ZIP code or ZIP codes in the file plus today&apos;s date.
      </p>

      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Upload file</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="file-input file-input-bordered w-full"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError("");
              setSummary(null);
            }}
          />
        </label>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleFormat}
          disabled={busy}
        >
          {busy ? "Formatting..." : "Normal Leads"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <div>
            <span className="font-semibold">Output name:</span> {summary.baseName}
          </div>
          <div>
            <span className="font-semibold">ZIP column:</span> {summary.zipColumn || "Not found"}
          </div>
          <div>
            <span className="font-semibold">ZIP codes:</span>{" "}
            {summary.zipCodes.length ? summary.zipCodes.join(", ") : "None detected"}
          </div>
          <div>
            <span className="font-semibold">Rows:</span> {summary.rows.length}
          </div>
        </div>
      ) : null}
    </div>
  );
}
