import { getAdminDb } from "./_lib/firebaseAdmin.js";
import { fetchRosterRows } from "./_lib/mtdSales.js";
import { handleOptions, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    const roster = await fetchRosterRows(db);
    return sendJson(res, 200, {
      count: roster.length,
      roster,
    });
  } catch (error) {
    console.error("Roster API failed", error);
    return sendJson(res, 500, {
      error: error?.message || "Failed to load roster",
    });
  }
}
