export const todayIso = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
export const fmtDate = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const fmtShort = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const spanText = (d: number) => {
  const a = Math.abs(d);
  return a >= 14 ? `${Math.round(a / 7)} weeks` : `${a} day${a === 1 ? "" : "s"}`;
};
export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const kmoney = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1000) return s + "$" + (a / 1000).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return s + money(a);
};
