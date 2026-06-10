import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { downloadNormalLeadsFile } from "../utils/normalLeadsFormatter.js";

const ACCEPTED_FILE_TYPES = ".csv,.xlsx,.xls";

function getTodayStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFileSize(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileKind(file) {
  const fileName = String(file?.name || "");

  if (/\.csv$/i.test(fileName)) return "CSV";
  if (/\.xlsx?$/i.test(fileName)) return "Excel";
  return "Spreadsheet";
}

function isAcceptedFile(file) {
  const fileName = String(file?.name || "");
  return /\.csv$/i.test(fileName) || /\.xlsx?$/i.test(fileName);
}

export default function NormalLeadsFormatter({ onFormatComplete }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [fxActive, setFxActive] = useState(false);
  const [fxKey, setFxKey] = useState(0);

  useEffect(() => {
    if (!fxActive) return undefined;

    const timeoutId = window.setTimeout(() => {
      setFxActive(false);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [fxActive]);

  const triggerFx = () => {
    setFxKey((current) => current + 1);
    setFxActive(true);
  };

  const handleFileSelection = (nextFile) => {
    if (!nextFile) return;

    if (!isAcceptedFile(nextFile)) {
      setFile(null);
      setSummary(null);
      setError("Upload a CSV, XLSX, or XLS export from Salesforce.");
      return;
    }

    setFile(nextFile);
    setError("");
    setSummary(null);
    triggerFx();
  };

  const handleFormat = async () => {
    if (!file) {
      setError("Upload a Salesforce CSV or Excel file first.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const prepared = await onFormatComplete(file, getTodayStamp());
      downloadNormalLeadsFile(prepared.rows, prepared.baseName, prepared.outputType);
      setSummary(prepared);
      triggerFx();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to build the ATT Leads file.");
      setSummary(null);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = busy
    ? "Formatting export and building downloads..."
    : dragActive
      ? "Release to load your export"
      : file
        ? "Export loaded and ready to convert"
        : "Drop a Salesforce export into the stage";

  return (
    <div className="lead-formatter-shell relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.22),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.24),_transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-5 shadow-sm backdrop-blur">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
        <div className="lead-formatter-glow absolute -left-16 top-6 h-28 w-28 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="lead-formatter-glow absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-300/20 blur-3xl [animation-delay:900ms]" />
      </div>

      <div className="relative z-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">
                Lead Tools
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                Salesforce In
              </span>
              <span className="rounded-full border border-lime-200 bg-lime-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-lime-700">
                ATT Leads Out
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
              ATT Leads Formatter
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Drop in a Salesforce export and turn it into a{" "}
              <span className="font-semibold text-slate-900">ATT Leads</span> file named from
              the ZIP code or ZIP codes detected in the sheet plus today&apos;s date.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:w-[300px] md:grid-cols-1">
            <div className="rounded-3xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Accepted Files
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">CSV, XLSX, XLS</div>
            </div>
            <div className="rounded-3xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Output Style
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                ZIP-stamped ATT Leads file
              </div>
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onClick={(event) => {
            event.target.value = "";
          }}
          onChange={(event) => {
            handleFileSelection(event.target.files?.[0] || null);
          }}
        />

        <div
          role="button"
          tabIndex={0}
          className={clsx(
            "lead-formatter-stage relative mt-5 overflow-hidden rounded-[30px] border-2 border-dashed p-6 text-left transition duration-300 focus:outline-none",
            dragActive
              ? "border-cyan-400 bg-cyan-50/90 shadow-[0_24px_70px_-36px_rgba(6,182,212,0.8)]"
              : file
                ? "border-emerald-300 bg-emerald-50/80 shadow-[0_24px_70px_-40px_rgba(16,185,129,0.6)]"
                : "border-slate-300 bg-white/70 hover:border-slate-400 hover:bg-white",
            (dragActive || file || busy || fxActive) && "lead-formatter-burst"
          )}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!dragActive) setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.currentTarget.contains(event.relatedTarget)) return;
            setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragActive(false);
            handleFileSelection(event.dataTransfer.files?.[0] || null);
          }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[30px]">
            {(dragActive || busy || fxActive) && (
              <div className="lead-formatter-scan absolute inset-y-0 left-[-35%] w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
            )}

            {fxActive && (
              <div key={fxKey}>
                <span className="absolute left-8 top-8 h-12 w-12 animate-ping rounded-full bg-cyan-400/20" />
                <span className="absolute right-12 top-10 h-8 w-8 animate-ping rounded-full bg-amber-300/25 [animation-delay:120ms]" />
                <span className="absolute bottom-8 left-1/2 h-10 w-10 animate-ping rounded-full bg-lime-300/25 [animation-delay:220ms]" />
              </div>
            )}
          </div>

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div
                className={clsx(
                  "lead-formatter-float flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[26px] border border-white/70 bg-white/90 shadow-sm",
                  fxActive && "spin-pop"
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-9 w-9 text-slate-800"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
                  <path d="M14 3.5V8h4" />
                  <path d="M9 13h6" />
                  <path d="M9 16h6" />
                </svg>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-900">{statusLabel}</div>
                <div className="mt-1 text-sm text-slate-600">
                  Drag and drop or click the stage to browse your export.
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                  Built for quick zip-based naming
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn rounded-full border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                onClick={(event) => {
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
                disabled={busy}
              >
                Choose Export
              </button>
              <button
                type="button"
                className="btn rounded-full border-0 bg-gradient-to-r from-slate-900 via-cyan-900 to-slate-900 text-white shadow-lg shadow-cyan-200/60 hover:scale-[1.01] hover:shadow-xl hover:shadow-cyan-200/70"
                onClick={(event) => {
                  event.stopPropagation();
                  handleFormat();
                }}
                disabled={busy || !file}
              >
                {busy ? "Formatting..." : "Build ATT Leads"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Selected File
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">
                {file?.name || "No export selected yet"}
              </div>
              {file ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {getFileKind(file)}
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {file
                ? `${formatFileSize(file.size)} ready for conversion`
                : "Expected input: Salesforce CSV or Excel export"}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-slate-950 px-4 py-4 text-white shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Download Name
            </div>
            <div className="mt-2 text-sm font-semibold">ZIPCODE - {getTodayStamp()}</div>
            <div className="mt-1 text-sm text-slate-300">
              Multiple ZIPs will be combined in the output name automatically.
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="relative z-10 mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="relative z-10 mt-4 rounded-[30px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.96))] p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-800">Formatting complete</div>
              <div className="mt-1 text-sm text-slate-600">
                Your ATT Leads file has been built and downloaded.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm rounded-full border-0 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => inputRef.current?.click()}
            >
              Use Another Export
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Output Name
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{summary.baseName}</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                ZIP Column
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {summary.zipColumn || "Not found"}
              </div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Rows
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{summary.rows.length}</div>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Output Type
              </div>
              <div className="mt-1 text-sm font-semibold uppercase text-slate-900">
                {summary.outputType}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 px-4 py-4 text-sm text-slate-700">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              ZIP Codes Detected
            </div>
            {summary.zipCodes.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.zipCodes.map((zipCode) => (
                  <span
                    key={zipCode}
                    className="rounded-full border border-lime-200 bg-lime-50 px-3 py-1.5 text-xs font-semibold text-lime-800"
                  >
                    {zipCode}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-500">None detected in the export.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
