import type { Row } from "./portal.ts";
import { safeUrl } from "./portal.ts";

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
  return { rows: ordered, conflict: hasItineraryTimeConflict(ordered, id) };
}
export function hasItineraryTimeConflict(ordered: Row[], id: string): boolean {
  const timed = ordered.filter((row) => row["開始時間"]);
  const i = timed.findIndex((row) => row["行程ID"] === id);
  return (
    i >= 0 &&
    ((i > 0 && timed[i - 1]["開始時間"] > timed[i]["開始時間"]) ||
      (i < timed.length - 1 && timed[i + 1]["開始時間"] < timed[i]["開始時間"]))
  );
}
export function moveItineraryToDay(
  rows: Row[],
  id: string,
  date: string,
  index: number,
): { rows: Row[]; conflict: boolean } {
  const entry = rows.find((row) => row["行程ID"] === id);
  const ordered = orderedItinerary(
    rows.filter((row) => row["日期"] === date && row["行程ID"] !== id),
  );
  if (!entry || !Number.isInteger(index) || index < 0 || index > ordered.length)
    throw Error("無效的行程排序。");
  ordered.splice(index, 0, { ...entry, 日期: date });
  return { rows: ordered, conflict: hasItineraryTimeConflict(ordered, id) };
}
export interface NotePart {
  text: string;
  url?: string;
  kind?: "map" | "external";
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
  return splitNoteLinks(note, false);
}
export function noteLinks(note: string): NotePart[] {
  return splitNoteLinks(note, true);
}
function splitNoteLinks(note: string, includeExternal: boolean): NotePart[] {
  const parts: NotePart[] = [];
  let last = 0;
  for (const match of note.matchAll(/https?:\/\/[^\s<>「」『』，。；）]+/g)) {
    const url = match[0].replace(/[.,;!?]+$/, "");
    const name = mapName(url);
    if (!name && (!includeExternal || !safeUrl(url))) continue;
    const before = note.slice(last, match.index);
    if (before) parts.push({ text: before });
    parts.push({
      text: name || "開啟連結",
      url,
      ...(includeExternal
        ? { kind: name ? ("map" as const) : ("external" as const) }
        : {}),
    });
    last = match.index + url.length;
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
    ...new Set(
      rows.flatMap((row) =>
        (row["類型"] || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ),
  ];
}
export function appendItineraryTag(value: string, selected: string): string {
  const tag = selected.trim();
  const current = itineraryTags([{ 類型: value }]);
  if (!tag || tag.includes(",") || current.includes(tag)) return value;
  return [...current, tag].join(",");
}
export function matchesItineraryTag(row: Row, tag: string): boolean {
  return !tag || itineraryTags([row]).includes(tag);
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

/** Compact local calendar labels for daily itinerary controls; never changes ISO data. */
export function itineraryDateText(
  date: string,
  start: string,
  end: string,
): string {
  if (tripDayNumber(date, date) === null) return date;
  const local = new Date(date + "T00:00:00Z");
  const sameYear =
    start.slice(0, 4) === end.slice(0, 4) &&
    date.slice(0, 4) === start.slice(0, 4);
  const calendar = `${sameYear ? "" : date.slice(0, 4) + "/"}${local.getUTCMonth() + 1}/${local.getUTCDate()}`;
  return `${calendar}(${["日", "一", "二", "三", "四", "五", "六"][local.getUTCDay()]})`;
}
export function itineraryDateLabel(
  date: string,
  start: string,
  end: string,
): string {
  const day = tripDayNumber(date, start);
  return `${day === null ? "" : `D${day} - `}${itineraryDateText(date, start, end)}`;
}

export function itinerarySubtitle(row: Row): string {
  return [row["說明"], row["地點"], row["地圖網址"]].filter(Boolean).join("\n");
}
export function hasItineraryBody(row: Row): boolean {
  return !!row["內文"]?.trim();
}
