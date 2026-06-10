import Papa from "papaparse";

const GOGO_HEADERS = [
  "Contact ID",
  "Phone",
  "Email",
  "First Name",
  "Last Name",
  "Business Name",
  "Opportunity ID",
  "Opportunity name",
  "Pipeline",
  "Stage",
  "Opportunity Value",
  "Source",
  "Opportunity Owner",
  "Opportunity Followers",
  "Status",
  "Lost Reason",
  "Additional Emails",
  "Additional Phones",
  "Notes",
  "Tags",
];

const PIPELINE_NAME = "Fiber Pipeline";
const STAGE_NAME = "New Lead";
const OPPORTUNITY_OWNER = "Jared Snipes";
const TAGS = "Fiber";
const CHUNK_SIZE = 100;

function clean(value = "") {
  return String(value || "").trim();
}

function toTitleCase(value = "") {
  return clean(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizePhone(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return clean(phone);
}

function splitName(fullName = "") {
  const cleaned = clean(fullName).replace(/\s+/g, " ");

  if (!cleaned) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = cleaned.split(" ");

  if (parts.length === 1) {
    return {
      firstName: toTitleCase(parts[0]),
      lastName: "",
    };
  }

  return {
    firstName: toTitleCase(parts[0]),
    lastName: toTitleCase(parts.slice(1).join(" ")),
  };
}

function buildAddress(row) {
  return [row["Street Address"], row["Apt #"], row["City"], row["State"], row["Zip"]]
    .map(clean)
    .filter(Boolean)
    .join(", ");
}

function buildNotes(row) {
  const address = buildAddress(row);
  const noteFields = [
    ["Order ID", row["Order ID"]],
    ["Order Date", row["Order Date"]],
    ["Customer Name", row["Customer Name"]],
    ["Salesperson", row["Salesperson"]],
    ["Manager", row["Manager"]],
    ["Campaign", row["Campaign"]],
    ["Internet Provider", row["Internet Provider"]],
    ["Internet Status", row["Internet Status"]],
    ["Internet Package", row["Internet Package"]],
    ["Address", address],
    ["Disposition", row["Disposition"]],
    ["Disposition Notes", row["Disposition Notes"]],
  ];

  return noteFields
    .filter(([, value]) => clean(value))
    .map(([label, value]) => `${label}: ${clean(value)}`)
    .join(" | ");
}

function isCanceledRow(row) {
  const internetStatus = clean(row["Internet Status"]).toLowerCase();
  const disposition = clean(row["Disposition"]).toLowerCase();
  const status = clean(row.Status).toLowerCase();

  return (
    internetStatus.includes("cancel") ||
    disposition.includes("cancel") ||
    status.includes("cancel")
  );
}

function makeDedupeKey(row, phone, email) {
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  const cleanedEmail = clean(email).toLowerCase();
  const cleanedName = clean(row["Customer Name"]).toLowerCase();

  return `${phoneDigits}|${cleanedEmail}|${cleanedName}`;
}

export function formatRowsForGoGo(rawRows) {
  const seen = new Set();

  return rawRows
    .map((row) => {
      if (isCanceledRow(row)) {
        return null;
      }

      const customerName = clean(row["Customer Name"]);
      const phone = normalizePhone(row.Phone);
      const email = clean(row.Email);

      if (!customerName && !phone && !email) {
        return null;
      }

      const dedupeKey = makeDedupeKey(row, phone, email);

      if (seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);

      const { firstName, lastName } = splitName(customerName);

      return {
        "Contact ID": "",
        Phone: phone,
        Email: email,
        "First Name": firstName,
        "Last Name": lastName,
        "Business Name": "",
        "Opportunity ID": "",
        "Opportunity name": customerName || email || phone,
        Pipeline: PIPELINE_NAME,
        Stage: STAGE_NAME,
        "Opportunity Value": "",
        Source: clean(row.Campaign) || "AT&T Fiber",
        "Opportunity Owner": OPPORTUNITY_OWNER,
        "Opportunity Followers": "",
        Status: "Open",
        "Lost Reason": "",
        "Additional Emails": "",
        "Additional Phones": "",
        Notes: buildNotes(row),
        Tags: TAGS,
      };
    })
    .filter(Boolean);
}

function getTodayFileDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function downloadCsv(csv, fileName) {
  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadGoGoCsvChunks(formattedRows) {
  const today = getTodayFileDate();
  const baseFileName = `Call Center Leads - ${today}`;
  let filesCreated = 0;

  for (let i = 0; i < formattedRows.length; i += CHUNK_SIZE) {
    const chunk = formattedRows.slice(i, i + CHUNK_SIZE);
    const partNumber = Math.floor(i / CHUNK_SIZE) + 1;
    const csv = Papa.unparse({
      fields: GOGO_HEADERS,
      data: chunk,
    });

    downloadCsv(csv, `${baseFileName} - Part ${partNumber}.csv`);
    filesCreated += 1;
  }

  return filesCreated;
}

export function formatGoGoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file selected."));
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rawRows = results.data || [];
          const formattedRows = formatRowsForGoGo(rawRows);
          const filesCreated = downloadGoGoCsvChunks(formattedRows);

          resolve({
            originalRows: rawRows.length,
            finalRows: formattedRows.length,
            filesCreated,
          });
        } catch (error) {
          console.error("GoGo formatting failed:", error);
          reject(error);
        }
      },
      error: (error) => {
        console.error("GoGo CSV parsing failed:", error);
        reject(error);
      },
    });
  });
}
