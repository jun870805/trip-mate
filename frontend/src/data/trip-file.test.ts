import { describe, it } from "node:test";
import assert from "node:assert/strict";
import schema from "./schema.json" with { type: "json" };
import {
  buildTripFile,
  createTripFile,
  shareTripFile,
  prepareTripFile,
} from "./trip-file.ts";
import {
  DRIVE_FILE_SCOPE,
  readGuideConfig,
  WRITE_SCOPE,
} from "./guide-auth.ts";
import { parseTrip } from "./portal.ts";
import type { Workbook } from "./portal.ts";

const config = readGuideConfig({
  VITE_GOOGLE_CLIENT_ID: "client",
  VITE_GUIDE_EMAILS: '["guide@example.com"]',
});
const session = {
  email: "guide@example.com",
  token: "token",
  expiresAt: Date.now() + 3600000,
  scopes: [WRITE_SCOPE, DRIVE_FILE_SCOPE],
};
const options = {
  tripId: "T042",
  name: "新旅程",
  currency: "JPY",
  timezone: "Asia/Tokyo",
  rate: "4.5",
};

describe("new trip spreadsheet", () => {
  it("writes fixed offsets in settings and Sheets-compatible GMT metadata", () => {
    const body = buildTripFile({ ...options, timezone: "utc+5:30" });
    assert.equal(body.properties.timeZone, "GMT+05:30");
    const settings = body.sheets.find(
      (sheet) => sheet.properties.title === "旅程設定",
    )!;
    assert.equal(
      settings.data[0].rowData[1].values[2].userEnteredValue.stringValue,
      "UTC+05:30",
    );
  });
  it("creates all eleven trip tabs, headers and matching trip settings without sample transactions", () => {
    const body = buildTripFile(options);
    assert.equal(body.properties.title, "蕃薯旅遊團｜新旅程");
    assert.equal(body.sheets.length, 11);
    const book: Workbook = {};
    for (const sheet of body.sheets) {
      const name = sheet.properties.title as keyof typeof schema;
      const rows = sheet.data[0].rowData.map((row) =>
        row.values.map((cell) => cell.userEnteredValue.stringValue),
      );
      assert.deepEqual(rows[0], schema[name]);
      book[name] = rows;
      assert.equal(sheet.properties.gridProperties.frozenRowCount, 1);
    }
    assert.deepEqual(book["旅程設定"][1], [
      "1",
      "T042",
      "Asia/Tokyo",
      "JPY",
      "TWD",
      "4.5",
      "",
    ]);
    const data = parseTrip(
      {
        id: "T042",
        name: "新旅程",
        destination: "日本",
        start: "2027-05-01",
        end: "2027-05-03",
        spreadsheetId: "new-file",
        status: "規劃中",
        cover: "",
        order: 0,
      },
      book,
    );
    assert.equal(data.members.length, 0);
    assert.equal(data.expenses.length, 0);
    assert.equal(book["旅程清單"], undefined);
  });
  it("validates the ID, currency, timezone, name and positive exchange rate before creating", () => {
    for (const invalid of [
      { ...options, tripId: "bad" },
      { ...options, name: "" },
      { ...options, currency: "BAD" },
      { ...options, currency: "" },
      { ...options, timezone: "bad" },
      { ...options, rate: "0" },
      { ...options, rate: "Infinity" },
    ])
      assert.throws(() => buildTripFile(invalid));
  });
  it("creates a new file in the signed-in account and returns a trusted Google URL", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async (input, init) => {
      calls++;
      assert.equal(new URL(String(input)).pathname, "/v4/spreadsheets");
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer token",
      );
      assert.equal(JSON.parse(String(init?.body)).sheets.length, 11);
      return Response.json({
        spreadsheetId: "new-file",
        spreadsheetUrl: "https://untrusted.example/",
      });
    };
    assert.deepEqual(await createTripFile(session, config, options, fetcher), {
      id: "new-file",
      url: "https://docs.google.com/spreadsheets/d/new-file/edit",
      tripId: "T042",
    });
    assert.equal(calls, 1);
  });
  it("does not create without a valid guide session and never automatically retries creation", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      throw new TypeError("network");
    };
    await assert.rejects(createTripFile(null, config, options, fetcher));
    assert.equal(calls, 0);
    await assert.rejects(
      createTripFile(session, config, options, fetcher),
      /建立結果無法確認/,
    );
    assert.equal(calls, 1);
  });
  it("reports refused creation and malformed responses", async () => {
    for (const status of [401, 403, 500])
      await assert.rejects(
        createTripFile(
          session,
          config,
          options,
          async () => new Response("", { status }),
        ),
        new RegExp(String(status)),
      );
    for (const body of [{}, { spreadsheetId: "../bad" }, null])
      await assert.rejects(
        createTripFile(session, config, options, async () =>
          Response.json(body),
        ),
        /建立結果無法確認/,
      );
  });
});

describe("new file sharing", () => {
  it("sets all new tabs to plain text so manually entered dates and IDs retain their format", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      assert.ok(String(input).endsWith("/new-file:batchUpdate"));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.requests.length, 11);
      for (const request of body.requests)
        assert.equal(
          request.repeatCell.cell.userEnteredFormat.numberFormat.type,
          "TEXT",
        );
      return Response.json({});
    };
    await prepareTripFile(session, config, "new-file", fetcher);
    await assert.rejects(
      prepareTripFile(
        session,
        config,
        "new-file",
        async () => new Response("", { status: 403 }),
      ),
      /403/,
    );
    await assert.rejects(prepareTripFile(session, config, "../bad", fetcher));
  });
  it("sets link-only read permission and never grants public editing", async () => {
    const fetcher: typeof fetch = async (input, init) => {
      assert.equal(
        new URL(String(input)).pathname,
        "/drive/v3/files/new-file/permissions",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        type: "anyone",
        role: "reader",
        allowFileDiscovery: false,
      });
      return Response.json({ id: "anyoneWithLink" });
    };
    await shareTripFile(session, config, "new-file", fetcher);
  });
  it("requires drive.file consent and reports failure without creating or deleting another file", async () => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response("", { status: 403 });
    };
    await assert.rejects(
      shareTripFile(
        { ...session, scopes: [WRITE_SCOPE] },
        config,
        "new-file",
        fetcher,
      ),
      /授權/,
    );
    assert.equal(calls, 0);
    await assert.rejects(
      shareTripFile(session, config, "new-file", fetcher),
      /403/,
    );
    assert.equal(calls, 1);
    await assert.rejects(shareTripFile(session, config, "../bad", fetcher));
  });
});
