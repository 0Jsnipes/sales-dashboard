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

const HEX_RADIUS_DEGREES = 0.33;

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

function getHexDistance(pointA, pointB) {
  const [latA, lngA] = pointA;
  const [latB, lngB] = pointB;
  const avgLatRadians = (((latA + latB) / 2) * Math.PI) / 180;
  const latDelta = latA - latB;
  const lngDelta = (lngA - lngB) * Math.cos(avgLatRadians);
  return Math.sqrt(latDelta * latDelta + lngDelta * lngDelta);
}

function getHexIdsNearCenter(center, hexGrid) {
  const [centerLat, centerLng] = center;
  const maxDistance = HEX_RADIUS_DEGREES * 1.8;
  const closeHexes = [];

  for (const hex of hexGrid) {
    const [hexLat, hexLng] = hex.center;
    if (Math.abs(hexLat - centerLat) > maxDistance || Math.abs(hexLng - centerLng) > maxDistance) {
      continue;
    }

    const distance = getHexDistance(center, hex.center);
    if (distance <= maxDistance) {
      closeHexes.push({ id: hex.id, distance });
    }
  }

  if (closeHexes.length > 0) {
    closeHexes.sort((a, b) => a.distance - b.distance);
    return closeHexes.map((hex) => hex.id);
  }

  let nearestHex = null;
  for (const hex of hexGrid) {
    const distance = getHexDistance(center, hex.center);
    if (!nearestHex || distance < nearestHex.distance) {
      nearestHex = { id: hex.id, distance };
    }
  }

  return nearestHex ? [nearestHex.id] : [];
}

async function geocodeZipCode(zipCode) {
  const providers = [
    async () => {
      const endpoint = new URL("https://nominatim.openstreetmap.org/search");
      endpoint.searchParams.set("country", "United States");
      endpoint.searchParams.set("postalcode", zipCode);
      endpoint.searchParams.set("format", "jsonv2");
      endpoint.searchParams.set("limit", "1");

      const response = await fetch(endpoint.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;

      const results = await response.json();
      const match = results?.[0];
      if (!match) return null;

      return [Number(match.lat), Number(match.lon)];
    },
    async () => {
      const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;

      const data = await response.json();
      const place = data?.places?.[0];
      if (!place) return null;

      return [Number(place.latitude), Number(place.longitude)];
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
        return result;
      }
    } catch {
      // ignore and try the next provider
    }
  }

  return null;
}

async function mergeZipCodesIntoMap(zipCodesInput, existingZipMap, hexGrid) {
  const zipCodes = Array.from(
    new Set((zipCodesInput || []).map((zipCode) => extractZip(zipCode)).filter(Boolean))
  );

  if (!zipCodes.length) {
    throw new Error("No valid ZIP codes were provided.");
  }

  const mergedZipMap = { ...(existingZipMap || {}) };
  const failedZipCodes = [];

  for (const zipCode of zipCodes) {
    if (Array.isArray(mergedZipMap[zipCode]) && mergedZipMap[zipCode].length > 0) {
      continue;
    }

    const center = await geocodeZipCode(zipCode);
    if (!center) {
      failedZipCodes.push(zipCode);
      continue;
    }

    const hexIds = getHexIdsNearCenter(center, hexGrid || []);
    if (!hexIds.length) {
      failedZipCodes.push(zipCode);
      continue;
    }

    mergedZipMap[zipCode] = hexIds;
  }

  const allZipCodes = Object.keys(mergedZipMap).sort();
  const highlightedHexIds = Array.from(
    new Set(
      Object.values(mergedZipMap)
        .flat()
        .filter((value) => typeof value === "string")
    )
  );

  return {
    zipCodes,
    allZipCodes,
    highlightedHexIds,
    mergedZipMap,
    failedZipCodes,
  };
}

async function formatAndMapLeads(payload) {
  const workbook = XLSX.read(payload.fileBuffer, {
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
  const extractedZipCodes = rows.map((row) => extractZip(zipColumn ? row[zipColumn] : ""));
  const zipCodes = Array.from(new Set(extractedZipCodes.filter(Boolean)));
  const baseName = buildBaseName(extractedZipCodes, payload.dateStamp);
  const outputType = /\.csv$/i.test(String(payload.fileName || "")) ? "csv" : "xlsx";
  const mappingResult =
    zipCodes.length > 0
      ? await mergeZipCodesIntoMap(zipCodes, payload.existingZipMap, payload.hexGrid)
      : {
          zipCodes: [],
          allZipCodes: Object.keys(payload.existingZipMap || {}).sort(),
          highlightedHexIds: Array.from(
            new Set(
              Object.values(payload.existingZipMap || {})
                .flat()
                .filter((value) => typeof value === "string")
            )
          ),
          mergedZipMap: { ...(payload.existingZipMap || {}) },
          failedZipCodes: [],
        };

  return {
    rows,
    headers,
    zipColumn,
    zipCodes,
    baseName,
    outputType,
    ...mappingResult,
  };
}

async function mapZipCodesOnly(payload) {
  return mergeZipCodesIntoMap(payload.zipCodes || [], payload.existingZipMap, payload.hexGrid);
}

self.onmessage = async (event) => {
  const { id, payload } = event.data || {};

  try {
    const result = payload?.fileBuffer
      ? await formatAndMapLeads(payload)
      : await mapZipCodesOnly(payload);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error?.message || "Worker failed to process leads.",
    });
  }
};
