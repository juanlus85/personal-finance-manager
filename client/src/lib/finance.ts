export const SPAIN_TIMEZONE = "Europe/Madrid";

export function currentMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SPAIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  return `${year}-${month}`;
}

export function previousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function readableMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: SPAIN_TIMEZONE })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)))
    .replace(/^./, letter => letter.toUpperCase());
}

export function formatMoney(value: number | string | null | undefined, currency = "EUR") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: SPAIN_TIMEZONE })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function isoToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SPAIN_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (kind: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === kind)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
