import type { Workbook } from "./portal.ts";
import { it } from "node:test";
import assert from "node:assert/strict";
import demo from "./demo.json" with { type: "json" };
import { parseCatalog, parseTrip, summarize } from "./portal.ts";
import {
  mutateTripBook,
  automaticTripIds,
  readRows,
  editorSheets,
  validateEditorBook,
  buildCellUpdates,
  createTripEditor,
} from "./trip-editor.ts";
import { readGuideConfig, WRITE_SCOPE } from "./guide-auth.ts";
const trip = parseCatalog(demo["旅程清單"])[0];
const config = readGuideConfig({
  VITE_GOOGLE_CLIENT_ID: "client",
  VITE_GUIDE_EMAILS: '["guide@example.com"]',
});
const session = {
  email: "guide@example.com",
  token: "test-token",
  expiresAt: Date.now() + 60000,
  scopes: [WRITE_SCOPE],
};
it("creates a fund spend, equal rounded deductions and exactly one linked expense", () => {
  const next = mutateTripBook(trip, demo, {
    kind: "fund",
    mode: "add",
    values: {
      交易ID: "F010",
      日期: "2027-05-02",
      類型: "支出",
      項目: "晚餐",
      記帳金額: "1000",
    },
    shares: [
      { memberId: "M001", amount: "" },
      { memberId: "M002", amount: "" },
      { memberId: "M003", amount: "" },
    ],
    expense: { 支出ID: "E010", 分類: "餐飲" },
  });
  const data = parseTrip(trip, next),
    added = data.transactions.find((row) => row.id === "F010")!;
  assert.deepEqual(
    added.shares.map((row) => row.amount),
    [-334, -334, -334],
  );
  assert.equal(
    data.expenses.filter((row) => row.transactionId === "F010").length,
    1,
  );
  assert.equal(
    summarize(data).surplus,
    summarize(parseTrip(trip, demo)).surplus + 2,
  );
  assert.equal(
    readRows(next, "公積金交易").length,
    readRows(demo, "公積金交易").length + 1,
  );
});
it("edits and removes a fund transaction together with all related rows", () => {
  const added = mutateTripBook(trip, demo, {
    kind: "fund",
    mode: "add",
    values: { 交易ID: "F010", 日期: "2027-05-02", 類型: "儲值", 項目: "加值" },
    shares: [{ memberId: "M001", amount: "2000" }],
    expense: {},
  });
  assert.equal(
    parseTrip(trip, added).members[0].balance,
    parseTrip(trip, demo).members[0].balance + 2000,
  );
  const removed = mutateTripBook(trip, added, {
    kind: "fund",
    mode: "delete",
    id: "F010",
    values: {},
    shares: [],
    expense: {},
  });
  assert.equal(
    parseTrip(trip, removed).members[0].balance,
    parseTrip(trip, demo).members[0].balance,
  );
});
it("rejects deletion of referenced members, flights, hotels and paid expenses", () => {
  for (const [sheet, id] of [
    ["團員", "M001"],
    ["航班", "A001"],
    ["飯店", "H001"],
  ] as const)
    assert.throws(
      () =>
        mutateTripBook(trip, demo, {
          kind: "record",
          mode: "delete",
          sheet,
          id,
          values: {},
        }),
      /引用|使用|關聯/,
    );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "expense",
        mode: "delete",
        id: "E001",
        values: {},
        shares: [],
      }),
    /收款/,
  );
});
it("groups receipts across pretrip items while preserving individual collection status", () => {
  const next = mutateTripBook(trip, demo, {
    kind: "receipt",
    mode: "add",
    values: {
      收款批次ID: "B010",
      團員ID: "M003",
      收款日期: "2027-04-10",
      備註: "一起收",
    },
    allocations: [
      { expenseId: "E001", amount: "1000", id: "R010" },
      { expenseId: "E002", amount: "2000", id: "R011" },
    ],
  });
  assert.equal(
    readRows(next, "收款明細").filter((row) => row["收款批次ID"] === "B010")
      .length,
    2,
  );
  assert.equal(
    parseTrip(trip, next)
      .dues.filter((row) => row.memberId === "M003")
      .reduce((sum, row) => sum + row.received, 0),
    300000,
  );
});
it("scoped validation does not block task edits due to unrelated bad accounting", () => {
  const book = structuredClone(demo);
  book["公積金交易"][1][4] = "bad";
  assert.doesNotThrow(() => validateEditorBook(trip, book, "tasks"));
  assert.throws(() => validateEditorBook(trip, book, "accounting"));
  assert.ok(editorSheets("accounting").includes("收款明細"));
});
it("updates only the selected transaction participant rows and preserves unrelated data", () => {
  const original = parseTrip(trip, demo).transactions.find(
    (row) => row.id === "F001",
  );
  const next = mutateTripBook(trip, demo, {
    kind: "fund",
    mode: "edit",
    id: "F002",
    values: {
      交易ID: "F002",
      日期: "2027-05-01",
      類型: "支出",
      項目: "晚餐更正",
      記帳金額: "1001",
    },
    shares: [
      { memberId: "M001", amount: "" },
      { memberId: "M002", amount: "" },
    ],
    expense: { 支出ID: "E003", 分類: "餐飲" },
  });
  const data = parseTrip(trip, next);
  assert.deepEqual(
    data.transactions.find((row) => row.id === "F001"),
    original,
  );
  assert.deepEqual(
    data.transactions
      .find((row) => row.id === "F002")
      ?.shares.map((row) => row.amount),
    [-501, -501],
  );
  assert.equal(
    data.expenses.filter((row) => row.transactionId === "F002").length,
    1,
  );
  const deleted = mutateTripBook(trip, next, {
    kind: "fund",
    mode: "delete",
    id: "F002",
    values: {},
    shares: [],
    expense: {},
  });
  assert.ok(
    !parseTrip(trip, deleted).expenses.some(
      (row) => row.transactionId === "F002",
    ),
  );
});
it("creates pretrip costs and edits receipt batches without changing other batches", () => {
  let book = mutateTripBook(trip, demo, {
    kind: "expense",
    mode: "add",
    values: {
      支出ID: "E010",
      日期: "2027-04-10",
      項目: "門票",
      分類: "活動",
      金額: "300",
    },
    shares: [
      { memberId: "M001", amount: "100" },
      { memberId: "M002", amount: "200" },
    ],
  });
  assert.equal(
    parseTrip(trip, book).dues.find(
      (row) => row.expenseId === "E010" && row.memberId === "M002",
    )?.expected,
    20000,
  );
  book = mutateTripBook(trip, book, {
    kind: "receipt",
    mode: "edit",
    id: "B001",
    values: { 收款批次ID: "B001", 團員ID: "M001", 收款日期: "2027-04-03" },
    allocations: [{ expenseId: "E001", amount: "9000", id: "R001" }],
  });
  assert.equal(
    readRows(book, "收款明細").find((row) => row["收款明細ID"] === "R003")?.[
      "實收金額"
    ],
    "6000",
  );
  assert.equal(
    readRows(book, "收款明細").filter((row) => row["收款批次ID"] === "B001")
      .length,
    1,
  );
  book = mutateTripBook(trip, book, {
    kind: "receipt",
    mode: "delete",
    id: "B001",
    values: {},
    allocations: [],
  });
  assert.equal(
    parseTrip(trip, book).dues.find(
      (row) => row.expenseId === "E001" && row.memberId === "M001",
    )?.received,
    0,
  );
  book = mutateTripBook(trip, book, {
    kind: "expense",
    mode: "delete",
    id: "E010",
    values: {},
    shares: [],
  });
  assert.ok(!parseTrip(trip, book).expenses.some((row) => row.id === "E010"));
});
it("rejects inconsistent sums, duplicate allocations, changed IDs and unsafe links", () => {
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "expense",
        mode: "add",
        values: {
          支出ID: "E010",
          日期: "2027-04-10",
          項目: "門票",
          分類: "活動",
          金額: "300",
        },
        shares: [{ memberId: "M001", amount: "100" }],
      }),
    /不一致/,
  );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "record",
        mode: "edit",
        sheet: "團員",
        id: "M001",
        values: { 團員ID: "M010", 顯示名稱: "新名稱" },
      }),
    /ID/,
  );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "record",
        mode: "add",
        sheet: "飯店",
        values: {
          住宿ID: "H010",
          飯店名稱: "飯店",
          入住日期: "2027-05-01",
          退房日期: "2027-05-02",
          地址: "地址",
          地圖網址: "javascript:alert(1)",
        },
      }),
    /網址/,
  );
});
it("handles editable new IDs, refunds and justified adjustments", () => {
  let book = mutateTripBook(trip, demo, {
    kind: "record",
    mode: "add",
    sheet: "團員",
    values: { 團員ID: "M042", 顯示名稱: "新團員", 排序: "4" },
  });
  book = mutateTripBook(trip, book, {
    kind: "record",
    mode: "edit",
    sheet: "團員",
    id: "M042",
    values: { 團員ID: "M042", 顯示名稱: "更名", 排序: "4" },
  });
  assert.equal(readRows(book, "團員").at(-1)?.["顯示名稱"], "更名");
  book = mutateTripBook(trip, book, {
    kind: "record",
    mode: "delete",
    sheet: "團員",
    id: "M042",
    values: {},
  });
  book = mutateTripBook(trip, book, {
    kind: "fund",
    mode: "add",
    values: { 日期: "2027-05-03", 類型: "退款", 項目: "退款" },
    shares: [{ memberId: "M001", amount: "100" }],
    expense: {},
  });
  assert.equal(parseTrip(trip, book).transactions.at(-1)?.amount, -100);
  assert.throws(
    () =>
      mutateTripBook(trip, book, {
        kind: "fund",
        mode: "add",
        values: { 日期: "2027-05-03", 類型: "調整", 項目: "調整" },
        shares: [{ memberId: "M001", amount: "10" }],
        expense: {},
      }),
    /備註/,
  );
  book = mutateTripBook(trip, book, {
    kind: "fund",
    mode: "add",
    values: { 日期: "2027-05-03", 類型: "調整", 項目: "調整", 備註: "補登" },
    shares: [{ memberId: "M001", amount: "10" }],
    expense: {},
  });
  assert.equal(parseTrip(trip, book).transactions.at(-1)?.amount, 10);
});
it("preserves reordered and extra columns, literal formulas and expands the sheet in one batch", () => {
  const before = structuredClone(demo);
  before["團員"] = [
    ["排序", "顯示名稱", "團員ID", "額外欄"],
    [1, "原名", "M001", "keep"],
    [2, "乙", "M002"],
    [3, "丙", "M003"],
  ];
  const next = mutateTripBook(trip, before, {
    kind: "record",
    mode: "edit",
    sheet: "團員",
    id: "M001",
    values: { 團員ID: "M001", 顯示名稱: "=not-a-formula", 排序: "1" },
  });
  assert.equal(next["團員"][1][3], "keep");
  const grids = Object.keys(demo)
    .filter((name) => name !== "旅程清單")
    .map((title, index) => ({
      title,
      sheetId: index + 1,
      rowCount: 1,
      columnCount: 1,
    }));
  const requests = buildCellUpdates(before, next, grids) as {
    appendDimension?: unknown;
    updateCells?: {
      rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
    };
  }[];
  assert.ok(requests.some((row) => row.appendDimension));
  assert.equal(requests.filter((row) => row.updateCells).length, 1);
  assert.equal(
    requests.find((row) => row.updateCells)?.updateCells?.rows[0].values[0]
      .userEnteredValue.stringValue,
    "=not-a-formula",
  );
});
function fakeApi(initialBook = demo) {
  let book = structuredClone(initialBook),
    writes = 0,
    denied = 0,
    failAfter = false;
  const grids = Object.keys(demo)
    .filter((name) => name !== "旅程清單")
    .map((title, index) => ({
      sheetId: index + 1,
      title,
      gridProperties: { rowCount: 1000, columnCount: 26 },
    }));
  const fetcher: typeof fetch = async (input, init) => {
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-token",
    );
    const url = new URL(String(input));
    assert.equal(url.searchParams.has("key"), false);
    if (denied) return Response.json({}, { status: denied });
    if (url.pathname.endsWith(":batchUpdate")) {
      writes++;
      const body = JSON.parse(String(init?.body));
      assert.ok(
        body.requests.every(
          (request: {
            updateCells?: { fields: string };
            appendDimension?: unknown;
            setDataValidation?: unknown;
          }) =>
            request.appendDimension ||
            request.setDataValidation ||
            request.updateCells?.fields === "userEnteredValue",
        ),
      );
      for (const request of body.requests) {
        if (!request.updateCells) continue;
        const { start, rows } = request.updateCells,
          grid = grids.find((row) => row.sheetId === start.sheetId)!;
        const data = book[grid.title as keyof typeof book] as (
          | string
          | number
        )[][];
        while (data.length <= start.rowIndex) data.push([]);
        while (data[start.rowIndex].length <= start.columnIndex)
          data[start.rowIndex].push("");
        data[start.rowIndex][start.columnIndex] =
          rows[0].values[0].userEnteredValue.stringValue;
      }
      return Response.json({});
    }
    if (failAfter && writes) throw new Error("network down");
    if (url.pathname.endsWith("values:batchGet"))
      return Response.json({
        valueRanges: url.searchParams.getAll("ranges").map((range) => ({
          values:
            book[range.split("!")[0].replaceAll("'", "") as keyof typeof book],
        })),
      });
    return Response.json({
      sheets: grids.map((properties) => ({ properties })),
    });
  };
  return {
    fetcher,
    get writes() {
      return writes;
    },
    setDenied: (value: number) => {
      denied = value;
    },
    setFailAfter: () => {
      failAfter = true;
    },
    change: () => {
      book["團員"][1][1] = "他處更新";
    },
  };
}
it("writes authenticated changes once as atomic requests and rejects stale snapshots", async () => {
  const api = fakeApi(),
    editor = createTripEditor(trip, "tasks", config, api.fetcher),
    before = await editor.read(session);
  const result = await editor.save(session, before, {
    kind: "record",
    mode: "add",
    sheet: "開團待辦",
    values: {
      任務ID: "P042",
      事項: "集合",
      分類: "其他",
      狀態: "待辦",
      截止日期: "2027-04-30",
      排序: "1",
    },
  });
  assert.equal(api.writes, 1);
  assert.ok(
    readRows(result.book, "開團待辦").some((row) => row["任務ID"] === "P042"),
  );
  api.change();
  await assert.rejects(
    editor.save(session, result, {
      kind: "record",
      mode: "delete",
      sheet: "開團待辦",
      id: "P042",
      values: {},
    }),
    /已在其他地方更新/,
  );
  assert.equal(api.writes, 1);
});
it("denies missing sessions, missing scopes, Google refusals and ambiguous post-write results", async () => {
  const api = fakeApi(),
    editor = createTripEditor(trip, "tasks", config, api.fetcher);
  await assert.rejects(editor.read(null));
  await assert.rejects(editor.read({ ...session, scopes: [] }));
  const before = await editor.read(session);
  api.setFailAfter();
  await assert.rejects(
    editor.save(session, before, {
      kind: "record",
      mode: "add",
      sheet: "開團待辦",
      values: {
        任務ID: "P042",
        事項: "集合",
        狀態: "待辦",
        截止日期: "2027-04-30",
      },
    }),
    /已送出儲存/,
  );
  assert.equal(api.writes, 1);
  for (const code of [401, 403, 500]) {
    const failing = fakeApi();
    failing.setDenied(code);
    await assert.rejects(
      createTripEditor(trip, "tasks", config, failing.fetcher).read(session),
    );
  }
});
it("checks task references when deleting members through the authenticated API", async () => {
  const api = fakeApi(),
    editor = createTripEditor(trip, "accounting", config, api.fetcher);
  let snapshot = await editor.read(session);
  snapshot = await editor.save(session, snapshot, {
    kind: "record",
    mode: "add",
    sheet: "團員",
    values: { 團員ID: "M042", 顯示名稱: "新團員", 排序: "4" },
  });
  snapshot = await editor.save(session, snapshot, {
    kind: "record",
    mode: "delete",
    sheet: "團員",
    id: "M042",
    values: {},
  });
  assert.ok(
    !readRows(snapshot.book, "團員").some((row) => row["團員ID"] === "M042"),
  );
  await assert.rejects(
    editor.save(session, snapshot, {
      kind: "record",
      mode: "delete",
      sheet: "團員",
      id: "M001",
      values: {},
    }),
    /引用|關聯/,
  );
  assert.equal(api.writes, 2);
});
it("does not retry refused or ambiguous writes and does not write outside its scope", async () => {
  const mutation = {
    kind: "record" as const,
    mode: "add" as const,
    sheet: "開團待辦" as const,
    values: {
      任務ID: "P042",
      事項: "新事項",
      狀態: "待辦",
      截止日期: "2027-04-30",
    },
  };
  const api = fakeApi(),
    editor = createTripEditor(trip, "tasks", config, async (url, init) => {
      const result = await api.fetcher(url, init);
      if (init?.method === "POST") throw new TypeError("connection lost");
      return result;
    });
  const before = await editor.read(session);
  await assert.rejects(
    editor.save(session, before, mutation),
    /儲存結果無法確認/,
  );
  assert.equal(api.writes, 1);
  const after = await editor.read(session);
  assert.ok(
    readRows(after.book, "開團待辦").some((row) => row["任務ID"] === "P042"),
  );
  await assert.rejects(
    editor.save(session, after, {
      kind: "record",
      mode: "delete",
      sheet: "團員",
      id: "M001",
      values: {},
    }),
    /編輯範圍/,
  );
  const denied = fakeApi(),
    refused = createTripEditor(trip, "tasks", config, async (url, init) =>
      init?.method === "POST"
        ? Response.json({}, { status: 403 })
        : denied.fetcher(url, init),
    );
  const state = await refused.read(session);
  await assert.rejects(refused.save(session, state, mutation), /拒絕編輯/);
  assert.equal(denied.writes, 0);
});
it("accepts personal amounts containing digits and one leading minus only", async () => {
  const { isPersonalAmountInput } = await import("./trip-editor.ts");
  for (const value of ["", "-", "0", "123", "-123", "001"])
    assert.equal(isPersonalAmountInput(value), true);
  for (const value of [
    "1.5",
    "1,000",
    "1e3",
    "+1",
    "--1",
    "1-2",
    " 12",
    "12元",
  ])
    assert.equal(isPersonalAmountInput(value), false);
});

it("adds separate terminals to legacy flight sheets while preserving old columns and unrelated cells", () => {
  const book: import("./portal.ts").Workbook = structuredClone(demo);
  const headers = book["航班"][0];
  for (const field of ["出發航廈", "抵達航廈"]) {
    const col = headers.indexOf(field);
    if (col >= 0) for (const row of book["航班"]) row.splice(col, 1);
  }
  headers.push("航廈", "額外資料");
  book["航班"][1].push("舊航廈資訊", "保留");
  const original = structuredClone(book);
  assert.doesNotThrow(() => validateEditorBook(trip, book, "itinerary"));
  const row = readRows(book, "航班")[0];
  const next = mutateTripBook(trip, book, {
    kind: "record",
    sheet: "航班",
    mode: "edit",
    id: row["航班ID"],
    values: { ...row, 出發航廈: "T1", 抵達航廈: "T2" },
  });
  const flight = readRows(next, "航班")[0];
  assert.equal(flight["出發航廈"], "T1");
  assert.equal(flight["抵達航廈"], "T2");
  assert.equal(flight["航廈"], "舊航廈資訊");
  assert.equal(flight["額外資料"], "保留");
  const requests = JSON.stringify(
    buildCellUpdates(book, next, [
      { title: "航班", sheetId: 9, rowCount: 100, columnCount: headers.length },
    ]),
  );
  assert.ok(
    requests.includes('"rowIndex":0'),
    "New column headers must be written in the same atomic request",
  );
  assert.ok(
    requests.includes('"stringValue":"出發航廈"') &&
      requests.includes('"stringValue":"抵達航廈"'),
  );
  assert.deepEqual(book, original);
  for (const name of Object.keys(book).filter((name) => name !== "航班"))
    assert.deepEqual(next[name], book[name]);
});

it("saves hotel check-in and check-out times independently and upgrades legacy columns atomically", () => {
  const book: import("./portal.ts").Workbook = structuredClone(demo);
  for (const field of ["入住時間", "退房時間"]) {
    const col = book["飯店"][0].indexOf(field);
    if (col >= 0) for (const row of book["飯店"]) row.splice(col, 1);
  }
  const original = structuredClone(book);
  assert.doesNotThrow(() => validateEditorBook(trip, book, "itinerary"));
  const row = readRows(book, "飯店")[0];
  const mutation = {
    kind: "record",
    sheet: "飯店",
    mode: "edit",
    id: row["住宿ID"],
    values: { ...row, 入住時間: "15:00", 退房時間: "12:00" },
  } as const;
  const next = mutateTripBook(trip, book, mutation);
  const hotel = readRows(next, "飯店")[0];
  assert.equal(hotel["入住時間"], "15:00");
  assert.equal(hotel["退房時間"], "12:00");
  assert.equal(hotel["入住日期"], row["入住日期"]);
  assert.equal(hotel["退房日期"], row["退房日期"]);
  const request = JSON.stringify(
    buildCellUpdates(book, next, [
      { title: "飯店", sheetId: 10, rowCount: 100, columnCount: 26 },
    ]),
  );
  assert.ok(
    request.includes('"stringValue":"入住時間"') &&
      request.includes('"stringValue":"退房時間"'),
  );
  assert.deepEqual(book, original);
  for (const key of ["入住時間", "退房時間"])
    for (const value of ["24:00", "12:60", "3:00 PM"])
      assert.throws(
        () =>
          mutateTripBook(trip, book, {
            ...mutation,
            values: { ...mutation.values, [key]: value },
          }),
        /時間格式/,
      );
  assert.doesNotThrow(() =>
    mutateTripBook(trip, book, {
      ...mutation,
      values: { ...mutation.values, 入住時間: "", 退房時間: "" },
    }),
  );
});

it("adds an optional hotel photo to legacy sheets and rejects non-web image URLs", () => {
  const book: import("./portal.ts").Workbook = structuredClone(demo);
  const col = book["飯店"][0].indexOf("飯店圖片網址");
  if (col >= 0) for (const row of book["飯店"]) row.splice(col, 1);
  assert.doesNotThrow(() => validateEditorBook(trip, book, "itinerary"));
  const row = readRows(book, "飯店")[0];
  const mutation = {
    kind: "record",
    sheet: "飯店",
    mode: "edit",
    id: row["住宿ID"],
    values: { ...row, 飯店圖片網址: "https://example.com/hotel.jpg" },
  } as const;
  const next = mutateTripBook(trip, book, mutation);
  assert.equal(
    readRows(next, "飯店")[0]["飯店圖片網址"],
    "https://example.com/hotel.jpg",
  );
  const requests = JSON.stringify(
    buildCellUpdates(book, next, [
      { title: "飯店", sheetId: 10, rowCount: 100, columnCount: 26 },
    ]),
  );
  assert.ok(requests.includes('"stringValue":"飯店圖片網址"'));
  assert.equal(book["飯店"][0].includes("飯店圖片網址"), false);
  assert.throws(
    () =>
      mutateTripBook(trip, book, {
        ...mutation,
        values: { ...row, 飯店圖片網址: "javascript:alert(1)" },
      }),
    /http/,
  );
  assert.doesNotThrow(() =>
    mutateTripBook(trip, book, {
      ...mutation,
      values: { ...row, 飯店圖片網址: "" },
    }),
  );
});
it("keeps ordinary guides able to edit data inside an existing trip", async () => {
  const roles = readGuideConfig({
    VITE_GOOGLE_CLIENT_ID: "client",
    VITE_GUIDE_EMAILS: '["owner@example.com","guide@example.com"]',
  });
  const api = fakeApi(),
    editor = createTripEditor(trip, "tasks", roles, api.fetcher),
    before = await editor.read(session);
  await editor.save(session, before, {
    kind: "record",
    mode: "add",
    sheet: "開團待辦",
    values: {
      任務ID: "P042",
      事項: "一般管理者新增待辦",
      分類: "其他",
      狀態: "待辦",
      截止日期: "2027-04-30",
      排序: "10",
    },
  });
  assert.equal(api.writes, 1);
});
it("assigns default IDs to ordinary guide mutations while preserving existing IDs and foreign references", () => {
  const record = automaticTripIds(demo, {
    kind: "record",
    mode: "add",
    sheet: "每日行程",
    values: { 行程ID: "I999", 航班ID: "A001", 住宿ID: "H001" },
  });
  assert.equal(record.values["行程ID"], "I005");
  assert.equal(record.values["航班ID"], "A001");
  const fund = automaticTripIds(demo, {
    kind: "fund",
    mode: "add",
    values: { 交易ID: "F999", 類型: "支出" },
    shares: [],
    expense: { 支出ID: "E999" },
  });
  assert.equal(fund.values["交易ID"], "F004");
  assert.equal(fund.kind === "fund" && fund.expense["支出ID"], "E005");
  const receipt = automaticTripIds(demo, {
    kind: "receipt",
    mode: "add",
    values: { 收款批次ID: "B999" },
    allocations: [
      { id: "R999", expenseId: "E001", amount: "100" },
      { id: "R998", expenseId: "E002", amount: "50" },
    ],
  });
  assert.equal(receipt.values["收款批次ID"], "B003");
  assert.deepEqual(
    receipt.kind === "receipt" && receipt.allocations.map((r) => r.id),
    ["R004", "R005"],
  );
  const edit = automaticTripIds(demo, {
    kind: "receipt",
    mode: "edit",
    id: "B001",
    values: { 收款批次ID: "B999" },
    allocations: [{ id: "R999", expenseId: "E001", amount: "100" }],
  });
  assert.equal(edit.values["收款批次ID"], "B001");
  assert.equal(edit.kind === "receipt" && edit.allocations[0].id, "R001");
});
it("keeps defaults for expenses, linked fund records and deletions without changing existing record identities", () => {
  const expense = automaticTripIds(demo, {
    kind: "expense",
    mode: "add",
    values: { 支出ID: "E999" },
    shares: [],
  });
  assert.equal(expense.values["支出ID"], "E005");
  const fund = automaticTripIds(demo, {
    kind: "fund",
    mode: "edit",
    id: "F002",
    values: { 交易ID: "F999", 類型: "支出" },
    shares: [],
    expense: { 支出ID: "E999" },
  });
  assert.equal(fund.values["交易ID"], "F002");
  assert.equal(fund.kind === "fund" && fund.expense["支出ID"], "E003");
  const deletion = {
    kind: "record",
    mode: "delete",
    id: "I001",
    sheet: "每日行程",
    values: {},
  } as const;
  assert.deepEqual(automaticTripIds(demo, deletion), deletion);
  const receipt = automaticTripIds(demo, {
    kind: "receipt",
    mode: "edit",
    id: "B001",
    values: {},
    allocations: [{ id: "R001", expenseId: "E005", amount: "100" }],
  });
  assert.equal(receipt.kind === "receipt" && receipt.allocations[0].id, "R001");
});
it("simplifies itinerary fields and automatically inserts timed additions", () => {
  const next = mutateTripBook(trip, demo, {
    kind: "record",
    mode: "add",
    sheet: "每日行程",
    values: {
      行程ID: "I010",
      日期: "2027-05-01",
      開始時間: "12:00",
      標題: "午餐",
    },
  });
  const rows = parseTrip(trip, next).tables["每日行程"].filter(
    (r) => r["日期"] === "2027-05-01",
  );
  assert.deepEqual(
    rows.map((r) => r["開始時間"]),
    ["09:00", "12:00", "15:00"],
  );
  assert.equal(rows[1]["類型"], "");
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "record",
        mode: "add",
        sheet: "每日行程",
        values: { 行程ID: "I010", 日期: "2027-06-01", 標題: "超出日期" },
      }),
    /旅程日期/,
  );
});
it("persists manual itinerary order atomically and refuses invalid or conflicting order", () => {
  const rows = readRows(demo, "每日行程").filter(
    (r) => r["日期"] === "2027-05-01",
  );
  const ids = rows.map((r) => r["行程ID"]).reverse();
  const moved = rows[1];
  const mutation = {
    kind: "record" as const,
    mode: "edit" as const,
    sheet: "每日行程" as const,
    id: moved["行程ID"],
    values: { ...moved, 開始時間: "", 結束時間: "" },
    itineraryOrder: ids,
  };
  const next = mutateTripBook(trip, demo, mutation);
  assert.deepEqual(
    parseTrip(trip, next)
      .tables["每日行程"].filter((r) => r["日期"] === moved["日期"])
      .map((r) => r["行程ID"]),
    ids,
  );
  assert.equal(
    readRows(next, "每日行程").find((r) => r["行程ID"] === rows[0]["行程ID"])?.[
      "開始時間"
    ],
    "09:00",
  );
  assert.throws(
    () => mutateTripBook(trip, demo, { ...mutation, values: moved }),
    /時間/,
  );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        ...mutation,
        itineraryOrder: [ids[0], ids[0]],
      }),
    /排序/,
  );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        ...mutation,
        itineraryOrder: ["I999", ids[1]],
      }),
    /排序/,
  );
});
it("writes reordered itinerary through one authorized batch, preserves other cells and rejects stale snapshots", async () => {
  const api = fakeApi(),
    editor = createTripEditor(trip, "itinerary", config, api.fetcher);
  const before = await editor.read(session);
  const rows = readRows(before.book, "每日行程").filter(
    (r) => r["日期"] === "2027-05-01",
  );
  const moved = rows[1];
  const mutation = {
    kind: "record" as const,
    mode: "edit" as const,
    sheet: "每日行程" as const,
    id: moved["行程ID"],
    values: { ...moved, 開始時間: "", 結束時間: "", 類型: "午餐集合,美食" },
    itineraryOrder: rows.map((r) => r["行程ID"]).reverse(),
  };
  const result = await editor.save(session, before, mutation);
  assert.equal(api.writes, 1);
  const parsed = validateEditorBook(trip, result.book, "itinerary");
  assert.equal(parsed.tables["每日行程"][0]["行程ID"], moved["行程ID"]);
  assert.equal(parsed.tables["每日行程"][0]["類型"], "午餐集合,美食");
  assert.deepEqual(result.book["航班"], before.book["航班"]);
  assert.deepEqual(result.book["飯店"], before.book["飯店"]);
  const updates = buildCellUpdates(before.book, result.book, before.grids) as {
    setDataValidation?: {
      range: { startRowIndex: number; endRowIndex: number };
    };
  }[];
  const cleared = updates.filter((r) => r.setDataValidation);
  assert.equal(cleared.length, 1);
  assert.equal(
    cleared[0].setDataValidation!.range.endRowIndex -
      cleared[0].setDataValidation!.range.startRowIndex,
    1,
  );
  api.change();
  await assert.rejects(
    editor.save(session, before, mutation),
    /已在其他地方更新/,
  );
  assert.equal(api.writes, 1);
});
it("keeps manual position for content edits and reinserts changed times or dates", () => {
  const inserted = mutateTripBook(trip, demo, {
    kind: "record",
    mode: "add",
    sheet: "每日行程",
    values: { 行程ID: "I010", 日期: "2027-05-01", 標題: "彈性活動" },
  });
  const row = readRows(inserted, "每日行程").find(
    (r) => r["行程ID"] === "I010",
  )!;
  const renamed = mutateTripBook(trip, inserted, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: "I010",
    values: { ...row, 標題: "修改內容" },
  });
  assert.equal(
    parseTrip(trip, renamed)
      .tables["每日行程"].filter((r) => r["日期"] === "2027-05-01")
      .at(-1)?.["標題"],
    "修改內容",
  );
  const changed = mutateTripBook(trip, inserted, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: "I010",
    values: { ...row, 開始時間: "08:00" },
  });
  assert.equal(
    parseTrip(trip, changed).tables["每日行程"][0]["行程ID"],
    "I010",
  );
  const changedDate = mutateTripBook(trip, inserted, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: "I010",
    values: { ...row, 日期: "2027-05-02", 開始時間: "09:00" },
  });
  assert.equal(
    parseTrip(trip, changedDate).tables["每日行程"].filter(
      (r) => r["日期"] === "2027-05-02",
    )[0]["行程ID"],
    "I010",
  );
  const sameDay = readRows(inserted, "每日行程").filter(
    (r) => r["日期"] === "2027-05-01",
  );
  assert.throws(
    () =>
      mutateTripBook(trip, inserted, {
        kind: "record",
        mode: "edit",
        sheet: "每日行程",
        id: "I010",
        values: row,
        itineraryOrder: [sameDay[1]["行程ID"], sameDay[0]["行程ID"], "I010"],
      }),
    /只能調整一筆/,
  );
});
it("adds an optional booking website to legacy hotel sheets without changing existing cells", () => {
  const book = structuredClone(demo);
  const index = book["飯店"][0].indexOf("訂房網站網址");
  if (index >= 0) for (const cells of book["飯店"]) cells.splice(index, 1);
  assert.doesNotThrow(() => parseTrip(trip, book));
  const row = readRows(book, "飯店")[0];
  const mutation = {
    kind: "record" as const,
    mode: "edit" as const,
    sheet: "飯店" as const,
    id: row["住宿ID"],
    values: {
      ...row,
      訂房網站網址: "https://www.booking.com/hotel/example.html",
    },
  };
  const next = mutateTripBook(trip, book, mutation);
  assert.equal(
    readRows(next, "飯店")[0]["訂房網站網址"],
    mutation.values["訂房網站網址"],
  );
  assert.deepEqual(
    next["飯店"][1].slice(0, book["飯店"][0].length),
    book["飯店"][1],
  );
  assert.throws(
    () =>
      mutateTripBook(trip, book, {
        ...mutation,
        values: { ...mutation.values, 訂房網站網址: "javascript:alert(1)" },
      }),
    /http/,
  );
  assert.equal(
    readRows(
      mutateTripBook(trip, next, {
        ...mutation,
        values: { ...mutation.values, 訂房網站網址: "" },
      }),
      "飯店",
    )[0]["訂房網站網址"],
    "",
  );
});
it("stores a free-text hotel price and adds its column to legacy sheets", () => {
  const book = structuredClone(demo),
    col = book["飯店"][0].indexOf("價格");
  if (col >= 0) for (const cells of book["飯店"]) cells.splice(col, 1);
  assert.doesNotThrow(() => parseTrip(trip, book));
  const row = readRows(book, "飯店")[0];
  const next = mutateTripBook(trip, book, {
    kind: "record",
    mode: "edit",
    sheet: "飯店",
    id: row["住宿ID"],
    values: { ...row, 價格: "每晚 ¥12,000／含早餐，現場付款" },
  });
  assert.equal(
    parseTrip(trip, next).tables["飯店"][0]["價格"],
    "每晚 ¥12,000／含早餐，現場付款",
  );
  assert.deepEqual(
    next["飯店"][1].slice(0, book["飯店"][0].length),
    book["飯店"][1],
  );
  assert.deepEqual(
    summarize(parseTrip(trip, next)),
    summarize(parseTrip(trip, book)),
  );
});
it("adds a separate hotel subtitle without migrating or overwriting existing notes", () => {
  const book = structuredClone(demo),
    col = book["飯店"][0].indexOf("副標題");
  if (col >= 0) for (const cells of book["飯店"]) cells.splice(col, 1);
  assert.doesNotThrow(() => parseTrip(trip, book));
  const row = readRows(book, "飯店")[0];
  const next = mutateTripBook(trip, book, {
    kind: "record",
    mode: "edit",
    sheet: "飯店",
    id: row["住宿ID"],
    values: { ...row, 副標題: "車站步行 5 分鐘" },
  });
  const hotel = parseTrip(trip, next).tables["飯店"][0];
  assert.equal(hotel["副標題"], "車站步行 5 分鐘");
  assert.equal(hotel["備註"], row["備註"]);
  assert.deepEqual(
    next["飯店"][1].slice(0, book["飯店"][0].length),
    book["飯店"][1],
  );
});
it("adds optional Markdown itinerary body to legacy sheets and preserves subtitle and existing data", () => {
  const book = structuredClone(demo),
    col = book["每日行程"][0].indexOf("內文");
  if (col >= 0) for (const cells of book["每日行程"]) cells.splice(col, 1);
  assert.doesNotThrow(() => parseTrip(trip, book));
  const row = readRows(book, "每日行程")[0];
  const body =
    "## 集合資訊\n\n- 請準時\n- [交通資訊](https://example.com/transit)\n\n**注意事項**";
  const next = mutateTripBook(trip, book, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: row["行程ID"],
    values: { ...row, 內文: body },
  });
  const saved = parseTrip(trip, next).tables["每日行程"].find(
    (r) => r["行程ID"] === row["行程ID"],
  )!;
  assert.equal(saved["內文"], body);
  assert.equal(saved["說明"], row["說明"]);
  assert.equal(saved["標題"], row["標題"]);
  const index =
    readRows(next, "每日行程").findIndex((r) => r["行程ID"] === row["行程ID"]) +
    1;
  assert.deepEqual(
    next["每日行程"][index].slice(0, book["每日行程"][0].length).map(String),
    book["每日行程"][index].map(String),
  );
  const cleared = mutateTripBook(trip, next, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: row["行程ID"],
    values: { ...saved, 內文: "" },
  });
  assert.equal(readRows(cleared, "每日行程")[0]["內文"], "");
});
it("keeps Markdown indentation and trailing line breaks when reading and editing itinerary bodies", () => {
  const row = readRows(demo, "每日行程")[0];
  const body = "    const code = true;\n\n段落  \n下一行\n";
  const next = mutateTripBook(trip, demo, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: row["行程ID"],
    values: { ...row, 內文: body },
  });
  assert.equal(readRows(next, "每日行程")[0]["內文"], body);
  assert.equal(parseTrip(trip, next).tables["每日行程"][0]["內文"], body);
});

it("upgrades a legacy itinerary body header and content in one authorized batch while preserving extra columns", async () => {
  const legacy = structuredClone(demo),
    col = legacy["每日行程"][0].indexOf("內文");
  for (const cells of legacy["每日行程"]) cells.splice(col, 1);
  legacy["每日行程"][0].push("維護備註");
  legacy["每日行程"][1].push("保留原資料");
  const api = fakeApi(legacy),
    editor = createTripEditor(trip, "itinerary", config, api.fetcher),
    snapshot = await editor.read(session);
  const row = readRows(snapshot.book, "每日行程")[0];
  const body = "## 集合\n\n[資訊](https://example.com/info)\n";
  const saved = await editor.save(session, snapshot, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: row["行程ID"],
    values: { ...row, 內文: body },
  });
  assert.equal(api.writes, 1);
  assert.equal(readRows(saved.book, "每日行程")[0]["內文"], body);
  assert.equal(readRows(saved.book, "每日行程")[0]["維護備註"], "保留原資料");
  assert.equal(saved.book["每日行程"][0].at(-1), "內文");
});

it("moves an itinerary across days in one authorized batch and normalizes both dates", async () => {
  const api = fakeApi(),
    editor = createTripEditor(trip, "itinerary", config, api.fetcher);
  const before = await editor.read(session);
  const rows = readRows(before.book, "每日行程");
  const moved = rows.find((r) => r["日期"] === trip.start)!;
  const date = "2027-05-02";
  const target = rows
    .filter((r) => r["日期"] === date)
    .sort((a, b) => Number(a["排序"]) - Number(b["排序"]));
  const mutation = {
    kind: "record" as const,
    mode: "edit" as const,
    sheet: "每日行程" as const,
    id: moved["行程ID"],
    values: {
      ...moved,
      日期: date,
      開始時間: "",
      結束時間: "",
      內文: "  preserved\n",
    },
    itineraryOrder: [...target.map((r) => r["行程ID"]), moved["行程ID"]],
  };
  const result = await editor.save(session, before, mutation);
  assert.equal(api.writes, 1);
  const after = readRows(result.book, "每日行程");
  assert.equal(
    after.find((r) => r["行程ID"] === moved["行程ID"])?.["日期"],
    date,
  );
  assert.equal(
    after.find((r) => r["行程ID"] === moved["行程ID"])?.["內文"],
    "  preserved\n",
  );
  for (const day of [trip.start, date]) {
    const entries = after
      .filter((r) => r["日期"] === day)
      .sort((a, b) => Number(a["排序"]) - Number(b["排序"]));
    assert.deepEqual(
      entries.map((r) => r["排序"]),
      entries.map((_, i) => String((i + 1) * 10)),
    );
  }
  assert.deepEqual(result.book["航班"], before.book["航班"]);
  assert.throws(
    () =>
      mutateTripBook(trip, before.book, {
        ...mutation,
        itineraryOrder: [moved["行程ID"]],
      }),
    /排序/,
  );
  assert.throws(
    () =>
      mutateTripBook(trip, before.book, {
        ...mutation,
        values: { ...mutation.values, 日期: "2027-06-01" },
      }),
    /日期/,
  );
  await assert.rejects(() => editor.save(session, before, mutation));
  assert.equal(api.writes, 1);
});
it("preserves valid times across dates, requires confirmation for conflicts and accepts an empty destination", () => {
  const rows = readRows(demo, "每日行程");
  const moved = rows.find((row) => row["行程ID"] === "I001")!;
  const mutation = {
    kind: "record" as const,
    mode: "edit" as const,
    sheet: "每日行程" as const,
    id: "I001",
    values: { ...moved, 日期: "2027-05-02" },
    itineraryOrder: ["I001", "I003"],
  };
  const valid = mutateTripBook(trip, demo, mutation);
  assert.equal(
    readRows(valid, "每日行程").find((row) => row["行程ID"] === "I001")?.[
      "開始時間"
    ],
    "09:00",
  );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        ...mutation,
        itineraryOrder: ["I003", "I001"],
      }),
    /時間順序/,
  );
  const cleared = mutateTripBook(trip, demo, {
    ...mutation,
    itineraryOrder: ["I003", "I001"],
    values: { ...mutation.values, 開始時間: "", 結束時間: "" },
  });
  assert.equal(
    readRows(cleared, "每日行程").find((row) => row["行程ID"] === "I001")?.[
      "開始時間"
    ],
    "",
  );
  const book = structuredClone(demo);
  const idColumn = book["每日行程"][0].indexOf("行程ID");
  book["每日行程"] = book["每日行程"].filter(
    (row, index) => index === 0 || row[idColumn] !== "I004",
  );
  const empty = mutateTripBook(trip, book, {
    ...mutation,
    values: { ...moved, 日期: trip.end },
    itineraryOrder: ["I001"],
  });
  const entry = readRows(empty, "每日行程").find(
    (row) => row["行程ID"] === "I001",
  )!;
  assert.equal(entry["日期"], trip.end);
  assert.equal(entry["排序"], "10");
  assert.equal(entry["開始時間"], "09:00");
  assert.deepEqual(empty["飯店"], demo["飯店"]);
});
it("duplicates itinerary records verbatim except their new ID, including reordered and extra columns", () => {
  for (const [sheet, key, prefix] of [
    ["每日行程", "行程ID", "I"],
    ["航班", "航班ID", "A"],
    ["飯店", "住宿ID", "H"],
  ] as const) {
    const book: Workbook = structuredClone(demo);
    const headers = book[sheet][0];
    headers.push("自訂欄位");
    const source = book[sheet][1];
    source[headers.length - 1] = "  =保留原始文字與空白  ";
    if (sheet === "每日行程")
      source[headers.indexOf("內文")] = "  ## 內文\n<br>\n";
    const high = [...source];
    high[headers.indexOf(key)] = prefix + "999";
    book[sheet].push(high);
    for (const row of book[sheet]) {
      while (row.length < headers.length) row.push("");
      row.reverse();
    }
    const idColumn = book[sheet][0].findIndex((value) => value === key);
    const id = String(book[sheet][1][idColumn]);
    const before = structuredClone(book);
    const result = mutateTripBook(trip, book, { kind: "duplicate", sheet, id });
    const clone = result[sheet].at(-1)!;
    assert.equal(clone[idColumn], prefix + "1000");
    assert.deepEqual(
      clone.map((value, index) => (index === idColumn ? null : value)),
      book[sheet][1].map((value, index) => (index === idColumn ? null : value)),
    );
    assert.deepEqual(result[sheet].slice(0, -1), book[sheet]);
    for (const other of Object.keys(book) as (keyof typeof book)[])
      if (other !== sheet) assert.deepEqual(result[other], book[other]);
    assert.deepEqual(book, before);
  }
});
it("duplicates through a single authorized batch for an ordinary guide and rejects stale snapshots", async () => {
  const initial = structuredClone(demo);
  const extraColumn = initial["每日行程"][0].length;
  initial["每日行程"][0].push("自訂欄位");
  initial["每日行程"][1][extraColumn] = "  =原樣複製而非公式  ";
  initial["每日行程"][1][initial["每日行程"][0].indexOf("內文")] =
    "  **原始內文**\n<br>\n";
  const api = fakeApi(initial);
  const guides = readGuideConfig({
    VITE_GOOGLE_CLIENT_ID: "client",
    VITE_GUIDE_EMAILS: '["owner@example.com","guide@example.com"]',
  });
  const editor = createTripEditor(trip, "itinerary", guides, api.fetcher);
  const before = await editor.read(session);
  const source = readRows(before.book, "每日行程")[0];
  const mutation = {
    kind: "duplicate" as const,
    sheet: "每日行程" as const,
    id: source["行程ID"],
  };
  const result = await editor.save(session, before, mutation);
  assert.equal(api.writes, 1);
  const copied = readRows(result.book, "每日行程").at(-1)!;
  assert.equal(
    result.book["每日行程"].at(-1)![extraColumn],
    "  =原樣複製而非公式  ",
  );
  assert.notEqual(copied["行程ID"], source["行程ID"]);
  assert.deepEqual({ ...copied, 行程ID: source["行程ID"] }, source);
  assert.deepEqual(automaticTripIds(before.book, mutation), mutation);
  await assert.rejects(
    () => editor.save(session, before, mutation),
    /其他地方更新/,
  );
  assert.equal(api.writes, 1);
  await assert.rejects(() => editor.save(null, result, mutation));
  assert.equal(api.writes, 1);
});
it("rejects copying a missing record or a sheet outside the itinerary copy scope", () => {
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "duplicate",
        sheet: "每日行程",
        id: "I999",
      }),
    /找不到/,
  );
  assert.throws(
    () =>
      mutateTripBook(trip, demo, {
        kind: "duplicate",
        sheet: "團員",
        id: "M001",
      } as unknown as Parameters<typeof mutateTripBook>[2]),
    /複製/,
  );
});
it("adds itinerary category to a legacy sheet while preserving tags, body and extra fields", () => {
  const legacy = structuredClone(demo);
  const categoryColumn = legacy["每日行程"][0].indexOf("類別");
  if (categoryColumn >= 0)
    for (const cells of legacy["每日行程"]) cells.splice(categoryColumn, 1);
  legacy["每日行程"][0].push("額外欄位");
  const extra = legacy["每日行程"][0].length - 1;
  legacy["每日行程"][1][extra] = "保留資料";
  assert.doesNotThrow(() => parseTrip(trip, legacy));
  const source = readRows(legacy, "每日行程")[0];
  const next = mutateTripBook(trip, legacy, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: source["行程ID"],
    values: { ...source, 類別: "三餐" },
  });
  assert.ok(next["每日行程"][0].includes("類別"));
  const saved = readRows(next, "每日行程")[0];
  assert.equal(saved["類別"], "三餐");
  assert.equal(saved["類型"], source["類型"]);
  assert.equal(saved["內文"], source["內文"]);
  assert.equal(saved["額外欄位"], "保留資料");
  assert.deepEqual(legacy["每日行程"][0].includes("類別"), false);
  assert.throws(
    () =>
      mutateTripBook(trip, next, {
        kind: "record",
        mode: "edit",
        sheet: "每日行程",
        id: source["行程ID"],
        values: { ...saved, 類別: "早餐" },
      }),
    /類別/,
  );
});
it("saves category and a missing header together in a single authorized batch", async () => {
  const legacy = structuredClone(demo);
  const col = legacy["每日行程"][0].indexOf("類別");
  if (col >= 0) for (const cells of legacy["每日行程"]) cells.splice(col, 1);
  const api = fakeApi(legacy),
    editor = createTripEditor(trip, "itinerary", config, api.fetcher);
  const before = await editor.read(session);
  const row = readRows(before.book, "每日行程")[0];
  const next = await editor.save(session, before, {
    kind: "record",
    mode: "edit",
    sheet: "每日行程",
    id: row["行程ID"],
    values: { ...row, 類別: "活動" },
  });
  assert.equal(api.writes, 1);
  assert.equal(readRows(next.book, "每日行程")[0]["類別"], "活動");
  assert.deepEqual(next.book["航班"], before.book["航班"]);
});
