import * as XLSX from "xlsx";

const ZIP_COLUMN_CANDIDATES = [
  "zip",
  "zipcode",
  "zip code",
  "postalcode",
  "postal code",
  "service zip",
  "service zipcode",
  "service postal code",
  "property zip",
  "property zipcode",
  "mailing zip",
  "mailing zipcode",
];

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findZipColumn(headers) {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const exactMatch = normalizedHeaders.find((header) =>
    ZIP_COLUMN_CANDIDATES.includes(header.normalized)
  );
  if (exactMatch) return exactMatch.original;

  const partialMatch = normalizedHeaders.find((header) =>
    header.normalized.includes("zip") || header.normalized.includes("postal")
  );
  return partialMatch?.original || "";
}

function extractZip(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digitsOnly = raw.replace(/\D/g, "");
  if (digitsOnly.length >= 5) {
    return digitsOnly.slice(0, 5).padStart(5, "0");
  }

  const numericValue = Number(raw);
  if (Number.isFinite(numericValue) && numericValue >= 0) {
    return String(Math.trunc(numericValue)).padStart(5, "0").slice(0, 5);
  }

  const match = raw.match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

function buildBaseName(zipCodes, dateStamp) {
  const uniqueZips = Array.from(new Set(zipCodes.filter(Boolean)));
  const zipLabel = uniqueZips.length ? uniqueZips.join("-") : "unknown-zip";
  return `${zipLabel} - ${dateStamp}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function prepareNormalLeadsFile(file, dateStamp) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });

  if (!rows.length) {
    throw new Error("No rows found in the uploaded file.");
  }

  const headers = Object.keys(rows[0] || {});
  const zipColumn = findZipColumn(headers);
  const zipCodes = rows.map((row) => extractZip(zipColumn ? row[zipColumn] : ""));
  const baseName = buildBaseName(zipCodes, dateStamp);
  const inputName = String(file?.name || "");
  const outputType = /\.csv$/i.test(inputName) ? "csv" : "xlsx";

  return {
    rows,
    headers,
    zipColumn,
    zipCodes: Array.from(new Set(zipCodes.filter(Boolean))),
    baseName,
    outputType,
  };
}

export function downloadNormalLeadsFile(rows, baseName, outputType) {
  if (outputType === "csv") {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob(["\ufeff", csv], {
      type: "text/csv;charset=utf-8;",
    });
    downloadBlob(blob, `${baseName}.csv`);
    return;
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  const array = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
  });
  const blob = new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${baseName}.xlsx`);
}
