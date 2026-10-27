import { describe, it } from "node:test";
import assert from "node:assert/strict";
import schema from "./schema.json" with { type: "json" };
import {
  createCatalogEditor,
  validateCatalogDraft,
  spreadsheetIdFromInput,
} from "./catalog-editor.ts";
import { readGuideConfig } from "./guide-auth.ts";
import type { SheetRows } from "./sheets.ts";

const config = readGuideConfig({
  VITE_GOOGLE_CLIENT_ID: "client",
  VITE_GUIDE_EMAILS: '["me@example.com"]',
});
const session = {
  email: "me@example.com",
  token: "test-token",
  expiresAt: Date.now() + 3600000,
};
const headers = [...schema["旅程清單"]];
const row = [
  "T001",
  "原旅程",
  "大阪",
  "2027-05-01",
  "2027-05-03",
  "sheet1",
  "規劃中",
  "",
  "1",
];
const draft = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
function mockApi(current: SheetRows) {
  const writes: { url: string; options?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, options) => {
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer test-token",
    );
    const url = new URL(String(input));
    assert.equal(url.searchParams.has("key"), false);
    if (!options?.method || options.method === "GET")
      return Response.json({ values: current });
    writes.push({ url: String(input), options });
    return Response.json({ updatedRows: 1 });
  };
  return { fetcher, writes };
}
describe("catalog form validation", () => {
  it("accepts a Spreadsheet URL or ID and validates the complete draft", () => {
    assert.equal(
      spreadsheetIdFromInput(
        " https://docs.google.com/spreadsheets/d/abc_123/edit#gid=0 ",
      ),
      "abc_123",
    );
    assert.equal(spreadsheetIdFromInput("sheet1"), "sheet1");
    assert.equal(
      validateCatalogDraft({
        ...draft,
        試算表ID: "https://docs.google.com/spreadsheets/d/sheet1/edit",
      })["試算表ID"],
      "sheet1",
    );
    assert.throws(() => spreadsheetIdFromInput("not a sheet id"));
    assert.throws(() =>
      validateCatalogDraft({ ...draft, 封面圖片網址: "javascript:alert(1)" }),
    );
    assert.throws(() =>
      validateCatalogDraft({ ...draft, 結束日期: "2027-04-01" }),
    );
  });
});
describe("catalog-only writes", () => {
  it("edits the existing row by ID using RAW and preserves unrelated columns", async () => {
    const before = [
      [...headers, "額外備註"],
      [...row, "不可覆寫"],
    ];
    const api = mockApi(before);
    const result = await createCatalogEditor(
      "catalog",
      config,
      api.fetcher,
    ).save(session, before, {
      kind: "edit",
      id: "T001",
      draft: { ...draft, 旅程名稱: "=not-a-formula" },
    });
    assert.equal(api.writes.length, 1);
    const url = new URL(api.writes[0].url);
    assert.ok(url.pathname.endsWith("/values:batchUpdate"));
    const payload = JSON.parse(String(api.writes[0].options?.body));
    assert.equal(payload.valueInputOption, "RAW");
    assert.equal(
      payload.data.find(
        (entry: { range: string }) => entry.range === "'旅程清單'!B2",
      ).values[0][0],
      "=not-a-formula",
    );
    assert.equal(
      payload.data.some(
        (entry: { range: string }) => entry.range === "'旅程清單'!J2",
      ),
      false,
    );
    assert.equal(result[1][9], "不可覆寫");
    assert.equal(result[1][1], "=not-a-formula");
  });
  it("adds an entry and keeps a gap left by a deleted catalog entry", async () => {
    const before = [headers, row, []];
    const api = mockApi(before);
    const result = await createCatalogEditor(
      "catalog",
      config,
      api.fetcher,
    ).save(session, before, {
      kind: "add",
      draft: { ...draft, 旅程ID: "T002" },
    });
    assert.equal(result[3][0], "T002");
    assert.equal(api.writes.length, 1);
  });
  it("deletes only the catalog row without deleting the linked spreadsheet", async () => {
    const before = [headers, row];
    const api = mockApi(before);
    const result = await createCatalogEditor(
      "catalog",
      config,
      api.fetcher,
    ).save(session, before, { kind: "delete", id: "T001" });
    assert.ok(result[1].every((cell) => cell === ""));
    assert.ok(
      api.writes[0].url.includes("/spreadsheets/catalog/values:batchUpdate"),
    );
    assert.equal(api.writes[0].options?.method, "POST");
  });
  it("supports reordered catalog columns", async () => {
    const before = [[...headers].reverse(), [...row].reverse()];
    const api = mockApi(before);
    const result = await createCatalogEditor(
      "catalog",
      config,
      api.fetcher,
    ).save(session, before, {
      kind: "edit",
      id: "T001",
      draft: { ...draft, 旅程名稱: "新旅程" },
    });
    assert.equal(result[1][7], "新旅程");
  });
  it("reports errors from the actual write after a successful authenticated read", async () => {
    for (const status of [401, 403, 500]) {
      const fetcher: typeof fetch = async (_, options) =>
        options?.method === "POST"
          ? new Response("", { status })
          : Response.json({ values: [headers, row] });
      await assert.rejects(
        createCatalogEditor("catalog", config, fetcher).save(
          session,
          [headers, row],
          { kind: "edit", id: "T001", draft },
        ),
        new RegExp(String(status)),
      );
    }
  });
  it("preserves a valid manually chosen ID when adding and rejects duplicates", async () => {
    const before = [headers, row];
    const api = mockApi(before);
    const result = await createCatalogEditor(
      "catalog",
      config,
      api.fetcher,
    ).save(session, before, {
      kind: "add",
      draft: { ...draft, 旅程ID: "T042" },
    });
    assert.equal(result[2][0], "T042");
    const duplicate = mockApi(before);
    await assert.rejects(
      createCatalogEditor("catalog", config, duplicate.fetcher).save(
        session,
        before,
        { kind: "add", draft },
      ),
      /重複/,
    );
    assert.equal(duplicate.writes.length, 0);
  });
  it("automatically crosses 999 and refuses to write when the five-character range is full", async () => {
    for (const [existing, expected] of [
      ["T999", "T1000"],
      ["T9999", null],
    ]) {
      const before = [headers, [existing!, ...row.slice(1)]];
      const api = mockApi(before);
      const operation = createCatalogEditor(
        "catalog",
        config,
        api.fetcher,
      ).save(session, before, { kind: "add", draft: { ...draft, 旅程ID: "" } });
      if (expected) assert.equal((await operation)[2][0], expected);
      else {
        await assert.rejects(operation, /9999/);
        assert.equal(api.writes.length, 0);
      }
    }
  });
  it("blocks stale snapshots, changed IDs, and missing targets before writing", async () => {
    const before = [headers, row];
    const api = mockApi([
      headers,
      [...row.slice(0, 1), "其他地方已更改", ...row.slice(2)],
    ]);
    await assert.rejects(
      createCatalogEditor("catalog", config, api.fetcher).save(
        session,
        before,
        { kind: "delete", id: "T001" },
      ),
      /更新/,
    );
    const api2 = mockApi(before);
    const editor = createCatalogEditor("catalog", config, api2.fetcher);
    await assert.rejects(
      editor.save(session, before, {
        kind: "edit",
        id: "T001",
        draft: { ...draft, 旅程ID: "T002" },
      }),
    );
    await assert.rejects(
      editor.save(session, before, { kind: "delete", id: "missing" }),
    );
    assert.equal(api.writes.length + api2.writes.length, 0);
  });
  it("denies missing or expired sessions and handles Google permission errors", async () => {
    const before = [headers, row];
    const api = mockApi(before);
    await assert.rejects(
      createCatalogEditor("catalog", config, api.fetcher).save(null, before, {
        kind: "delete",
        id: "T001",
      }),
    );
    await assert.rejects(
      createCatalogEditor("catalog", config, api.fetcher).save(
        { ...session, expiresAt: 1 },
        before,
        { kind: "delete", id: "T001" },
      ),
    );
    for (const status of [401, 403, 500]) {
      const fetcher: typeof fetch = async () => new Response("", { status });
      await assert.rejects(
        createCatalogEditor("catalog", config, fetcher).save(session, before, {
          kind: "delete",
          id: "T001",
        }),
        new RegExp(String(status)),
      );
    }
  });
});
