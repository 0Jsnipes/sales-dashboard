// Monday as start of week (UTC)
export function startOfWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay() + 6) % 7; // 0=Mon
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}
export const toISO = (d) => d.toISOString().slice(0, 10);
export function addDays(d, n) {
  const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x;
}
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function parseWeekISO(weekISO) {
  const d = new Date(`${weekISO}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}
export function nextWeekISO(weekISO) {
  const d = parseWeekISO(weekISO) ?? startOfWeek();
  return toISO(addDays(d, 7));
}
export function prevWeekISO(weekISO) {
  const d = parseWeekISO(weekISO) ?? startOfWeek();
  return toISO(addDays(d, -7));
}
