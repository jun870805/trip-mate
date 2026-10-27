import type { Workbook } from "./portal.ts";

export class PortalReadError extends Error {
  status: number;
  accessDenied: boolean;
  constructor(status: number, accessDenied = false) {
    super(
      `Google Sheets 讀取失敗（${status}）。請檢查 API Key、分頁名稱與共用權限，再重新讀取。`,
    );
    this.status = status;
    this.accessDenied = accessDenied;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// A 403 alone may mean an invalid API key, API restriction or exhausted quota.
// Only the standard file permission denial is treated as unavailable to visitors.
function filePermissionDenied(body: unknown): boolean {
  if (!isRecord(body) || !isRecord(body.error)) return false;
  const error = body.error;
  return (
    error.code === 403 &&
    error.status === "PERMISSION_DENIED" &&
    typeof error.message === "string" &&
    /^The caller does not have permission\.?$/i.test(error.message.trim()) &&
    (error.details === undefined ||
      (Array.isArray(error.details) && error.details.length === 0)) &&
    (error.errors === undefined ||
      (Array.isArray(error.errors) &&
        error.errors.every(
          (entry) => isRecord(entry) && entry.reason === "forbidden",
        )))
  );
}

export interface PortalRepository {
  read(
    spreadsheetId: string,
    sheets: string[],
    signal?: AbortSignal,
  ): Promise<Workbook>;
}
export function createPortalRepository(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): PortalRepository {
  return {
    async read(spreadsheetId, sheets, signal) {
      const url = new URL(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`,
      );
      url.searchParams.set("key", apiKey);
      url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
      url.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
      for (const sheet of sheets)
        url.searchParams.append(
          "ranges",
          `'${sheet.replaceAll("'", "''")}'!A:Z`,
        );
      const response = await fetcher(url, { signal, cache: "no-store" });
      if (!response.ok) {
        let accessDenied = false;
        if (response.status === 403) {
          try {
            accessDenied = filePermissionDenied(await response.json());
          } catch {
            /* An unreadable error body does not establish a file permission denial. */
          }
        }
        throw new PortalReadError(response.status, accessDenied);
      }
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("valueRanges" in body) ||
        !Array.isArray(body.valueRanges) ||
        body.valueRanges.length !== sheets.length
      )
        throw new Error("Google Sheets 回傳分頁資料不完整。");
      const valueRanges: unknown[] = body.valueRanges;
      return Object.fromEntries(
        sheets.map((sheet, i) => {
          const part: unknown = valueRanges[i];
          if (!part || typeof part !== "object")
            throw new Error("Google Sheets 回傳格式不正確。");
          const rows: unknown = "values" in part ? part.values : [];
          if (
            !Array.isArray(rows) ||
            !rows.every(
              (row) =>
                Array.isArray(row) &&
                row.every((cell) =>
                  ["string", "number", "boolean"].includes(typeof cell),
                ),
            )
          )
            throw new Error("Google Sheets 回傳儲存格格式不正確。");
          return [sheet, rows];
        }),
      );
    },
  };
}
