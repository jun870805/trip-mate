const invalidZone = () =>
  new Error(
    "時區格式無效，請輸入 Asia/Tokyo 或 UTC+9、UTC-5、UTC+05:30；固定時差範圍為 UTC-12:00 至 UTC+14:00。",
  );

/** Canonicalize user offsets independently of browser Intl offset support. */
export function normalizeTimezone(input: string): string {
  const value = input.trim();
  const compact = value.replace(/\s/g, "").toUpperCase();
  if (compact === "UTC") return "UTC";
  const offset = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(compact);
  if (offset) {
    const hours = Number(offset[2]);
    const minutes = Number(offset[3] || 0);
    const total = (hours * 60 + minutes) * (offset[1] === "-" ? -1 : 1);
    if (minutes > 59 || total < -720 || total > 840) throw invalidZone();
    if (!total) return "UTC";
    return `UTC${offset[1]}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  // Never pass malformed UTC inputs through to Intl's permissive aliases.
  if (compact.startsWith("UTC") || !value) throw invalidZone();
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    throw invalidZone();
  }
}

export function timezoneForSheets(input: string): string {
  return normalizeTimezone(input).replace(/^UTC([+-])/, "GMT$1");
}

/** Local date for due-date comparisons, including browsers without offset timezones. */
export function dateInTimezone(date: Date, input: string): string {
  const zone = normalizeTimezone(input);
  const fixed = /^UTC([+-])(\d{2}):(\d{2})$/.exec(zone);
  const offset = fixed
    ? (Number(fixed[2]) * 60 + Number(fixed[3])) * (fixed[1] === "-" ? -1 : 1)
    : 0;
  const local = new Date(date.getTime() + offset * 60000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: fixed ? "UTC" : zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(local);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
