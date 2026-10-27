import schema from "./schema.json" with { type: "json" };
import { parseTrip, tripSheets } from "./portal.ts";
import type { Trip, TripData, TripSheetName, Workbook } from "./portal.ts";
import { PortalReadError } from "./portal-api.ts";
import type { PortalRepository } from "./portal-api.ts";

const groups: Record<"accounting" | "itinerary" | "tasks", TripSheetName[]> = {
  accounting: [
    "團員",
    "公積金交易",
    "公積金分攤",
    "支出明細",
    "行前費用分攤",
    "收款明細",
  ],
  itinerary: ["航班", "飯店", "每日行程"],
  tasks: ["團員", "開團待辦"],
};
export async function readTripSections(
  trip: Trip,
  repository: PortalRepository,
  signal?: AbortSignal,
): Promise<TripData> {
  let whole: Workbook | null = null;
  try {
    whole = await repository.read(trip.spreadsheetId, tripSheets, signal);
  } catch (error) {
    if (
      signal?.aborted ||
      error instanceof TypeError ||
      (error instanceof PortalReadError &&
        [401, 403, 429, 500, 502, 503, 504].includes(error.status))
    )
      throw error;
    // A missing/invalid range can break batchGet; retry independent groups.
  }
  const settings = whole
    ? { 旅程設定: whole["旅程設定"] }
    : await repository.read(trip.spreadsheetId, ["旅程設定"], signal);
  const empty: Workbook = Object.fromEntries(
    tripSheets.map((name) => [name, [[...schema[name]]]]),
  );
  const base = parseTrip(trip, { ...empty, ...settings });
  base.sectionErrors = {};
  const results = await Promise.all(
    Object.entries(groups).map(async ([name, sheets]) => {
      try {
        const book = whole
          ? Object.fromEntries(sheets.map((sheet) => [sheet, whole![sheet]]))
          : await repository.read(trip.spreadsheetId, sheets, signal);
        return {
          name,
          data: parseTrip(trip, { ...empty, ...settings, ...book }),
        };
      } catch (error) {
        return { name, error };
      }
    }),
  );
  for (const result of results) {
    if ("error" in result) {
      if (
        signal?.aborted ||
        (result.error instanceof PortalReadError &&
          (result.error.status === 403 || result.error.status === 401))
      )
        throw result.error;
      base.sectionErrors[result.name as keyof typeof groups] =
        result.error instanceof Error ? result.error.message : "資料讀取失敗。";
    } else {
      const data = result.data;
      for (const sheet of groups[result.name as keyof typeof groups])
        base.tables[sheet] = data.tables[sheet];
      if (result.name === "tasks" && base.sectionErrors.accounting)
        base.members = data.members;
      if (result.name === "accounting") {
        base.members = data.members;
        base.transactions = data.transactions;
        base.expenses = data.expenses;
        base.dues = data.dues;
        base.warnings = data.warnings;
      }
    }
  }
  return base;
}
