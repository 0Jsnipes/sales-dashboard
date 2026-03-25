const NAME_ROW_Y = 507;
const EMAIL_ROW_Y = 317;
const PHONE_ROW_Y = 366;
const SOCIAL_ROW_Y = 365;
const ROW_TOLERANCE = 12;

let pdfjsPromise = null;

const withinRange = (value, target, tolerance = ROW_TOLERANCE) =>
  Math.abs(value - target) <= tolerance;

const sortByX = (a, b) => a.x - b.x;

const normalizeText = (value) => (typeof value === "string" ? value.trim() : "");

const compactSpaces = (value) => normalizeText(value).replace(/\s+/g, " ");

const pickFirst = (values) => values.find(Boolean) || "";

const firstMatch = (value, regex) => value.match(regex)?.[0] || "";

const normalizePhone = (value) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value.trim();
};

const normalizeSocial = (value) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return value.trim();
};

const extractRowItems = (items, targetY, minX = -Infinity, maxX = Infinity) =>
  items
    .filter(
      (item) =>
        withinRange(item.y, targetY) &&
        item.x >= minX &&
        item.x <= maxX &&
        item.text.length > 0
    )
    .sort(sortByX);

const extractNameFromItems = (items) => {
  const first = pickFirst(extractRowItems(items, NAME_ROW_Y, 105, 230).map((item) => item.text));
  const middle = pickFirst(
    extractRowItems(items, NAME_ROW_Y, 230, 270)
      .map((item) => item.text)
      .filter((value) => /^[A-Za-z]\.?$/.test(value))
  );
  const last = pickFirst(extractRowItems(items, NAME_ROW_Y, 270, 370).map((item) => item.text));

  return compactSpaces([first, middle, last].filter(Boolean).join(" "));
};

const fallbackNameFromText = (text) => {
  const pageTwoPrintedName = text.match(/Printed Name\/Agent\s+.+?\s+([A-Za-z]+)\s+([A-Za-z]+)\s+\d{2}\/\d{2}\/\d{4}/is);
  if (pageTwoPrintedName) {
    return compactSpaces(`${pageTwoPrintedName[1]} ${pageTwoPrintedName[2]}`);
  }

  const codeOfConductName = text.match(/Date:\s+\d{2}\/\d{2}\/\d{4}\s+([A-Za-z]+(?:\s+[A-Za-z]+)+)/i);
  return compactSpaces(codeOfConductName?.[1] || "");
};

const ensurePdfjs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
};

export async function extractRosterFieldsFromPdf(file) {
  if (!file) {
    throw new Error("No PDF file provided.");
  }

  const pdfjs = await ensurePdfjs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  try {
    const firstPage = await pdf.getPage(1);
    const content = await firstPage.getTextContent();
    const pageOneItems = content.items
      .map((item) => ({
        text: compactSpaces(item.str || ""),
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
      }))
      .filter((item) => item.text);

    const pageTexts = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const textContent = await page.getTextContent();
      pageTexts.push(
        textContent.items
          .map((item) => compactSpaces(item.str || ""))
          .filter(Boolean)
          .join(" ")
      );
    }
    const fullText = pageTexts.join("\n");

    const email = firstMatch(fullText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phone = pickFirst(extractRowItems(pageOneItems, PHONE_ROW_Y, 110, 330).map((item) => item.text));
    const social = pickFirst(
      extractRowItems(pageOneItems, SOCIAL_ROW_Y, 420, 520).map((item) => item.text)
    );
    const name = extractNameFromItems(pageOneItems) || fallbackNameFromText(fullText);

    return {
      name,
      email: compactSpaces(email),
      phone: normalizePhone(phone || firstMatch(fullText, /(?:\+?1[\s.-]*)?(?:\(\d{3}\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}/)),
      social: normalizeSocial(social || firstMatch(fullText, /\b\d{3}-\d{2}-\d{4}\b/)),
    };
  } finally {
    await pdf.destroy();
  }
}
