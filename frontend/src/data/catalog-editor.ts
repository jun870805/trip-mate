import schema from "./schema.json" with { type: "json" };
import { parseCatalog, safeUrl } from "./portal.ts";
import type { Row } from "./portal.ts";
import type { SheetRows } from "./sheets.ts";
import { assertGuideSession } from "./guide-auth.ts";
import type { GuideConfig, GuideSession } from "./guide-auth.ts";
import { nextRecordIdFromRows } from "./record-id.ts";

export type CatalogMutation =
  | { kind: "add"; draft: Row }
  | { kind: "edit"; id: string; draft: Row }
  | { kind: "delete"; id: string };
export class CatalogConflictError extends Error {
  rows: SheetRows;
  constructor(rows: SheetRows) {
    super("旅程清單已更新，請比較最新資料後再儲存。");
    this.rows = rows;
  }
}
export class GuideApiError extends Error {
  status: number;
  constructor(status: number) {
    super(
      status === 401
        ? "Google 登入已過期（401），請重新登入。"
        : status === 403
          ? "Google 拒絕編輯（403）。請確認此帳號有旅程目錄的編輯權限，且已同意試算表授權。"
          : `Google 試算表操作失敗（${status}），請重新讀取以確認目前資料。`,
    );
    this.status = status;
  }
}
export function spreadsheetIdFromInput(input: string): string {
  const value = input.trim();
  const id =
    value.match(
      /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|\?|#|$)/,
    )?.[1] || value;
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new Error("請輸入有效的 Google 試算表 ID 或網址。");
  return id;
}
export function validateCatalogDraft(draft: Row): Row {
  const clean = Object.fromEntries(
    schema["旅程清單"].map((key) => [key, (draft[key] || "").trim()]),
  );
  clean["試算表ID"] = spreadsheetIdFromInput(clean["試算表ID"]);
  if (clean["封面圖片網址"] && !safeUrl(clean["封面圖片網址"]))
    throw new Error("封面圖片須為 http 或 https 網址。");
  parseCatalog([
    schema["旅程清單"],
    schema["旅程清單"].map((key) => clean[key]),
  ]);
  return clean;
}
function fingerprint(rows: SheetRows): string {
  const normalized = rows.map((row) => {
    const values = row.map((value) => String(value).trim());
    while (values.length && values.at(-1) === "") values.pop();
    return values;
  });
  while (normalized.length && !normalized.at(-1)!.length) normalized.pop();
  return JSON.stringify(normalized);
}
function column(index: number): string {
  let value = "";
  let i = index;
  while (i > 0) {
    i--;
    value = String.fromCharCode(65 + (i % 26)) + value;
    i = Math.floor(i / 26);
  }
  return value;
}
export function createCatalogEditor(
  catalogId: string,
  config: GuideConfig,
  fetcher: typeof fetch = fetch,
) {
  return {
    async save(
      session: GuideSession | null,
      before: SheetRows,
      mutation: CatalogMutation,
    ): Promise<SheetRows> {
      assertGuideSession(session, config);
      if (!catalogId) throw new Error("尚未設定旅程目錄 ID。");
      parseCatalog(before);
      const headers = before[0].map((v) => String(v).trim());
      const idColumn = headers.indexOf("旅程ID");
      const next = before.map((row) => [...row]);
      const rowIndex =
        mutation.kind === "add"
          ? next.length
          : next.findIndex(
              (row, i) => i > 0 && String(row[idColumn]).trim() === mutation.id,
            );
      if (mutation.kind !== "add" && rowIndex < 1)
        throw new Error("找不到要編輯的旅程，請重新讀取。");
      const original = next[rowIndex] || [];
      const values = Array.from(
        { length: Math.max(headers.length, original.length) },
        (_, i) => original[i] ?? "",
      );
      if (mutation.kind === "delete") values.fill("");
      else {
        const clean = validateCatalogDraft(
          mutation.kind === "add"
            ? {
                ...mutation.draft,
                旅程ID:
                  mutation.draft["旅程ID"]?.trim() ||
                  nextRecordIdFromRows("trip", before),
              }
            : mutation.draft,
        );
        if (mutation.kind === "edit" && clean["旅程ID"] !== mutation.id)
          throw new Error("既有旅程 ID 不可變更。");
        for (const [key, value] of Object.entries(clean))
          values[headers.indexOf(key)] = value;
      }
      next[rowIndex] = values;
      parseCatalog(next);
      const headersWithAuth = { Authorization: `Bearer ${session.token}` };
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(catalogId)}/values/`;
      const readUrl = new URL(base + encodeURIComponent("'旅程清單'!A:Z"));
      readUrl.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
      readUrl.searchParams.set("dateTimeRenderOption", "FORMATTED_STRING");
      const current = await fetcher(readUrl, {
        headers: headersWithAuth,
        cache: "no-store",
      });
      if (!current.ok) throw new GuideApiError(current.status);
      const body: unknown = await current.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("values" in body) ||
        !Array.isArray(body.values) ||
        !body.values.every(
          (row) =>
            Array.isArray(row) &&
            row.every((value) =>
              ["string", "number", "boolean"].includes(typeof value),
            ),
        )
      )
        throw new Error("Google 回傳的旅程清單格式不正確。");
      if (fingerprint(body.values) !== fingerprint(before))
        throw new CatalogConflictError(body.values as SheetRows);
      assertGuideSession(session, config);
      const range = `'旅程清單'!A${rowIndex + 1}:${column(values.length)}${rowIndex + 1}`;
      const url = new URL(base.slice(0, -1) + ":batchUpdate");
      const data =
        mutation.kind === "edit"
          ? schema["旅程清單"].map((key) => {
              const index = headers.indexOf(key);
              return {
                range: `'旅程清單'!${column(index + 1)}${rowIndex + 1}`,
                values: [[values[index]]],
              };
            })
          : [{ range, values: [values] }];
      const result = await fetcher(url, {
        method: "POST",
        headers: { ...headersWithAuth, "Content-Type": "application/json" },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data,
        }),
      });
      if (!result.ok) throw new GuideApiError(result.status);
      return next;
    },
  };
}
