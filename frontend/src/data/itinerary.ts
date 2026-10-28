import type { Row } from "./portal.ts";

export function tripDates(start: string, end: string): string[] {
  const date = new Date(start + "T00:00:00Z");
  const finish = new Date(end + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== start ||
    !Number.isFinite(finish.getTime()) ||
    finish.toISOString().slice(0, 10) !== end ||
    start > end
  )
    return [];
  const dates: string[] = [];
  while (date.getTime() <= finish.getTime()) {
    dates.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}
export function orderedItinerary(rows: Row[]): Row[] {
  return [...rows].sort(
    (a, b) =>
      a["日期"].localeCompare(b["日期"]) ||
      Number(a["排序"] || 0) - Number(b["排序"] || 0) ||
      (a["開始時間"] || "").localeCompare(b["開始時間"] || ""),
  );
}
export function insertItinerary(rows: Row[], entry: Row): Row[] {
  const rest = orderedItinerary(
    rows.filter((row) => row["行程ID"] !== entry["行程ID"]),
  );
  const index = entry["開始時間"]
    ? rest.findIndex(
        (row) => row["開始時間"] && row["開始時間"] > entry["開始時間"],
      )
    : -1;
  rest.splice(index < 0 ? rest.length : index, 0, entry);
  return rest;
}
export function moveItinerary(
  rows: Row[],
  id: string,
  index: number,
): { rows: Row[]; conflict: boolean } {
  const ordered = orderedItinerary(rows);
  const from = ordered.findIndex((row) => row["行程ID"] === id);
  if (
    from < 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= ordered.length
  )
    throw Error("無效的行程排序。");
  const [entry] = ordered.splice(from, 1);
  ordered.splice(index, 0, entry);
  const timed = ordered.filter((row) => row["開始時間"]);
  const i = timed.findIndex((row) => row["行程ID"] === id);
  const conflict =
    i >= 0 &&
    ((i > 0 && timed[i - 1]["開始時間"] > entry["開始時間"]) ||
      (i < timed.length - 1 && timed[i + 1]["開始時間"] < entry["開始時間"]));
  return { rows: ordered, conflict };
}
export interface NotePart {
  text: string;
  url?: string;
}
function mapName(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    const host = url.hostname.toLowerCase();
    const google =
      /^(?:www\.|maps\.)?google\.(?:com|com\.tw|co\.jp|co\.uk|[a-z]{2})$/.test(
        host,
      );
    if (
      !(
        (google &&
          (host.startsWith("maps.") || /^\/maps(?:\/|$)/.test(url.pathname))) ||
        host === "maps.app.goo.gl" ||
        (host === "goo.gl" && url.pathname.startsWith("/maps"))
      )
    )
      return;
    const place = url.pathname.match(/\/place\/([^/]+)/)?.[1];
    const name = place
      ? decodeURIComponent(place.replace(/\+/g, " "))
      : url.searchParams.get("query") || url.searchParams.get("q");
    return name && !/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(name)
      ? name
      : "Google Maps";
  } catch {
    return /^https?:\/\/(?:www\.)?google\.com\/maps\//.test(value)
      ? "Google Maps"
      : undefined;
  }
}
export function mapNotes(note: string): NotePart[] {
  const parts: NotePart[] = [];
  let last = 0;
  for (const match of note.matchAll(/https?:\/\/[^\s<>「」『』，。；）]+/g)) {
    const name = mapName(match[0]);
    if (!name) continue;
    const before = note.slice(last, match.index);
    const label =
      name === "Google Maps" &&
      before.trim() &&
      !before.trim().includes("\n") &&
      before.trim().length <= 60
        ? before.trim()
        : name;
    if (before && label === name) parts.push({ text: before });
    parts.push({ text: label, url: match[0] });
    last = match.index + match[0].length;
  }
  if (last < note.length) parts.push({ text: note.slice(last) });
  return parts;
}
export const reorderPreferenceKey = (base: string) =>
  `trip-mate:${base}reorder-no-reminder`;
export function readReorderPreference(
  storage: Pick<Storage, "getItem">,
  base: string,
): boolean {
  try {
    return storage.getItem(reorderPreferenceKey(base)) === "true";
  } catch {
    return false;
  }
}
export function writeReorderPreference(
  storage: Pick<Storage, "setItem">,
  base: string,
  value: boolean,
): boolean {
  try {
    storage.setItem(reorderPreferenceKey(base), String(value));
    return true;
  } catch {
    return false;
  }
}

export function itineraryTags(rows: Row[]): string[] {
  return [
    ...new Set(rows.map((row) => (row["類型"] || "").trim()).filter(Boolean)),
  ];
}
export function matchesItineraryTag(row: Row, tag: string): boolean {
  return !tag || (row["類型"] || "").trim() === tag;
}
export function tripDayNumber(date: string, start: string): number | null {
  const current = new Date(date + "T00:00:00Z"),
    first = new Date(start + "T00:00:00Z");
  if (
    !Number.isFinite(current.getTime()) ||
    !Number.isFinite(first.getTime()) ||
    current.toISOString().slice(0, 10) !== date ||
    first.toISOString().slice(0, 10) !== start
  )
    return null;
  const day = (current.getTime() - first.getTime()) / 86400000 + 1;
  return day >= 1 ? day : null;
}
