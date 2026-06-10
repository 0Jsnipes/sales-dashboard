import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Modal from "./Modal.jsx";
import { formatGoGoFile } from "../utils/gogoFormatter.js";

const ACCEPTED_FILE_TYPES = ".csv,text/csv";

function formatFileSize(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isCsvFile(file) {
  if (!file) return false;
  return /\.csv$/i.test(file.name || "") || file.type === "text/csv";
}

export default function GoGoFormatterLauncher() {
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [uploadFxActive, setUploadFxActive] = useState(false);
  const [uploadFxKey, setUploadFxKey] = useState(0);

  useEffect(() => {
    if (!uploadFxActive) return undefined;

    const timeoutId = window.setTimeout(() => {
      setUploadFxActive(false);
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [uploadFxActive]);

  const triggerUploadFx = () => {
    setUploadFxKey((current) => current + 1);
    setUploadFxActive(true);
  };

  const handleFileSelection = (nextFile) => {
    if (!nextFile) return;

    if (!isCsvFile(nextFile)) {
      setError("Upload a CSV file for the GoGo formatter.");
      setSelectedFile(null);
      setSummary(null);
      return;
    }

    setSelectedFile(nextFile);
    setError("");
    setSummary(null);
    triggerUploadFx();
  };

  const handleFormat = async () => {
    if (!selectedFile) {
      setError("Drop in a CSV export or choose one from your computer first.");
      return;
    }

    setBusy(true);
    setError("");
    setSummary(null);

    try {
      const result = await formatGoGoFile(selectedFile);

      setSummary({
        ...result,
        fileName: selectedFile.name,
      });
      triggerUploadFx();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to format that file.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    setOpen(false);
    setDragActive(false);
  };

  const statusLabel = busy
    ? "Formatting and building downloads..."
    : dragActive
      ? "Release to load your CSV"
      : selectedFile
        ? "File loaded and ready"
        : "Drag a CSV into the drop zone";

  return (
    <>
      <button
        type="button"
        className="btn rounded-full border-0 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-5 text-sm font-semibold text-white shadow-lg shadow-orange-300/40 transition hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-300/50"
        onClick={() => setOpen(true)}
      >
        GoGo Formatter
      </button>

      <Modal open={open} onClose={handleClose} maxWidth="max-w-2xl">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Private Upload Tool
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">GoGo Formatter</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Drop in the call center CSV, then download the formatted GoHighLevel lead files in
                100-row chunks.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleClose}
              disabled={busy}
            >
              Close
            </button>
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
              "gogo-dropzone relative overflow-hidden rounded-[30px] border-2 border-dashed p-6 text-left transition duration-300 focus:outline-none",
              dragActive
                ? "border-cyan-400 bg-cyan-50/90 shadow-[0_24px_60px_-30px_rgba(34,211,238,0.7)]"
                : selectedFile
                  ? "border-emerald-300 bg-emerald-50/90 shadow-[0_24px_60px_-34px_rgba(16,185,129,0.6)]"
                  : "border-slate-300 bg-slate-50/80 hover:border-slate-400 hover:bg-white",
              (selectedFile || dragActive || busy || uploadFxActive) && "gogo-upload-burst"
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
              {(dragActive || uploadFxActive || busy) && (
                <div className="gogo-shimmer absolute inset-y-0 left-[-35%] w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/75 to-transparent" />
              )}

              {uploadFxActive && (
                <div key={uploadFxKey}>
                  <span className="absolute left-6 top-6 h-12 w-12 animate-ping rounded-full bg-cyan-400/20" />
                  <span className="absolute right-10 top-10 h-7 w-7 animate-ping rounded-full bg-emerald-400/25 [animation-delay:120ms]" />
                  <span className="absolute bottom-8 left-1/2 h-9 w-9 animate-ping rounded-full bg-amber-300/20 [animation-delay:220ms]" />
                </div>
              )}
            </div>

            <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={clsx(
                    "flex h-16 w-16 items-center justify-center rounded-2xl bg-white/85 shadow-sm",
                    uploadFxActive && "spin-pop",
                    busy && "gogo-float"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8 text-slate-700"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 3v11" />
                    <path d="m7 9 5-6 5 6" />
                    <path d="M5 15.5v1A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-1" />
                  </svg>
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-900">{statusLabel}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Upload with drag and drop or click anywhere in this box to browse.
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                    CSV only
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline rounded-full"
                  onClick={(event) => {
                    event.stopPropagation();
                    inputRef.current?.click();
                  }}
                  disabled={busy}
                >
                  Choose File
                </button>
                <button
                  type="button"
                  className="btn rounded-full border-0 bg-slate-900 text-white hover:bg-slate-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleFormat();
                  }}
                  disabled={busy || !selectedFile}
                >
                  {busy ? "Formatting..." : "Format and Download"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/85 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Selected File
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {selectedFile?.name || "No file selected yet"}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                {selectedFile ? formatFileSize(selectedFile.size) : "Expected input: call center CSV export"}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Output
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                Call Center Leads - YYYY-MM-DD
              </div>
              <div className="mt-1 text-sm text-slate-600">One CSV per 100 formatted rows.</div>
            </div>
          </div>

          {error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {summary ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-emerald-800">Formatting complete</div>
                  <div className="mt-1 text-slate-600">
                    {summary.filesCreated > 0
                      ? `Downloaded ${summary.filesCreated} file${summary.filesCreated === 1 ? "" : "s"} from ${summary.fileName}.`
                      : `No output files were created from ${summary.fileName}.`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm rounded-full border-0 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => inputRef.current?.click()}
                >
                  Use Another File
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/80 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Original Rows
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{summary.originalRows}</div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Final Rows
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{summary.finalRows}</div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Files Created
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{summary.filesCreated}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
