export const performanceAllowlist = new Set([
  "snipes1995@gmail.com",
  "j.sexton@abenergymarketing.com",
]);

export const rosterViewAllowlist = new Set([
  "snipes1995@gmail.com",
  "j.sexton@abenergymarketing.com",
]);

export const isEmailAllowed = (allowlist, email) => {
  if (!email) return false;
  return allowlist.has(email.toLowerCase());
};
