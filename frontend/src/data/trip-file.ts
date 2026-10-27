import { normalizeTimezone, timezoneForSheets } from "./timezone.ts";
import schema from "./schema.json" with { type: "json" };
import { tripSheets, precision } from "./portal.ts";
import { assertRecordId } from "./record-id.ts";
import { assertGuideSession, DRIVE_FILE_SCOPE } from "./guide-auth.ts";
import type { GuideConfig, GuideSession } from "./guide-auth.ts";

export interface TripFileOptions {
  tripId: string;
  name: string;
  currency: string;
  timezone: string;
  rate: string;
}
export interface CreatedTripFile {
  id: string;
  url: string;
  tripId: string;
}
export class TripFileApiError extends Error {
  status: number;
  constructor(status: number, action: string) {
    super(
      status === 401
        ? "Google 登入已過期（401），請重新登入。"
        : `${action}失敗（${status}）。請確認 Google API 已啟用、授權及帳號政策設定。`,
    );
    this.status = status;
  }
}

export function buildTripFile(options: TripFileOptions) {
  assertRecordId("trip", options.tripId);
  const name = options.name.trim();
  if (!name) throw new Error("請先填寫旅程名稱。");
  const currency = options.currency.trim().toUpperCase();
  if (!currency) throw new Error("請填寫當地幣別，例如 JPY。");
  precision(currency);
  const timezone = normalizeTimezone(options.timezone);
  const rate = Number(options.rate);
  if (!Number.isFinite(rate) || rate <= 0)
    throw new Error("請填寫大於零的匯率（1 台幣＝多少當地幣）。");
  return {
    properties: {
      title: `蕃薯旅遊團｜${name}`,
      locale: "zh_TW",
      timeZone: timezoneForSheets(timezone),
    },
    sheets: tripSheets.map((title, index) => {
      const rows: string[][] = [[...schema[title]]];
      if (title === "旅程設定")
        rows.push([
          "1",
          options.tripId,
          timezone,
          currency,
          "TWD",
          String(rate),
          "",
        ]);
      return {
        properties: {
          sheetId: index + 1,
          title,
          gridProperties: {
            rowCount: 1000,
            columnCount: 26,
            frozenRowCount: 1,
          },
        },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: rows.map((row) => ({
              values: row.map((value) => ({
                userEnteredValue: { stringValue: value },
              })),
            })),
          },
        ],
      };
    }),
  };
}

export async function createTripFile(
  session: GuideSession | null,
  config: GuideConfig,
  options: TripFileOptions,
  fetcher: typeof fetch = fetch,
): Promise<CreatedTripFile> {
  assertGuideSession(session, config);
  const resource = buildTripFile(options);
  let result: Response;
  try {
    result = await fetcher(
      "https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId,spreadsheetUrl",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resource),
      },
    );
  } catch {
    throw new Error(
      "建立結果無法確認，請先到 Google 雲端硬碟查看是否已有新檔案，再決定是否重試。",
    );
  }
  if (!result.ok) throw new TripFileApiError(result.status, "建立試算表");
  let body: unknown;
  try {
    body = await result.json();
  } catch {
    throw new Error("建立結果無法確認，請先到 Google 雲端硬碟查看新檔案。");
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("spreadsheetId" in body) ||
    typeof body.spreadsheetId !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(body.spreadsheetId)
  )
    throw new Error("建立結果無法確認，請先到 Google 雲端硬碟查看新檔案。");
  return {
    id: body.spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${body.spreadsheetId}/edit`,
    tripId: options.tripId,
  };
}

export async function shareTripFile(
  session: GuideSession | null,
  config: GuideConfig,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  assertGuideSession(session, config);
  if (!session.scopes?.includes(DRIVE_FILE_SCOPE))
    throw new Error("請重新登入並同意 Google Drive 檔案授權，再設定共用。");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("無效的試算表 ID。");
  const result = await fetcher(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "anyone",
        role: "reader",
        allowFileDiscovery: false,
      }),
    },
  );
  if (!result.ok) throw new TripFileApiError(result.status, "設定共用");
}

export async function prepareTripFile(
  session: GuideSession | null,
  config: GuideConfig,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  assertGuideSession(session, config);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("無效的試算表 ID。");
  const requests = tripSheets.map((_, index) => ({
    repeatCell: {
      range: { sheetId: index + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  }));
  const result = await fetcher(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );
  if (!result.ok) throw new TripFileApiError(result.status, "設定欄位格式");
}
