import { it } from "node:test";
import assert from "node:assert/strict";
import demo from "./demo.json" with { type: "json" };
import { parseCatalog, parseTrip, summarizeMembers } from "./portal.ts";
import { readTripSections } from "./trip-sections.ts";
const trip = parseCatalog(demo["旅程清單"])[0];
it("preserves physical row numbers after blank rows", () => {
  const rows = structuredClone(demo["旅程清單"]);
  rows.splice(1, 0, []);
  rows[2][0] = "bad";
  assert.throws(() => parseCatalog(rows), /第 3 列/);
});
it("reports the sheet, row and amount field", () => {
  const book = structuredClone(demo);
  book["公積金交易"][1][4] = "bad";
  assert.throws(() => parseTrip(trip, book), /公積金交易 第 2 列「記帳金額」/);
});
it("isolates bad accounting and a missing task sheet from valid itinerary", async () => {
  const data = await readTripSections(trip, {
    read: async (_id, sheets) => {
      if (sheets.includes("開團待辦")) throw new Error("missing tasks");
      const book = structuredClone(demo);
      book["公積金交易"][1][4] = "bad";
      return Object.fromEntries(
        sheets.map((s) => [s, book[s as keyof typeof book]]),
      );
    },
  });
  assert.ok(data.sectionErrors?.accounting);
  assert.ok(data.sectionErrors?.tasks);
  assert.equal(data.sectionErrors?.itinerary, undefined);
  assert.ok(data.tables["每日行程"].length);
});
it("summarizes each members outstanding and overpaid items separately", () => {
  const rows = summarizeMembers(parseTrip(trip, demo));
  assert.equal(rows.length, 3);
  for (const row of rows)
    assert.equal(row.expected - row.received, row.outstanding - row.overpaid);
});

it("loads valid groups in one public batch request and preserves all accounting checks", async () => {
  let calls = 0;
  const data = await readTripSections(trip, {
    read: async () => {
      calls++;
      return structuredClone(demo);
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(data.sectionErrors, {});
  assert.equal(
    data.members[0].balance,
    parseTrip(trip, demo).members[0].balance,
  );
});
it("isolates a malformed itinerary without hiding correct accounting", async () => {
  const book = structuredClone(demo);
  book["每日行程"][1][0] = "bad";
  const data = await readTripSections(trip, { read: async () => book });
  assert.ok(data.sectionErrors?.itinerary);
  assert.ok(!data.sectionErrors?.accounting);
  assert.ok(data.transactions.length);
  assert.equal(data.tables["每日行程"].length, 0);
});
it("never exposes a partial trip after permission denial or cancellation", async () => {
  const { PortalReadError } = await import("./portal-api.ts");
  for (const code of [401, 403, 429, 503])
    await assert.rejects(
      readTripSections(trip, {
        read: async () => {
          throw new PortalReadError(code, code === 403);
        },
      }),
      PortalReadError,
    );
  await assert.rejects(
    readTripSections(trip, {
      read: async () => {
        throw new TypeError("offline");
      },
    }),
    /offline/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readTripSections(
      trip,
      {
        read: async () => {
          throw new Error("aborted");
        },
      },
      controller.signal,
    ),
    /aborted/,
  );
});
it("rejects bad common settings and handles group errors without replacing them with valid balances", async () => {
  const book = structuredClone(demo);
  book["旅程設定"][1][5] = 0;
  await assert.rejects(
    readTripSections(trip, { read: async () => book }),
    /匯率/,
  );
  let calls = 0;
  const data = await readTripSections(trip, {
    read: async (_id, sheets) => {
      calls++;
      if (calls === 1) throw new Error("missing range");
      if (sheets.includes("公積金交易")) throw new Error("ledger missing");
      return Object.fromEntries(
        sheets.map((sheet) => [sheet, demo[sheet as keyof typeof demo]]),
      );
    },
  });
  assert.ok(data.sectionErrors?.accounting);
  assert.equal(data.members.length, 3);
  assert.ok(!data.sectionErrors?.tasks);
});
it("treats a group-level permission denial as a whole-trip denial", async () => {
  const { PortalReadError } = await import("./portal-api.ts");
  let calls = 0;
  await assert.rejects(
    readTripSections(trip, {
      read: async (_id, sheets) => {
        calls++;
        if (calls === 1) throw new Error("missing range");
        if (sheets.includes("開團待辦")) throw new PortalReadError(403, true);
        return Object.fromEntries(
          sheets.map((sheet) => [sheet, demo[sheet as keyof typeof demo]]),
        );
      },
    }),
    PortalReadError,
  );
});
it("retains per-item unpaid amounts even if a different item was overpaid", () => {
  const data = parseTrip(trip, demo);
  data.dues = [
    {
      memberId: data.members[0].id,
      expenseId: "E001",
      expected: 100,
      received: 150,
      status: "超收",
    },
    {
      memberId: data.members[0].id,
      expenseId: "E002",
      expected: 200,
      received: 0,
      status: "未收",
    },
  ];
  const row = summarizeMembers(data)[0];
  assert.equal(row.outstanding, 200);
  assert.equal(row.overpaid, 50);
});
it("shows good catalog rows, isolates duplicates and keeps strict writes", async () => {
  const { parseCatalogView } = await import("./portal.ts");
  const rows = structuredClone(demo["旅程清單"]);
  rows.push([...rows[1]], ["bad"]);
  const result = parseCatalogView(rows);
  assert.equal(result.trips.length, 1);
  assert.equal(result.errors.length, 2);
  assert.throws(() => parseCatalog(rows));
  assert.throws(() => parseCatalogView([]));
  const blank = structuredClone(demo["旅程清單"]);
  blank.push([]);
  assert.equal(parseCatalogView(blank).errors.length, 0);
});
