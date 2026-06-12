import { getAdminAuth, getAdminDb } from "./_lib/firebaseAdmin.js";
import { handleOptions, sendJson } from "./_lib/http.js";

const SUPER_ADMIN_EMAILS = new Set([
  "snipes1995@gmail.com",
  "kunyealogray@gmail.com",
  "j.sexton@abenergymarketing.com",
]);

const ROLE_DEFAULTS = {
  admin: {
    label: "Admin",
    canEditSales: false,
    canEditKnocks: false,
    canEditRoster: false,
    canEditOnboarding: false,
    canEditReps: false,
    canCreateUsers: false,
    canViewPerformance: false,
  },
  manager: {
    label: "Manager",
    canEditSales: false,
    canEditKnocks: false,
    canEditRoster: false,
    canEditOnboarding: true,
    canEditReps: false,
    canCreateUsers: false,
    canViewPerformance: true,
  },
  user: {
    label: "User",
    canEditSales: false,
    canEditKnocks: false,
    canEditRoster: false,
    canEditOnboarding: false,
    canEditReps: false,
    canCreateUsers: false,
    canViewPerformance: true,
  },
};

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeRole(role) {
  const normalized = String(role || "user").trim().toLowerCase();
  return ROLE_DEFAULTS[normalized] ? normalized : "user";
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body;
}

async function requireSuperAdmin(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error("Missing Firebase ID token.");
    error.status = 401;
    throw error;
  }

  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!SUPER_ADMIN_EMAILS.has(normalizeEmail(decoded.email))) {
    const error = new Error("Only super admins can create admin users.");
    error.status = 403;
    throw error;
  }

  return decoded;
}

function toBool(value) {
  return value === true;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return handleOptions(req, res);
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const creator = await requireSuperAdmin(req);
    const body = parseBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const role = normalizeRole(body.role);
    const defaults = ROLE_DEFAULTS[role];
    const team = cleanText(body.team);
    const location = cleanText(body.location);
    const manager = cleanText(body.manager);
    const repName = cleanText(body.repName);
    const repId = cleanText(body.repId);

    if (!email) {
      return sendJson(res, 400, { error: "Email is required." });
    }

    if (password.length < 6) {
      return sendJson(res, 400, { error: "Password must be at least 6 characters." });
    }

    const auth = getAdminAuth();
    const userRecord = await auth.createUser({
      email,
      password,
      emailVerified: false,
      disabled: false,
    });

    const now = new Date();
    const adminProfile = {
      uid: userRecord.uid,
      email,
      role,
      roleLabel: defaults.label,
      team,
      location,
      manager,
      repName,
      repId,
      canEditSales: body.canEditSales === undefined ? defaults.canEditSales : toBool(body.canEditSales),
      canEditKnocks: body.canEditKnocks === undefined ? defaults.canEditKnocks : toBool(body.canEditKnocks),
      canEditRoster: body.canEditRoster === undefined ? defaults.canEditRoster : toBool(body.canEditRoster),
      canEditOnboarding:
        body.canEditOnboarding === undefined
          ? defaults.canEditOnboarding
          : toBool(body.canEditOnboarding),
      canEditReps: body.canEditReps === undefined ? defaults.canEditReps : toBool(body.canEditReps),
      canCreateUsers:
        body.canCreateUsers === undefined ? defaults.canCreateUsers : toBool(body.canCreateUsers),
      canViewPerformance:
        body.canViewPerformance === undefined
          ? defaults.canViewPerformance
          : toBool(body.canViewPerformance),
      createdAt: now,
      createdBy: creator.uid || null,
      updatedAt: now,
      updatedBy: creator.uid || null,
    };

    await getAdminDb().collection("adminUsers").doc(userRecord.uid).set(adminProfile);

    return sendJson(res, 201, {
      uid: userRecord.uid,
      email,
      adminProfile,
    });
  } catch (error) {
    console.error("Create admin user failed", error);

    if (error?.code === "auth/email-already-exists") {
      return sendJson(res, 409, {
        error: "A Firebase Auth user already exists for this email.",
      });
    }

    return sendJson(res, error?.status || 500, {
      error: error?.message || "Failed to create admin user.",
    });
  }
}
