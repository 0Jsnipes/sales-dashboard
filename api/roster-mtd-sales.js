import { getAdminDb } from "./_lib/firebaseAdmin.js";
import {
  attachMtdSalesToRoster,
  fetchMtdSalesByRep,
  fetchRosterRows,
} from "./_lib/mtdSales.js";
import { handleOptions, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const db = getAdminDb();
    const [rosterRows, salesByRep] = await Promise.all([
      fetchRosterRows(db),
      fetchMtdSalesByRep(db),
    ]);

    const roster = attachMtdSalesToRoster(rosterRows, salesByRep);
    return sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      monthToDate: true,
      count: roster.length,
      roster,
    });
  } catch (error) {
    console.error("Roster MTD sales API failed", error);
    return sendJson(res, 500, {
      error: error?.message || "Failed to load roster MTD sales",
    });
  }
}
