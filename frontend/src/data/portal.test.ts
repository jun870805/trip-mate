import { describe, it } from "node:test";
import assert from "node:assert/strict";
import schema from "./schema.json" with { type: "json" };
import demo from "./demo.json" with { type: "json" };
import {
  parseCatalog,
  parseTrip,
  toMinor,
  summarize,
  safeUrl,
  taskProgress,
} from "./portal.ts";
import { createPortalRepository } from "./portal-api.ts";
import type { Workbook } from "./portal.ts";

const trip = {
  id: "T001",
  name: "測試旅程",
  destination: "日本",
  start: "2027-05-01",
  end: "2027-05-03",
  spreadsheetId: "sheet1",
  status: "規劃中",
  cover: "",
  order: 0,
};
function fixture(): Workbook {
  const book: Workbook = Object.fromEntries(
    Object.entries(schema).map(([name, cols]) => [name, [[...cols]]]),
  );
  book["旅程設定"].push(["1", "T001", "Asia/Tokyo", "JPY", "TWD", 4.5, ""]);
  book["團員"].push(["M001", "甲", 1], ["M002", "乙", 2], ["M003", "丙", 3]);
  book["公積金交易"].push(
    ["F001", "2027-05-01", "儲值", "儲值", 6000, ""],
    ["F002", "2027-05-01", "支出", "晚餐", -1000, ""],
  );
  book["公積金分攤"].push(
    ["F001", "M001", 2000],
    ["F001", "M002", 2000],
    ["F001", "M003", 2000],
    ["F002", "M001", ""],
    ["F002", "M002", ""],
    ["F002", "M003", ""],
  );
  book["支出明細"].push(
    ["E001", "2027-04-01", "機票", "航班", 9000, "TWD", "行前收款", "", ""],
    ["E002", "2027-05-01", "晚餐", "餐飲", 1000, "JPY", "公積金", "F002", ""],
  );
  book["行前費用分攤"].push(
    ["E001", "M001", 3000],
    ["E001", "M002", 3000],
    ["E001", "M003", 3000],
  );
  book["收款明細"].push(
    ["R001", "B001", "2027-04-02", "M001", "E001", 3000, ""],
    ["R002", "B002", "2027-04-03", "M002", "E001", 1000, ""],
  );
  return book;
}

describe("portal accounting", () => {
  it("reads fixed UTC offsets from manual Sheets edits and itinerary overrides", () => {
    const book = structuredClone(demo);
    book["旅程設定"][1][2] = "utc+5:30";
    const zoneIndex = book["每日行程"][0].indexOf("時區");
    book["每日行程"][1][zoneIndex] = "UTC-3:30";
    const data = parseTrip(parseCatalog(book["旅程清單"])[0], book);
    assert.equal(data.timezone, "UTC+05:30");
    assert.equal(data.tables["每日行程"][0]["時區"], "UTC-03:30");
  });
  it("loads the full labeled example including flights, hotels, itinerary and task ownership", () => {
    const trip = parseCatalog(demo["旅程清單"])[0];
    const data = parseTrip(trip, demo);
    assert.equal(data.tables["每日行程"].length, 4);
    assert.equal(data.tables["飯店"][0]["飯店名稱"], "範例飯店");
    assert.equal(taskProgress(data.tables["開團待辦"]).percent, 50);
    assert.equal(summarize(data).surplus, 2);
  });
  it("keeps actual expense, equal rounded deductions, and communal surplus separate", () => {
    const data = parseTrip(trip, fixture());
    const totals = summarize(data);
    assert.deepEqual(
      data.members.map((m) => m.balance),
      [1666, 1666, 1666],
    );
    assert.equal(totals.fundSpend, 1000);
    assert.equal(totals.allocatedSpend, 1002);
    assert.equal(totals.surplus, 2);
    assert.equal(totals.cash, 5000);
    assert.equal(totals.pretrip, 900000);
    assert.equal(totals.collected, 400000);
    assert.equal(totals.outstanding, 500000);
    assert.equal(data.dues[0].status, "已收齊");
    assert.equal(data.dues[1].status, "部分已收");
    assert.equal(data.dues[2].status, "未收");
  });
  it("charges only participating members", () => {
    const book = fixture();
    book["公積金分攤"].pop();
    const data = parseTrip(trip, book);
    assert.deepEqual(
      data.members.map((m) => m.balance),
      [1500, 1500, 2000],
    );
  });
  it("supports local-currency refunds without changing past expenses", () => {
    const book = fixture();
    book["公積金交易"].push([
      "F003",
      "2027-05-03",
      "退款",
      "退餘款",
      -1666,
      "",
    ]);
    book["公積金分攤"].push(["F003", "M001", -1666]);
    const data = parseTrip(trip, book);
    assert.equal(data.members[0].balance, 0);
    assert.equal(summarize(data).fundSpend, 1000);
    assert.equal(summarize(data).surplus, 2);
  });
  it("handles empty data with headers and settings", () => {
    const book = fixture();
    for (const key of Object.keys(book))
      if (key !== "旅程設定") book[key] = book[key].slice(0, 1);
    assert.equal(summarize(parseTrip(trip, book)).cash, 0);
  });
  it("supports batched collection across separate pretrip charges", () => {
    const book = fixture();
    book["支出明細"].push([
      "E003",
      "2027-04-01",
      "住宿",
      "住宿",
      1200,
      "TWD",
      "行前收款",
      "",
      "",
    ]);
    book["行前費用分攤"].push(["E003", "M001", 1200]);
    book["收款明細"].push([
      "R003",
      "B001",
      "2027-04-02",
      "M001",
      "E003",
      1200,
      "",
    ]);
    const data = parseTrip(trip, book);
    assert.equal(
      data.dues.find((d) => d.expenseId === "E003")?.received,
      120000,
    );
    assert.equal(summarize(data).collected, 520000);
  });
  it("does not turn negative balances into refundable money", () => {
    const book = fixture();
    book["公積金交易"][1][4] = 300;
    for (let i = 1; i <= 3; i++) book["公積金分攤"][i][2] = 100;
    const data = parseTrip(trip, book);
    assert.equal(data.members[0].balance, -234);
    assert.ok(data.warnings.some((w) => w.includes("不足")));
  });
});

describe("data validation", () => {
  it("rejects malformed IDs entered directly into the spreadsheet", () => {
    const book = fixture();
    book["團員"][1][0] = "m001";
    assert.throws(() => parseTrip(trip, book), /團員.*ID.*M001/);
    const catalog = [
      schema["旅程清單"],
      [
        "T0001",
        "旅程",
        "日本",
        "2027-05-01",
        "2027-05-03",
        "sheet1",
        "規劃中",
        "",
        0,
      ],
    ];
    assert.throws(() => parseCatalog(catalog), /ID.*T001/);
  });
  it("respects member display order independently of accounting", () => {
    const book = fixture();
    book["團員"][1][2] = 5;
    const data = parseTrip(trip, book);
    assert.deepEqual(
      data.members.map((m) => m.id),
      ["M002", "M003", "M001"],
    );
    assert.equal(data.members[2].balance, 1666);
  });
  for (const [label, change] of Object.entries({
    "missing headers": (b: Workbook) => {
      b["團員"][0] = ["錯誤"];
    },
    "duplicate headers": (b: Workbook) => {
      b["團員"][0].push("團員ID");
    },
    "duplicate member": (b: Workbook) => {
      b["團員"].push(["M001", "重複", 4]);
    },
    "unknown participant": (b: Workbook) => {
      b["公積金分攤"][1][1] = "M999";
    },
    "duplicate participant": (b: Workbook) => {
      b["公積金分攤"].push(["F002", "M001", ""]);
    },
    "incorrect deposit allocation": (b: Workbook) => {
      b["公積金分攤"][1][2] = 3000;
    },
    "wrong expense direction": (b: Workbook) => {
      b["公積金交易"][2][4] = 1000;
    },
    "missing expense allocation": (b: Workbook) => {
      b["公積金分攤"] = b["公積金分攤"].slice(0, 4);
    },
    "wrong currency": (b: Workbook) => {
      b["支出明細"][1][5] = "JPY";
    },
    "double counted expense": (b: Workbook) => {
      b["支出明細"].push([
        "E003",
        "2027-05-01",
        "晚餐",
        "餐飲",
        1000,
        "JPY",
        "公積金",
        "F002",
        "",
      ]);
    },
    "unlinked fund spending": (b: Workbook) => {
      b["支出明細"].pop();
    },
    "wrong linked amount": (b: Workbook) => {
      b["支出明細"][2][4] = 2000;
    },
    "missing pretrip dues": (b: Workbook) => {
      b["行前費用分攤"].pop();
    },
    "receipt without dues": (b: Workbook) => {
      b["收款明細"][1][4] = "E002";
    },
    "mixed batch members": (b: Workbook) => {
      b["收款明細"][2][1] = "B001";
    },
    "zero exchange rate": (b: Workbook) => {
      b["旅程設定"][1][5] = 0;
    },
    "wrong trip": (b: Workbook) => {
      b["旅程設定"][1][1] = "T002";
    },
    "unknown version": (b: Workbook) => {
      b["旅程設定"][1][0] = "2";
    },
    "bad timezone": (b: Workbook) => {
      b["旅程設定"][1][2] = "wrong";
    },
    "invalid date": (b: Workbook) => {
      b["公積金交易"][1][1] = "2027-02-30";
    },
    "missing value": (b: Workbook) => {
      b["團員"][1][1] = "";
    },
    "bad timestamp": (b: Workbook) => {
      b["航班"].push([
        "A001",
        "航空",
        "ABC",
        "TPE",
        "NRT",
        "2027-05-01 09:00",
        "2027-05-01T12:00:00+09:00",
      ]);
    },
  }))
    it(`rejects ${label}`, () => {
      const book = fixture();
      change(book);
      assert.throws(() => parseTrip(trip, book));
    });

  it("supports reordered columns and ignores blank rows", () => {
    const book = fixture();
    book["團員"] = book["團員"].map((row) => [...row].reverse());
    book["團員"].push(["", "", ""]);
    assert.equal(parseTrip(trip, book).members.length, 3);
  });
  it("rejects invalid and overprecise money", () => {
    assert.equal(toMinor("100.50", "TWD"), 10050);
    assert.equal(toMinor("-1", "JPY"), -1);
    for (const value of ["", "NaN", "1,000", "1.1", "900719925474099999"])
      assert.throws(() => toMinor(value, "JPY"));
  });
  it("warns on overpayment instead of hiding it", () => {
    const book = fixture();
    book["收款明細"][1][5] = 4000;
    assert.ok(parseTrip(trip, book).warnings.some((w) => w.includes("超收")));
  });
  it("parses a catalog and rejects reversed dates", () => {
    const rows = [
      schema["旅程清單"],
      [
        "T001",
        "測試旅程",
        "日本",
        "2027-05-01",
        "2027-05-03",
        "sheet1",
        "規劃中",
        "",
        0,
      ],
    ];
    assert.equal(parseCatalog(rows)[0].name, "測試旅程");
    rows[1][4] = "2027-04-01";
    assert.throws(() => parseCatalog(rows));
    assert.deepEqual(parseCatalog([schema["旅程清單"]]), []);
  });
  it("only permits safe external links", () => {
    assert.equal(safeUrl("javascript:alert(1)"), undefined);
    assert.equal(safeUrl(""), undefined);
    assert.equal(safeUrl("https://example.com"), "https://example.com/");
  });
  it("counts completed active tasks and handles no tasks", () => {
    assert.deepEqual(taskProgress([]), { done: 0, total: 0, percent: 0 });
    assert.deepEqual(
      taskProgress([{ 狀態: "已完成" }, { 狀態: "待辦" }, { 狀態: "已取消" }]),
      { done: 1, total: 2, percent: 50 },
    );
  });
});

describe("Google Sheets portal adapter", () => {
  it("uses batchGet and returns values by requested sheet", async () => {
    const fetcher: typeof fetch = async (input, options) => {
      const url = new URL(String(input));
      assert.ok(url.pathname.endsWith("/values:batchGet"));
      assert.equal(
        url.searchParams.get("valueRenderOption"),
        "UNFORMATTED_VALUE",
      );
      assert.equal(options?.signal?.aborted, false);
      return Response.json({
        valueRanges: url.searchParams
          .getAll("ranges")
          .map(() => ({ values: [] })),
      });
    };
    const repo = createPortalRepository("key", fetcher);
    const book = await repo.read(
      "sheet1",
      ["團員", "航班"],
      new AbortController().signal,
    );
    assert.deepEqual(book, { 團員: [], 航班: [] });
  });
  it("rejects missing, malformed and HTTP responses without exposing API keys", async () => {
    for (const body of [
      {},
      { valueRanges: [] },
      { valueRanges: [{ values: "bad" }] },
    ]) {
      const fetcher: typeof fetch = async () => Response.json(body);
      await assert.rejects(
        createPortalRepository("secret", fetcher).read("id", ["團員"]),
      );
    }
    const fetcher: typeof fetch = async () => new Response("", { status: 403 });
    await assert.rejects(
      createPortalRepository("secret", fetcher).read("id", ["團員"]),
      /403/,
    );
  });
});
