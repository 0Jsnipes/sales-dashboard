export const normalizeEmail = (email) => (email || "").trim().toLowerCase();

export const performanceAllowlist = new Set(
  ["snipes1995@gmail.com", "j.sexton@abenergymarketing.com"].map(normalizeEmail)
);

export const rosterViewAllowlist = new Set(
  [
    "snipes1995@gmail.com",
    "j.sexton@abenergymarketing.com",
    "Kristin@abenergymarketing.com",
  ].map(normalizeEmail)
);

export const isEmailAllowed = (allowlist, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  return allowlist.has(normalizedEmail);
};
