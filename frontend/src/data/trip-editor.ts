import schema from "./schema.json" with { type: "json" };
import {
  insertItinerary,
  hasItineraryTimeConflict,
  orderedItinerary,
} from "./itinerary.ts";
import rules from "./id-rules.json" with { type: "json" };
import {
  parseTrip,
  tripSheets,
  toMinor,
  precision,
  safeUrl,
} from "./portal.ts";
import type { Trip, TripSheetName, Workbook, Row } from "./portal.ts";
import type { GuideConfig, GuideSession } from "./guide-auth.ts";
import { assertGuideSession, isSuperUser, WRITE_SCOPE } from "./guide-auth.ts";
import {
  assertRecordId,
  nextRecordId,
  nextRecordIdFromRows,
} from "./record-id.ts";
import type { RecordKind } from "./record-id.ts";
import { createPortalRepository } from "./portal-api.ts";
export type EditorScope = "itinerary" | "accounting" | "tasks";
export type BasicSheet = "團員" | "航班" | "飯店" | "每日行程" | "開團待辦";
export type Mode = "add" | "edit" | "delete";
export function isPersonalAmountInput(value: string): boolean {
  return /^-?\d*$/.test(value);
}
export interface ShareInput {
  memberId: string;
  amount: string;
}
export interface ReceiptInput {
  expenseId: string;
  amount: string;
  id: string;
}
export type TripMutation =
  | {
      kind: "record";
      mode: Mode;
      sheet: BasicSheet;
      id?: string;
      values: Row;
      itineraryOrder?: string[];
    }
  | {
      kind: "fund";
      mode: Mode;
      id?: string;
      values: Row;
      shares: ShareInput[];
      expense: Row;
    }
  | {
      kind: "expense";
      mode: Mode;
      id?: string;
      values: Row;
      shares: ShareInput[];
    }
  | {
      kind: "receipt";
      mode: Mode;
      id?: string;
      values: Row;
      allocations: ReceiptInput[];
    };
const scopes: Record<EditorScope, TripSheetName[]> = {
  itinerary: ["航班", "飯店", "每日行程"],
  accounting: [
    "團員",
    "公積金交易",
    "公積金分攤",
    "支出明細",
    "行前費用分攤",
    "收款明細",
  ],
  tasks: ["團員", "開團待辦"],
};
const kinds: Record<BasicSheet, RecordKind> = {
  團員: "member",
  航班: "flight",
  飯店: "hotel",
  每日行程: "itinerary",
  開團待辦: "task",
};
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
export function editorSheets(scope: EditorScope): TripSheetName[] {
  return ["旅程設定", ...scopes[scope]];
}
export function mutationScope(mutation: TripMutation): EditorScope {
  return mutation.kind === "record"
    ? mutation.sheet === "開團待辦"
      ? "tasks"
      : mutation.sheet === "團員"
        ? "accounting"
        : "itinerary"
    : "accounting";
}
export function automaticTripIds(
  book: Workbook,
  mutation: TripMutation,
): TripMutation {
  const next = structuredClone(mutation);
  if (next.mode === "delete") return next;
  const kind =
    next.kind === "record"
      ? kinds[next.sheet]
      : next.kind === "receipt"
        ? "batch"
        : next.kind;
  const rule = rules[kind];
  next.values[rule.column] =
    next.mode === "add"
      ? nextRecordIdFromRows(kind, book[rule.table])
      : next.id || "";
  if (next.kind === "fund" && next.values["類型"] === "支出") {
    const linked = readRows(book, "支出明細").find(
      (row) => row["公積金交易ID"] === next.id,
    );
    next.expense["支出ID"] =
      linked?.["支出ID"] || nextRecordIdFromRows("expense", book["支出明細"]);
  }
  if (next.kind === "receipt") {
    const existing =
      next.mode === "edit"
        ? readRows(book, "收款明細").filter(
            (row) => row["收款批次ID"] === next.id,
          )
        : [];
    const used = readRows(book, "收款明細").map((row) => row["收款明細ID"]);
    for (const allocation of next.allocations) {
      allocation.id =
        existing.find((row) => row["收款明細ID"] === allocation.id)?.[
          "收款明細ID"
        ] ||
        existing.find((row) => row["支出ID"] === allocation.expenseId)?.[
          "收款明細ID"
        ] ||
        nextRecordId("receipt", used);
      used.push(allocation.id);
    }
  }
  return next;
}
export function readRows(book: Workbook, sheet: TripSheetName): Row[] {
  const headers = book[sheet]?.[0]?.map((value) => String(value).trim()) || [];
  return (book[sheet] || [])
    .slice(1)
    .filter((row) => row.some((value) => String(value).trim()))
    .map((row) =>
      Object.fromEntries(
        headers.map((key, index) => [
          key,
          sheet === "每日行程" && key === "內文"
            ? String(row[index] ?? "")
            : String(row[index] ?? "").trim(),
        ]),
      ),
    );
}
export function validateEditorBook(
  trip: Trip,
  book: Workbook,
  scope: EditorScope,
) {
  const empty: Workbook = Object.fromEntries(
    tripSheets.map((name) => [name, [[...schema[name]]]]),
  );
  for (const name of editorSheets(scope)) {
    check(!!book[name], `找不到「${name}」分頁。`);
    empty[name] = book[name];
  }
  return parseTrip(trip, empty);
}
export function minorInput(amount: number, currency: string): string {
  return (amount / 10 ** precision(currency)).toFixed(precision(currency));
}
function rowIndex(
  book: Workbook,
  sheet: TripSheetName,
  key: string,
  id: string,
) {
  const column = book[sheet][0].findIndex(
    (value) => String(value).trim() === key,
  );
  return book[sheet].findIndex(
    (row, index) => index > 0 && String(row[column] ?? "").trim() === id,
  );
}
function put(book: Workbook, sheet: TripSheetName, values: Row, index: number) {
  if (
    sheet === "每日行程" &&
    !book[sheet][0].some((value) => String(value).trim() === "內文")
  )
    book[sheet][0].push("內文");
  if (sheet === "航班" || sheet === "飯店") {
    for (const field of sheet === "航班"
      ? ["出發航廈", "抵達航廈"]
      : [
          "入住時間",
          "退房時間",
          "飯店圖片網址",
          "訂房網站網址",
          "價格",
          "副標題",
        ])
      if (!book[sheet][0].some((value) => String(value).trim() === field))
        book[sheet][0].push(field);
  }
  const headers = book[sheet][0].map((value) => String(value).trim());
  const cells = [...(book[sheet][index] || [])];
  for (const key of schema[sheet])
    cells[headers.indexOf(key)] = values[key] ?? "";
  book[sheet][index] = cells;
}
function sync(
  book: Workbook,
  sheet: TripSheetName,
  match: (row: Row) => boolean,
  desired: Row[],
  key: string,
) {
  const headers = book[sheet][0].map((value) => String(value).trim());
  const locate = (id: string) =>
    book[sheet].findIndex((cells, index) => {
      const row = Object.fromEntries(
        headers.map((field, col) => [field, String(cells[col] ?? "").trim()]),
      );
      return index > 0 && match(row) && row[key] === id;
    });
  const existing = readRows(book, sheet).filter(match),
    desiredKeys = new Set(desired.map((row) => row[key]));
  check(
    desiredKeys.size === desired.length,
    "同一筆操作不可重複選擇相同項目或團員。",
  );
  for (const row of existing)
    if (!desiredKeys.has(row[key])) book[sheet][locate(row[key])] = [];
  for (const row of desired) {
    const found = existing.find((item) => item[key] === row[key]);
    put(book, sheet, row, found ? locate(found[key]) : book[sheet].length);
  }
}
function erase(
  book: Workbook,
  sheet: TripSheetName,
  match: (row: Row) => boolean,
) {
  const headers = book[sheet][0].map((value) => String(value).trim());
  book[sheet] = book[sheet].map((row, index) =>
    index > 0 &&
    match(
      Object.fromEntries(
        headers.map((key, col) => [key, String(row[col] ?? "").trim()]),
      ),
    )
      ? []
      : row,
  );
}
function identifier(
  book: Workbook,
  sheet: TripSheetName,
  kind: RecordKind,
  mode: Mode,
  id: string | undefined,
  values: Row,
) {
  const key = rules[kind].column;
  const value =
    mode === "add"
      ? values[key]?.trim() || nextRecordIdFromRows(kind, book[sheet])
      : id || "";
  assertRecordId(kind, value);
  if (mode === "add")
    check(
      rowIndex(book, sheet, key, value) < 1,
      `${value} 已被使用，請修改 ID。`,
    );
  else {
    check(
      rowIndex(book, sheet, key, value) > 0,
      "找不到要編輯的資料，請重新讀取。",
    );
    check(!values[key] || values[key] === value, "既有 ID 不可變更。");
  }
  return value;
}
export function mutateTripBook(
  trip: Trip,
  before: Workbook,
  mutation: TripMutation,
): Workbook {
  const book = structuredClone(before),
    scope = mutationScope(mutation);
  const settings = readRows(book, "旅程設定")[0],
    currency = settings["記帳幣別"];
  if (mutation.kind === "record") {
    const { sheet, mode } = mutation,
      kind = kinds[sheet],
      key = rules[kind].column;
    const id = identifier(
      book,
      sheet,
      kind,
      mode,
      mutation.id,
      mutation.values,
    );
    if (mode === "delete") {
      const refs: Partial<Record<BasicSheet, [TripSheetName, string][]>> = {
        團員: [
          ["公積金分攤", "團員ID"],
          ["行前費用分攤", "團員ID"],
          ["收款明細", "團員ID"],
          ["開團待辦", "負責團員ID"],
        ],
        航班: [["每日行程", "航班ID"]],
        飯店: [["每日行程", "住宿ID"]],
      };
      for (const [table, field] of refs[sheet] || []) {
        check(!!book[table], `無法確認「${table}」的引用，不能刪除。`);
        check(
          !readRows(book, table).some((row) => row[field] === id),
          `資料仍被「${table}」引用，請先處理關聯。`,
        );
      }
      erase(book, sheet, (row) => row[key] === id);
    } else {
      const values = { ...mutation.values, [key]: id };
      if (sheet === "每日行程") {
        check(
          values["日期"] >= trip.start && values["日期"] <= trip.end,
          "請選擇旅程日期範圍內的日期。",
        );
        const existing = readRows(book, sheet);
        const previous = existing.find((row) => row[key] === id);
        const sameDay = existing.filter(
          (row) => row["日期"] === values["日期"],
        );
        let ordered: Row[];
        if (mutation.itineraryOrder) {
          const ids = mutation.itineraryOrder;
          const rest = orderedItinerary(
            sameDay.filter((row) => row[key] !== id),
          );
          check(
            mode === "edit" &&
              !!previous &&
              ids.length === rest.length + 1 &&
              new Set(ids).size === ids.length &&
              ids.includes(id) &&
              rest.every((row) => ids.includes(row[key])),
            "行程排序資料已變更，請重新讀取。",
          );
          check(
            ids
              .filter((item) => item !== id)
              .every((item, index) => rest[index][key] === item),
            "每次只能調整一筆行程的排序。",
          );
          ordered = ids.map((item) =>
            item === id ? values : rest.find((row) => row[key] === item)!,
          );
          check(
            !hasItineraryTimeConflict(ordered, id),
            "調整後時間順序不符，請確認移除時間後再排序。",
          );
          if (previous!["日期"] !== values["日期"]) {
            orderedItinerary(
              existing.filter(
                (row) => row["日期"] === previous!["日期"] && row[key] !== id,
              ),
            ).forEach((row, index) => {
              put(
                book,
                sheet,
                { ...row, 排序: String((index + 1) * 10) },
                rowIndex(book, sheet, key, row[key]),
              );
            });
          }
        } else if (
          previous &&
          previous["日期"] === values["日期"] &&
          previous["開始時間"] === (values["開始時間"] || "")
        ) {
          ordered = orderedItinerary(
            sameDay.map((row) => (row[key] === id ? values : row)),
          );
        } else {
          ordered = insertItinerary(sameDay, values);
        }
        ordered.forEach((row, index) => {
          row["排序"] = String((index + 1) * 10);
          if (row[key] === id) values["排序"] = row["排序"];
          else put(book, sheet, row, rowIndex(book, sheet, key, row[key]));
        });
      }
      for (const [field, value] of Object.entries(values))
        if (field.endsWith("網址") && value)
          check(!!safeUrl(value), `${field} 須為 http 或 https 網址。`);
      put(
        book,
        sheet,
        values,
        mode === "add" ? book[sheet].length : rowIndex(book, sheet, key, id),
      );
    }
  } else if (mutation.kind === "fund") {
    const id = identifier(
      book,
      "公積金交易",
      "fund",
      mutation.mode,
      mutation.id,
      mutation.values,
    );
    const linked = readRows(book, "支出明細").find(
      (row) => row["公積金交易ID"] === id,
    );
    if (mutation.mode === "delete") {
      erase(book, "公積金交易", (row) => row["交易ID"] === id);
      erase(book, "公積金分攤", (row) => row["交易ID"] === id);
      erase(book, "支出明細", (row) => row["公積金交易ID"] === id);
    } else {
      const type = mutation.values["類型"];
      check(mutation.shares.length > 0, "請至少選擇一位團員。");
      const shares = mutation.shares.map((share) => {
        let amount = "";
        if (type !== "支出") {
          const minor = toMinor(share.amount, currency);
          check(type === "調整" || minor > 0, "個人金額須大於零。");
          amount = minorInput(type === "退款" ? -minor : minor, currency);
        }
        return { 交易ID: id, 團員ID: share.memberId, 個人金額: amount };
      });
      const total =
        type === "支出"
          ? -toMinor(mutation.values["記帳金額"], currency)
          : shares.reduce(
              (sum, row) => sum + toMinor(row["個人金額"], currency),
              0,
            );
      check(type !== "支出" || total < 0, "實際支出金額須大於零。");
      const values: Row = {
        ...mutation.values,
        交易ID: id,
        記帳金額: minorInput(total, currency),
      };
      put(
        book,
        "公積金交易",
        values,
        mutation.mode === "add"
          ? book["公積金交易"].length
          : rowIndex(book, "公積金交易", "交易ID", id),
      );
      sync(book, "公積金分攤", (row) => row["交易ID"] === id, shares, "團員ID");
      if (type === "支出") {
        const expenseId =
          linked?.["支出ID"] ||
          identifier(
            book,
            "支出明細",
            "expense",
            "add",
            undefined,
            mutation.expense,
          );
        check(
          !linked ||
            !mutation.expense["支出ID"] ||
            mutation.expense["支出ID"] === expenseId,
          "既有支出 ID 不可變更。",
        );
        put(
          book,
          "支出明細",
          {
            ...mutation.expense,
            支出ID: expenseId,
            日期: values["日期"],
            項目: values["項目"],
            金額: minorInput(-total, currency),
            幣別: currency,
            支付方式: "公積金",
            公積金交易ID: id,
          },
          linked
            ? rowIndex(book, "支出明細", "支出ID", expenseId)
            : book["支出明細"].length,
        );
      } else erase(book, "支出明細", (row) => row["公積金交易ID"] === id);
    }
  } else if (mutation.kind === "expense") {
    const id = identifier(
      book,
      "支出明細",
      "expense",
      mutation.mode,
      mutation.id,
      mutation.values,
    );
    const existing = readRows(book, "支出明細").find(
      (row) => row["支出ID"] === id,
    );
    check(
      !existing || existing["支付方式"] === "行前收款",
      "公積金費用請從公積金交易編輯。",
    );
    const receipts = readRows(book, "收款明細").filter(
      (row) => row["支出ID"] === id,
    );
    if (mutation.mode === "delete") {
      check(!receipts.length, "此項已有收款，請先處理收款紀錄再刪除。");
      erase(book, "支出明細", (row) => row["支出ID"] === id);
      erase(book, "行前費用分攤", (row) => row["支出ID"] === id);
    } else {
      for (const receipt of receipts)
        check(
          mutation.shares.some((share) => share.memberId === receipt["團員ID"]),
          "已有收款的團員不能直接移除，請先處理收款。",
        );
      put(
        book,
        "支出明細",
        {
          ...mutation.values,
          支出ID: id,
          幣別: "TWD",
          支付方式: "行前收款",
          公積金交易ID: "",
        },
        mutation.mode === "add"
          ? book["支出明細"].length
          : rowIndex(book, "支出明細", "支出ID", id),
      );
      sync(
        book,
        "行前費用分攤",
        (row) => row["支出ID"] === id,
        mutation.shares.map((share) => ({
          支出ID: id,
          團員ID: share.memberId,
          應繳金額: share.amount,
        })),
        "團員ID",
      );
    }
  } else {
    const batch =
      mutation.mode === "add"
        ? mutation.values["收款批次ID"]?.trim() ||
          nextRecordId(
            "batch",
            readRows(book, "收款明細").map((row) => row["收款批次ID"]),
          )
        : mutation.id || "";
    assertRecordId("batch", batch);
    const existing = readRows(book, "收款明細").filter(
      (row) => row["收款批次ID"] === batch,
    );
    check(
      mutation.mode === "add" ? !existing.length : !!existing.length,
      mutation.mode === "add" ? "收款批次 ID 已被使用。" : "找不到此收款批次。",
    );
    check(
      mutation.mode === "add" ||
        !mutation.values["收款批次ID"] ||
        mutation.values["收款批次ID"] === batch,
      "既有收款批次 ID 不可變更。",
    );
    if (mutation.mode === "delete")
      erase(book, "收款明細", (row) => row["收款批次ID"] === batch);
    else {
      check(mutation.allocations.length > 0, "請至少選擇一個收款項目。");
      check(
        new Set(mutation.allocations.map((row) => row.expenseId)).size ===
          mutation.allocations.length,
        "同批次不可重複選擇同一費用。",
      );
      const used = readRows(book, "收款明細").map((row) => row["收款明細ID"]);
      const rows = mutation.allocations.map((allocation) => {
        const id = allocation.id?.trim() || nextRecordId("receipt", used);
        assertRecordId("receipt", id);
        check(
          !used.includes(id) ||
            existing.some((row) => row["收款明細ID"] === id),
          "收款明細 ID 已被使用。",
        );
        used.push(id);
        return {
          收款明細ID: id,
          收款批次ID: batch,
          收款日期: mutation.values["收款日期"],
          團員ID: mutation.values["團員ID"],
          支出ID: allocation.expenseId,
          實收金額: allocation.amount,
          備註: mutation.values["備註"] || "",
        };
      });
      sync(
        book,
        "收款明細",
        (row) => row["收款批次ID"] === batch,
        rows,
        "收款明細ID",
      );
    }
  }
  validateEditorBook(trip, book, scope);
  return book;
}
export interface SheetGrid {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}
export function buildCellUpdates(
  before: Workbook,
  next: Workbook,
  grids: SheetGrid[],
) {
  const requests: unknown[] = [];
  for (const sheet of Object.keys(next) as TripSheetName[]) {
    if (JSON.stringify(before[sheet]) === JSON.stringify(next[sheet])) continue;
    const grid = grids.find((item) => item.title === sheet);
    check(grid, `找不到「${sheet}」的工作表資訊。`);
    const rows = next[sheet],
      height = Math.max(rows.length, before[sheet]?.length || 0),
      width = Math.max(
        ...rows.map((row) => row.length),
        ...before[sheet].map((row) => row.length),
      );
    if (height > grid!.rowCount)
      requests.push({
        appendDimension: {
          sheetId: grid!.sheetId,
          dimension: "ROWS",
          length: height - grid!.rowCount,
        },
      });
    if (width > grid!.columnCount)
      requests.push({
        appendDimension: {
          sheetId: grid!.sheetId,
          dimension: "COLUMNS",
          length: width - grid!.columnCount,
        },
      });
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const original = String(before[sheet]?.[row]?.[col] ?? ""),
          value = String(rows[row]?.[col] ?? "");
        if (original === value) continue;
        if (
          sheet === "每日行程" &&
          row > 0 &&
          String(rows[0][col]).trim() === "類型" &&
          value
        ) {
          // Legacy templates restricted this column to a fixed category list.
          // Tags now allow any text; clear only the edited cell's validation.
          requests.push({
            setDataValidation: {
              range: {
                sheetId: grid!.sheetId,
                startRowIndex: row,
                endRowIndex: row + 1,
                startColumnIndex: col,
                endColumnIndex: col + 1,
              },
            },
          });
        }
        requests.push({
          updateCells: {
            start: { sheetId: grid!.sheetId, rowIndex: row, columnIndex: col },
            rows: [{ values: [{ userEnteredValue: { stringValue: value } }] }],
            fields: "userEnteredValue",
          },
        });
      }
  }
  return requests;
}
export class TripEditApiError extends Error {
  status: number;
  constructor(status: number) {
    super(
      status === 401
        ? "Google 登入已過期，請重新登入。"
        : status === 403
          ? "Google 拒絕編輯，請確認此帳號有本趟旅程的編輯權限。"
          : `Google 操作失敗（${status}），請重新讀取確認資料。`,
    );
    this.status = status;
  }
}
export interface EditorSnapshot {
  book: Workbook;
  grids: SheetGrid[];
}
function fingerprint(value: unknown) {
  return JSON.stringify(value);
}
export function createTripEditor(
  trip: Trip,
  scope: EditorScope,
  config: GuideConfig,
  fetcher: typeof fetch = fetch,
) {
  async function request(
    session: GuideSession | null,
    url: string,
    init?: RequestInit,
  ) {
    assertGuideSession(session, config);
    check(
      session.scopes?.includes(WRITE_SCOPE),
      "請重新登入並同意試算表編輯授權。",
    );
    const response = await fetcher(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${session.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new TripEditApiError(response.status);
    return response;
  }
  async function read(session: GuideSession | null): Promise<EditorSnapshot> {
    check(/^[A-Za-z0-9_-]+$/.test(trip.spreadsheetId), "無效的旅程試算表 ID。");
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${trip.spreadsheetId}`;
    const [values, properties] = await Promise.all([
      (async () => {
        // Reuse response validation, but authenticate every actual request.
        const repository = createPortalRepository("", async (url, init) => {
          const target = new URL(String(url));
          target.searchParams.delete("key");
          return request(session, target.href, init);
        });
        return repository.read(trip.spreadsheetId, editorSheets(scope));
      })(),
      request(
        session,
        base +
          "?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))",
      ).then((response) => response.json()),
    ]);
    check(
      properties && Array.isArray(properties.sheets),
      "Google 工作表資訊格式不正確。",
    );
    const grids: SheetGrid[] = properties.sheets
      .filter((sheet: { properties?: { title?: string } }) =>
        editorSheets(scope).includes(sheet?.properties?.title as TripSheetName),
      )
      .map(
        (sheet: {
          properties: {
            sheetId: number;
            title: string;
            gridProperties: { rowCount: number; columnCount: number };
          };
        }) => {
          const props = sheet?.properties;
          check(
            props &&
              Number.isInteger(props.sheetId) &&
              props.sheetId >= 0 &&
              typeof props.title === "string" &&
              Number.isInteger(props.gridProperties?.rowCount) &&
              Number.isInteger(props.gridProperties?.columnCount) &&
              props.gridProperties.rowCount > 0 &&
              props.gridProperties.columnCount > 0,
            "Google 工作表資訊格式不正確。",
          );
          return {
            sheetId: props.sheetId,
            title: props.title,
            ...props.gridProperties,
          };
        },
      );
    check(
      editorSheets(scope).every((name) =>
        grids.some((grid) => grid.title === name),
      ),
      "工作表資訊不完整，請重新讀取。",
    );
    validateEditorBook(trip, values, scope);
    return { book: values, grids };
  }
  return {
    read,
    async save(
      session: GuideSession | null,
      before: EditorSnapshot,
      mutation: TripMutation,
    ): Promise<EditorSnapshot> {
      assertGuideSession(session, config);
      check(mutationScope(mutation) === scope, "此操作不屬於目前編輯範圍。");
      const current = await read(session);
      check(
        fingerprint(current) === fingerprint(before),
        "資料已在其他地方更新，請關閉編輯並重新讀取後再修改。",
      );
      let book = current.book;
      if (
        mutation.kind === "record" &&
        mutation.sheet === "團員" &&
        mutation.mode === "delete"
      ) {
        const source = createPortalRepository("", async (url, init) => {
          const target = new URL(String(url));
          target.searchParams.delete("key");
          return request(session, target.href, init);
        });
        const refs = await source.read(trip.spreadsheetId, ["開團待辦"]);
        check(
          schema["開團待辦"].every((field) =>
            refs["開團待辦"]?.[0]?.some(
              (value) => String(value).trim() === field,
            ),
          ),
          "無法確認開團待辦引用，不能刪除團員。",
        );
        check(
          !readRows(refs, "開團待辦").some(
            (row) => row["負責團員ID"] === mutation.id,
          ),
          "團員仍被開團待辦引用，不能刪除。",
        );
        book = { ...book, ...refs };
      }
      const next = mutateTripBook(
          trip,
          book,
          isSuperUser(session, config)
            ? mutation
            : automaticTripIds(book, mutation),
        ),
        requests = buildCellUpdates(book, next, current.grids);
      if (requests.length) {
        try {
          await request(
            session,
            `https://sheets.googleapis.com/v4/spreadsheets/${trip.spreadsheetId}:batchUpdate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requests }),
            },
          );
        } catch (error) {
          if (error instanceof TripEditApiError) throw error;
          throw new Error(
            "儲存結果無法確認，請關閉表單並重新讀取。不要直接重送，以免重複記帳。",
          );
        }
      }
      // Refresh after the write, including changed grid dimensions and calculated values.
      try {
        return await read(session);
      } catch {
        throw new Error(
          "資料已送出儲存，但重新讀取失敗。請關閉表單並重新讀取後確認，勿重複儲存。",
        );
      }
    },
  };
}
