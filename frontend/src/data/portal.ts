import { normalizeTimezone, validateFlightTimes } from "./timezone.ts";
import schema from "./schema.json" with { type: "json" };
import type { SheetRows } from "./sheets.ts";
import { assertRecordIds } from "./record-id.ts";

export type Row = Record<string, string>;
export type Workbook = Record<string, SheetRows>;
export type SheetName = keyof typeof schema;
export type TripSheetName = Exclude<SheetName, "旅程清單">;
export const tripSheets = Object.keys(schema).filter(
  (s) => s !== "旅程清單",
) as TripSheetName[];
export interface Trip {
  id: string;
  name: string;
  destination: string;
  start: string;
  end: string;
  spreadsheetId: string;
  status: string;
  cover: string;
  order: number;
}
export interface Member {
  id: string;
  name: string;
  balance: number;
}
export interface Transaction {
  id: string;
  date: string;
  type: string;
  title: string;
  amount: number;
  shares: { memberId: string; amount: number }[];
}
export interface Expense {
  id: string;
  date: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  method: string;
  transactionId: string;
}
export interface Due {
  expenseId: string;
  memberId: string;
  expected: number;
  received: number;
  status: string;
}
export interface TripData {
  trip: Trip;
  currency: string;
  rate: number;
  timezone: string;
  note: string;
  members: Member[];
  transactions: Transaction[];
  expenses: Expense[];
  dues: Due[];
  tables: Record<TripSheetName, Row[]>;
  warnings: string[];
  sectionErrors?: Partial<Record<"accounting" | "itinerary" | "tasks", string>>;
}

function ensure(
  condition: unknown,
  message: string,
  row?: Row,
  field?: string,
): asserts condition {
  if (!condition)
    throw new Error(
      row
        ? `${locations.get(row) || "資料"}${field ? `「${field}」` : ""}：${message}`
        : message,
    );
}
const locations = new WeakMap<Row, string>();
function atField<T>(row: Row, field: string, run: () => T): T {
  try {
    return run();
  } catch (cause) {
    throw new Error(
      `${locations.get(row) || "資料"}「${field}」：${cause instanceof Error ? cause.message : "資料不正確"}`,
    );
  }
}
function amountAt(row: Row, field: string, currency: string) {
  return atField(row, field, () => toMinor(row[field], currency));
}
function required(row: Row, keys: string[], context: string) {
  for (const key of keys)
    ensure(row[key], `${locations.get(row) || context}：「${key}」不可空白。`);
}
function date(value: string) {
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    `日期格式錯誤：${value}，請使用 YYYY-MM-DD。`,
  );
}
function unique(rows: Row[], fields: string[], context: string) {
  const ids = new Set<string>();
  for (const row of rows) {
    required(row, fields, context);
    const id = fields.map((f) => row[f]).join("\u0000");
    ensure(!ids.has(id), `${context}：${fields.join("／")} 重複。`);
    ids.add(id);
  }
}
function table(book: Workbook, name: SheetName): Row[] {
  const cells = book[name];
  ensure(cells?.length, `找不到「${name}」欄位列，請依範本建立分頁。`);
  const headers = cells[0].map((v) => String(v).trim());
  ensure(new Set(headers).size === headers.length, `${name}：欄位名稱重複。`);
  for (const header of schema[name])
    ensure(
      headers.includes(header) ||
        (name === "航班" && ["出發航廈", "抵達航廈"].includes(header)) ||
        (name === "飯店" &&
          [
            "入住時間",
            "退房時間",
            "飯店圖片網址",
            "訂房網站網址",
            "價格",
            "副標題",
          ].includes(header)),
      `${name}：缺少欄位「${header}」。`,
    );
  return cells
    .slice(1)
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((v) => String(v).trim() !== ""))
    .map(({ row, index }) => {
      const result = Object.fromEntries(
        headers.map((h, i) => [h, String(row[i] ?? "").trim()]),
      );
      locations.set(result, `${name} 第 ${index + 2} 列`);
      assertRecordIds(result, `${name} 第 ${index + 2} 列`);
      for (const [key, value] of Object.entries(result)) {
        if (value && key.endsWith("日期"))
          atField(result, key, () => date(value));
        if (
          value &&
          ["開始時間", "結束時間", "入住時間", "退房時間"].includes(key)
        )
          ensure(
            /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
            `${name} 第 ${index + 2} 列時間格式錯誤。`,
          );
      }
      return result;
    });
}
export function precision(currency: string): number {
  ensure(
    Intl.supportedValuesOf("currency").includes(currency),
    `不支援的幣別：${currency}`,
  );
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function toMinor(value: string, currency: string): number {
  const digits = precision(currency);
  ensure(/^-?\d+(\.\d+)?$/.test(value), `金額格式錯誤：${value || "空白"}`);
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  ensure(
    fraction.length <= digits,
    `${currency} 金額不可超過 ${digits} 位小數。`,
  );
  const integer =
    BigInt(whole) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0");
  ensure(
    integer <= BigInt(Number.MAX_SAFE_INTEGER) / 1000n,
    "金額超過可處理範圍。",
  );
  return Number(integer) * (value.startsWith("-") ? -1 : 1);
}
export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 0,
    maximumFractionDigits: precision(currency),
  }).format(minor / 10 ** precision(currency));
}
export function safeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function parseCatalog(cells: SheetRows): Trip[] {
  const rows = table({ 旅程清單: cells }, "旅程清單");
  unique(rows, ["旅程ID"], "旅程清單");
  return rows
    .map((row) => {
      required(
        row,
        ["旅程名稱", "目的地", "開始日期", "結束日期", "試算表ID", "旅程狀態"],
        "旅程清單",
      );
      ensure(
        row["結束日期"] >= row["開始日期"],
        "旅程結束日期不能早於開始日期。",
      );
      ensure(
        ["規劃中", "即將出發", "旅途中", "已結束"].includes(row["旅程狀態"]),
        "旅程狀態不正確。",
      );
      const order = Number(row["排序"] || 0);
      ensure(Number.isFinite(order), "旅程排序必須為數字。");
      return {
        id: row["旅程ID"],
        name: row["旅程名稱"],
        destination: row["目的地"],
        start: row["開始日期"],
        end: row["結束日期"],
        spreadsheetId: row["試算表ID"],
        status: row["旅程狀態"],
        cover: safeUrl(row["封面圖片網址"]) || "",
        order,
      };
    })
    .sort((a, b) => a.order - b.order || b.start.localeCompare(a.start));
}

export function parseTrip(trip: Trip, book: Workbook): TripData {
  const tables = Object.fromEntries(
    tripSheets.map((s) => [s, table(book, s)]),
  ) as Record<TripSheetName, Row[]>;
  ensure(tables["旅程設定"].length === 1, "旅程設定必須恰好一列資料。");
  const settings = tables["旅程設定"][0];
  required(settings, ["預設時區", "記帳幣別", "旅程匯率"], "旅程設定");
  ensure(settings["結構版本"] === "1", "目前僅支援結構版本 1。");
  ensure(settings["旅程ID"] === trip.id, "旅程設定 ID 與入口旅程不一致。");
  ensure(settings["匯率基準幣別"] === "TWD", "匯率基準幣別必須為 TWD。");
  const currency = settings["記帳幣別"];
  atField(settings, "記帳幣別", () => precision(currency));
  const rate = Number(settings["旅程匯率"]);
  ensure(Number.isFinite(rate) && rate > 0, "旅程匯率必須大於零。");
  settings["預設時區"] = atField(settings, "預設時區", () =>
    normalizeTimezone(settings["預設時區"]),
  );
  unique(tables["團員"], ["團員ID"], "團員");
  for (const row of tables["團員"])
    ensure(Number.isFinite(Number(row["排序"] || 0)), "團員排序必須為數字。");
  tables["團員"].sort(
    (a, b) => Number(a["排序"] || 0) - Number(b["排序"] || 0),
  );
  const members: Member[] = tables["團員"].map((row) => {
    required(row, ["顯示名稱"], "團員");
    return { id: row["團員ID"], name: row["顯示名稱"], balance: 0 };
  });
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const warnings: string[] = [];
  const member = (id: string) => {
    const m = memberMap.get(id);
    ensure(m, `找不到團員：${id}`);
    return m;
  };
  const memberAt = (row: Row, field: string) =>
    atField(row, field, () => member(row[field]));
  unique(tables["公積金交易"], ["交易ID"], "公積金交易");
  unique(tables["公積金分攤"], ["交易ID", "團員ID"], "公積金分攤");
  const transactionIds = new Set(tables["公積金交易"].map((t) => t["交易ID"]));
  for (const row of tables["公積金分攤"]) {
    memberAt(row, "團員ID");
    ensure(transactionIds.has(row["交易ID"]), "分攤關聯的交易不存在。");
  }
  const transactions = tables["公積金交易"].map((row) => {
    required(row, ["日期", "類型", "項目", "記帳金額"], "公積金交易");
    const type = row["類型"];
    const amount = amountAt(row, "記帳金額", currency);
    ensure(
      ["儲值", "支出", "退款", "調整"].includes(type),
      "公積金交易類型不正確。",
      row,
      "類型",
    );
    ensure(
      amount !== 0 &&
        (type === "調整" || (type === "儲值" ? amount > 0 : amount < 0)),
      "公積金金額正負號不正確。",
      row,
      "記帳金額",
    );
    if (type === "調整") required(row, ["備註"], "公積金調整");
    const participants = tables["公積金分攤"].filter(
      (s) => s["交易ID"] === row["交易ID"],
    );
    ensure(participants.length, "每筆交易至少需要一位分攤團員。");
    const shares = participants.map((p) => {
      if (type === "支出")
        ensure(
          !p["個人金額"],
          "支出個人金額請留空，由系統依參與者均分並向上取整。",
          p,
          "個人金額",
        );
      const share =
        type === "支出"
          ? -Math.ceil(-amount / participants.length)
          : amountAt(p, "個人金額", currency);
      ensure(
        share !== 0 && Math.sign(share) === Math.sign(amount),
        "分攤金額與交易方向不一致。",
        p,
        "個人金額",
      );
      memberAt(p, "團員ID").balance += share;
      return { memberId: p["團員ID"], amount: share };
    });
    if (type !== "支出")
      ensure(
        shares.reduce((sum, s) => sum + s.amount, 0) === amount,
        "公積金分攤加總與交易金額不一致。",
        row,
        "記帳金額",
      );
    return {
      id: row["交易ID"],
      date: row["日期"],
      type,
      title: row["項目"],
      amount,
      shares,
    };
  });
  for (const m of members)
    if (m.balance < 0)
      warnings.push(
        `${m.name} 公積金餘額不足，尚需補繳 ${money(-m.balance, currency)}。`,
      );

  unique(tables["支出明細"], ["支出ID"], "支出明細");
  const linked = new Set<string>();
  const expenses = tables["支出明細"].map((row) => {
    required(
      row,
      ["日期", "項目", "分類", "金額", "幣別", "支付方式"],
      "支出明細",
    );
    const method = row["支付方式"];
    const transactionId = row["公積金交易ID"];
    ensure(["行前收款", "公積金"].includes(method), "支出支付方式不正確。");
    ensure(
      row["幣別"] === (method === "行前收款" ? "TWD" : currency),
      "行前費用必須為 TWD，公積金費用必須為當地幣別。",
    );
    const amount = amountAt(row, "金額", row["幣別"]);
    ensure(amount > 0, "支出金額必須為正數。");
    if (method === "公積金") {
      const transaction = transactions.find((t) => t.id === transactionId);
      ensure(
        transaction?.type === "支出" && transaction.amount === -amount,
        "公積金支出關聯或金額不一致。",
        row,
        "公積金交易ID",
      );
      ensure(!linked.has(transactionId), "同一筆公積金支出不能重複列入總表。");
      linked.add(transactionId);
    } else ensure(!transactionId, "行前收款不可關聯公積金扣款。");
    return {
      id: row["支出ID"],
      date: row["日期"],
      title: row["項目"],
      category: row["分類"],
      amount,
      currency: row["幣別"],
      method,
      transactionId,
    };
  });
  for (const t of transactions)
    if (t.type === "支出")
      ensure(linked.has(t.id), "公積金支出缺少對應的支出明細，無法核對總表。");
  unique(tables["行前費用分攤"], ["支出ID", "團員ID"], "行前費用分攤");
  const dues: Due[] = tables["行前費用分攤"].map((row) => {
    memberAt(row, "團員ID");
    ensure(
      expenses.some((e) => e.id === row["支出ID"] && e.method === "行前收款"),
      "行前費用分攤關聯的支出不存在或屬於公積金。",
      row,
      "支出ID",
    );
    const expected = amountAt(row, "應繳金額", "TWD");
    ensure(expected > 0, "應繳金額必須為正數。");
    return {
      expenseId: row["支出ID"],
      memberId: row["團員ID"],
      expected,
      received: 0,
      status: "未收",
    };
  });
  for (const e of expenses.filter((e) => e.method === "行前收款"))
    ensure(
      dues
        .filter((d) => d.expenseId === e.id)
        .reduce((s, d) => s + d.expected, 0) === e.amount,
      "行前費用分攤總額與支出不一致。",
    );
  unique(tables["收款明細"], ["收款明細ID"], "收款明細");
  const batches = new Map<string, string>();
  for (const row of tables["收款明細"]) {
    required(
      row,
      ["收款批次ID", "收款日期", "團員ID", "支出ID", "實收金額"],
      "收款明細",
    );
    const due = dues.find(
      (d) => d.expenseId === row["支出ID"] && d.memberId === row["團員ID"],
    );
    ensure(due, "收款明細沒有對應的個人應繳項目。");
    const batch = `${row["團員ID"]}|${row["收款日期"]}`;
    const existing = batches.get(row["收款批次ID"]);
    ensure(
      !existing || existing === batch,
      "同一收款批次必須是同一團員及日期。",
      row,
      "收款批次ID",
    );
    batches.set(row["收款批次ID"], batch);
    const amount = amountAt(row, "實收金額", "TWD");
    ensure(amount > 0, "實收金額必須為正數。");
    due.received += amount;
  }
  for (const d of dues) {
    d.status =
      d.received === 0
        ? "未收"
        : d.received < d.expected
          ? "部分已收"
          : d.received === d.expected
            ? "已收齊"
            : "超收";
    if (d.received > d.expected)
      warnings.push(
        `${member(d.memberId).name} 的行前費用有超收，請核對收款明細。`,
      );
  }
  for (const [name, id] of [
    ["航班", "航班ID"],
    ["飯店", "住宿ID"],
    ["每日行程", "行程ID"],
    ["開團待辦", "任務ID"],
  ] as const)
    unique(tables[name], [id], name);
  for (const row of tables["航班"]) {
    required(
      row,
      ["航空公司", "航班編號", "出發機場", "抵達機場", "出發時間", "抵達時間"],
      "航班",
    );
    atField(row, "出發時間／抵達時間", () =>
      validateFlightTimes(row["出發時間"], row["抵達時間"]),
    );
  }
  for (const row of tables["飯店"]) {
    required(row, ["飯店名稱", "入住日期", "退房日期", "地址"], "飯店");
    ensure(row["退房日期"] > row["入住日期"], "退房日期必須晚於入住日期。");
  }
  for (const row of tables["每日行程"]) {
    required(row, ["日期", "標題", "排序"], "每日行程");
    ensure(Number.isFinite(Number(row["排序"])), "行程排序必須是數字。");
    if (row["時區"])
      row["時區"] = atField(row, "時區", () => normalizeTimezone(row["時區"]));
    if (row["結束時間"] && row["開始時間"])
      ensure(row["結束時間"] >= row["開始時間"], "跨日行程請分成兩列。");
    for (const [field, sheet, id] of [
      ["航班ID", "航班", "航班ID"],
      ["住宿ID", "飯店", "住宿ID"],
    ] as const)
      if (row[field])
        ensure(
          tables[sheet].some((r) => r[id] === row[field]),
          `行程關聯${field}不存在。`,
        );
  }
  tables["每日行程"].sort(
    (a, b) =>
      a["日期"].localeCompare(b["日期"]) ||
      Number(a["排序"]) - Number(b["排序"]) ||
      a["開始時間"].localeCompare(b["開始時間"]),
  );
  for (const row of tables["開團待辦"]) {
    required(row, ["事項", "狀態", "截止日期"], "開團待辦");
    ensure(
      ["待辦", "進行中", "已完成", "已取消"].includes(row["狀態"]),
      "待辦狀態不正確。",
    );
    ensure(
      row["狀態"] === "已完成" ? !!row["完成日期"] : !row["完成日期"],
      "已完成任務需填完成日期，其他狀態請留空。",
      row,
      "完成日期",
    );
    if (row["負責團員ID"]) memberAt(row, "負責團員ID");
  }
  return {
    trip,
    currency,
    rate,
    timezone: settings["預設時區"],
    note: settings["旅程說明"],
    members,
    transactions,
    expenses,
    dues,
    tables,
    warnings,
  };
}

export function summarize(data: TripData) {
  const { transactions, dues, expenses } = data;
  const fundSpend = -transactions
    .filter((t) => t.type === "支出")
    .reduce((s, t) => s + t.amount, 0);
  const allocatedSpend = -transactions
    .filter((t) => t.type === "支出")
    .reduce((s, t) => s + t.shares.reduce((n, p) => n + p.amount, 0), 0);
  const pretrip = expenses
    .filter((e) => e.method === "行前收款")
    .reduce((s, e) => s + e.amount, 0);
  return {
    fundSpend,
    allocatedSpend,
    surplus: allocatedSpend - fundSpend,
    cash: transactions.reduce((s, t) => s + t.amount, 0),
    pretrip,
    collected: dues.reduce((s, d) => s + d.received, 0),
    outstanding: dues.reduce(
      (s, d) => s + Math.max(0, d.expected - d.received),
      0,
    ),
    totalTwd:
      pretrip / 100 + fundSpend / 10 ** precision(data.currency) / data.rate,
  };
}
export function taskProgress(rows: Row[]) {
  const active = rows.filter((row) => row["狀態"] !== "已取消");
  const done = active.filter((row) => row["狀態"] === "已完成").length;
  return {
    done,
    total: active.length,
    percent: active.length ? Math.round((done / active.length) * 100) : 0,
  };
}

export function summarizeMembers(data: TripData) {
  return data.members.map((member) => {
    const dues = data.dues.filter((due) => due.memberId === member.id);
    return {
      ...member,
      expected: dues.reduce((sum, due) => sum + due.expected, 0),
      received: dues.reduce((sum, due) => sum + due.received, 0),
      outstanding: dues.reduce(
        (sum, due) => sum + Math.max(0, due.expected - due.received),
        0,
      ),
      overpaid: dues.reduce(
        (sum, due) => sum + Math.max(0, due.received - due.expected),
        0,
      ),
    };
  });
}

// Valid rows remain visible; writes still use strict parseCatalog validation.
export function parseCatalogView(cells: SheetRows): {
  trips: Trip[];
  errors: string[];
} {
  table({ 旅程清單: [cells[0] || []] }, "旅程清單");
  const trips: Trip[] = [],
    errors: string[] = [],
    ids = new Set<string>();
  cells.slice(1).forEach((row, index) => {
    if (!row.some((value) => String(value).trim())) return;
    try {
      const item = parseCatalog([
        cells[0],
        ...Array.from({ length: index }, () => []),
        row,
      ])[0];
      ensure(!ids.has(item.id), `旅程清單 第 ${index + 2} 列「旅程ID」重複。`);
      ids.add(item.id);
      trips.push(item);
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "旅程資料不正確。");
    }
  });
  return {
    trips: trips.sort(
      (a, b) => a.order - b.order || b.start.localeCompare(a.start),
    ),
    errors,
  };
}
