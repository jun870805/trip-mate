import { it } from "node:test";
import assert from "node:assert/strict";
import {
  tripDates,
  itinerarySubtitle,
  hasItineraryBody,
  itineraryTags,
  matchesItineraryTag,
  tripDayNumber,
  itineraryDateLabel,
  itineraryDateText,
  orderedItinerary,
  insertItinerary,
  moveItinerary,
  moveItineraryToDay,
  mapNotes,
  noteLinks,
  reorderPreferenceKey,
  readReorderPreference,
  writeReorderPreference,
} from "./itinerary.ts";
import type { Row } from "./portal.ts";
const row = (id: string, time: string, order: number): Row => ({
  行程ID: id,
  日期: "2027-05-01",
  開始時間: time,
  排序: String(order),
});
it("lists every travel date in chronological order across months", () => {
  assert.deepEqual(tripDates("2028-02-28", "2028-03-01"), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
  assert.deepEqual(tripDates("bad", "2027-01-01"), []);
  assert.deepEqual(tripDates("2027-01-01", "2027-02-30"), []);
  assert.deepEqual(tripDates("9999-12-31", "9999-12-31"), ["9999-12-31"]);
  assert.deepEqual(tripDates("2027-02-01", "2027-01-01"), []);
});
it("inserts timed entries by time while preserving untimed manual positions and appends untimed entries", () => {
  const rows = [
    row("I001", "09:00", 10),
    row("I002", "", 20),
    row("I003", "12:00", 30),
  ];
  assert.deepEqual(
    insertItinerary(rows, row("I004", "10:00", 0)).map((r) => r["行程ID"]),
    ["I001", "I002", "I004", "I003"],
  );
  assert.deepEqual(
    insertItinerary(rows, row("I004", "", 0)).map((r) => r["行程ID"]),
    ["I001", "I002", "I003", "I004"],
  );
  assert.deepEqual(
    insertItinerary(rows, row("I004", "08:00", 0)).map((r) => r["行程ID"]),
    ["I004", "I001", "I002", "I003"],
  );
  assert.deepEqual(
    orderedItinerary([...rows].reverse()).map((r) => r["行程ID"]),
    ["I001", "I002", "I003"],
  );
});
it("detects drag time conflict across intervening untimed entries without mutating source", () => {
  const rows = [
    row("I001", "09:00", 10),
    row("I002", "", 20),
    row("I003", "12:00", 30),
  ];
  const moved = moveItinerary(rows, "I003", 0);
  assert.equal(moved.conflict, true);
  assert.deepEqual(
    moved.rows.map((r) => r["行程ID"]),
    ["I003", "I001", "I002"],
  );
  assert.equal(moveItinerary(rows, "I002", 0).conflict, false);
  assert.equal(moveItinerary(rows, "I001", 1).conflict, false);
  assert.equal(rows[2]["排序"], "30");
  assert.throws(() => moveItinerary(rows, "I099", 0));
  assert.throws(() => moveItinerary(rows, "I001", 4));
});
it("extracts safe Google Maps links and names, retains surrounding notes and ignores hostile domains", () => {
  assert.deepEqual(
    mapNotes("午餐 https://www.google.com/maps/place/大阪城/ 晚點集合"),
    [
      { text: "午餐 " },
      { url: "https://www.google.com/maps/place/大阪城/", text: "大阪城" },
      { text: " 晚點集合" },
    ],
  );
  assert.equal(
    mapNotes("https://maps.app.goo.gl/example")[0].text,
    "Google Maps",
  );
  assert.deepEqual(mapNotes("集合餐廳 https://maps.app.goo.gl/example"), [
    { text: "集合餐廳 " },
    { text: "Google Maps", url: "https://maps.app.goo.gl/example" },
  ]);
  assert.deepEqual(mapNotes(""), []);
  assert.deepEqual(mapNotes("備註"), [{ text: "備註" }]);
  assert.equal(mapNotes("https://goo.gl/maps/abc")[0].text, "Google Maps");
  assert.equal(
    mapNotes("https://www.google.com/maps?q=25,121")[0].text,
    "Google Maps",
  );
  assert.equal(
    mapNotes(
      "https://maps.google.com/?q=東京 https://www.google.com/maps/place/大阪/",
    ).filter((part) => part.url).length,
    2,
  );
  assert.equal(
    mapNotes("https://www.google.com/maps/search/?api=1&query=Osaka+Castle")[0]
      .text,
    "Osaka Castle",
  );
  assert.equal(
    mapNotes("https://google.com.evil.test/maps/place/a")[0].url,
    undefined,
  );
  assert.equal(mapNotes("javascript:alert(1)")[0].url, undefined);
  assert.equal(mapNotes("https://maps.google.com/?q=餐廳")[0].text, "餐廳");
  assert.equal(
    mapNotes("https://www.google.com/maps/place/%E0%A4%A")[0].text,
    "Google Maps",
  );
  assert.equal(
    mapNotes("https://www.google.com/maps/@25,121,10z")[0].text,
    "Google Maps",
  );
});
it("persists only the do-not-remind preference, scoped to deployment and tolerates blocked storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  assert.equal(readReorderPreference(storage, "/trip/"), false);
  assert.equal(writeReorderPreference(storage, "/trip/", true), true);
  assert.equal(readReorderPreference(storage, "/trip/"), true);
  assert.equal(readReorderPreference(storage, "/other/"), false);
  writeReorderPreference(storage, "/trip/", false);
  assert.equal(readReorderPreference(storage, "/trip/"), false);
  assert.equal(reorderPreferenceKey("/"), "trip-mate:/reorder-no-reminder");
  const blocked = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.equal(readReorderPreference(blocked, "/"), false);
  assert.equal(writeReorderPreference(blocked, "/", true), false);
});

it("lists tags from all dates without duplicates or empty tags and filters exact values", () => {
  const rows = [
    { 類型: "交通", 日期: "2027-05-01" },
    { 類型: " 景點 ", 日期: "2027-05-02" },
    { 類型: "交通", 日期: "2027-05-03" },
    { 類型: "", 日期: "2027-05-03" },
  ];
  assert.deepEqual(itineraryTags(rows), ["交通", "景點"]);
  assert.equal(matchesItineraryTag(rows[1], "景點"), true);
  assert.equal(matchesItineraryTag(rows[0], "景點"), false);
  assert.equal(matchesItineraryTag(rows[3], ""), true);
  assert.equal(matchesItineraryTag({ 類型: "交通餐飲" }, "交通"), false);
});
it("numbers trip days from the start date across months and leap years independently of filters", () => {
  assert.equal(tripDayNumber("2027-05-01", "2027-05-01"), 1);
  assert.equal(tripDayNumber("2027-05-03", "2027-05-01"), 3);
  assert.equal(tripDayNumber("2028-03-01", "2028-02-28"), 3);
  assert.equal(tripDayNumber("2028-01-01", "2027-12-31"), 2);
  assert.equal(tripDayNumber("2027-04-30", "2027-05-01"), null);
  assert.equal(tripDayNumber("bad", "2027-05-01"), null);
  assert.equal(tripDayNumber("2027-02-30", "2027-02-01"), null);
});

it("renders other web URLs separately from surrounding text and distinguishes Google Maps", () => {
  const parts = noteLinks(
    "店家 https://example.com/menu。集合 https://maps.app.goo.gl/example 備註",
  );
  assert.deepEqual(parts, [
    { text: "店家 " },
    { text: "開啟連結", url: "https://example.com/menu", kind: "external" },
    { text: "。集合 " },
    {
      text: "Google Maps",
      url: "https://maps.app.goo.gl/example",
      kind: "map",
    },
    { text: " 備註" },
  ]);
  assert.deepEqual(noteLinks("網站 https://example.com. 下一段"), [
    { text: "網站 " },
    { text: "開啟連結", url: "https://example.com", kind: "external" },
    { text: ". 下一段" },
  ]);
  assert.deepEqual(noteLinks("javascript:alert(1)"), [
    { text: "javascript:alert(1)" },
  ]);
  assert.deepEqual(noteLinks("網址 https://%invalid"), [
    { text: "網址 https://%invalid" },
  ]);
  assert.deepEqual(noteLinks(""), []);
  assert.equal(
    noteLinks("https://google.com.evil.test/maps/place/a")[0].kind,
    "external",
  );
  assert.equal(
    noteLinks("https://www.google.com/maps/place/大阪/")[0].kind,
    "map",
  );
});

it("preserves legacy subtitle fields independently of the optional Markdown body", () => {
  const row = {
    說明: "副標 [網站](https://example.com)",
    地點: "車站",
    地圖網址: "https://maps.app.goo.gl/example",
    內文: "## 集合",
  };
  assert.equal(
    itinerarySubtitle(row),
    "副標 [網站](https://example.com)\n車站\nhttps://maps.app.goo.gl/example",
  );
  assert.equal(hasItineraryBody(row), true);
  assert.equal(hasItineraryBody({ 內文: "  \n " }), false);
  assert.equal(hasItineraryBody({}), false);
  assert.equal(itinerarySubtitle({}), "");
});

it("moves across days into an exact slot, preserves content, and checks destination times", () => {
  const rows = [
    row("I001", "09:00", 10),
    row("I002", "12:00", 20),
    { ...row("I003", "11:00", 10), 日期: "2027-05-02", 內文: "  markdown\n" },
  ];
  const moved = moveItineraryToDay(rows, "I003", "2027-05-01", 1);
  assert.deepEqual(
    moved.rows.map((r) => r["行程ID"]),
    ["I001", "I003", "I002"],
  );
  assert.equal(moved.conflict, false);
  assert.equal(moved.rows[1]["日期"], "2027-05-01");
  assert.equal(moved.rows[1]["內文"], "  markdown\n");
  assert.equal(
    moveItineraryToDay(rows, "I003", "2027-05-01", 0).conflict,
    true,
  );
  assert.equal(
    moveItineraryToDay(rows, "I001", "2027-05-03", 0).conflict,
    false,
  );
  assert.equal(rows[2]["日期"], "2027-05-02");
  assert.throws(() => moveItineraryToDay(rows, "I999", "2027-05-01", 0));
  assert.throws(() => moveItineraryToDay(rows, "I001", "2027-05-02", 3));
});
it("splits comma-separated itinerary tags, trims and deduplicates while matching whole tags", () => {
  const rows: Row[] = [
    { 類型: " 景點, 美食,景點,, " },
    { 類型: "美食,交通" },
    { 類型: " , " },
    {},
  ];
  assert.deepEqual(itineraryTags(rows), ["景點", "美食", "交通"]);
  assert.equal(matchesItineraryTag(rows[0], "美食"), true);
  assert.equal(matchesItineraryTag(rows[0], "美"), false);
  assert.equal(matchesItineraryTag(rows[0], "景點,美食"), false);
  assert.equal(matchesItineraryTag(rows[2], "美食"), false);
  assert.equal(matchesItineraryTag(rows[3], ""), true);
  assert.deepEqual(itineraryTags([{ 類型: "交通" }]), ["交通"]);
});

it("formats same-year itinerary dates as Dn - M/D(weekday) without changing ISO values", () => {
  assert.equal(
    itineraryDateLabel("2026-04-13", "2026-04-13", "2026-04-18"),
    "D1 - 4/13(一)",
  );
  assert.equal(
    itineraryDateLabel("2026-04-14", "2026-04-13", "2026-04-18"),
    "D2 - 4/14(二)",
  );
  assert.equal(
    itineraryDateText("2026-04-13", "2026-04-13", "2026-04-18"),
    "4/13(一)",
  );
  assert.equal(
    itineraryDateLabel("2028-03-01", "2028-02-28", "2028-03-02"),
    "D3 - 3/1(三)",
  );
});
it("keeps years for cross-year trips and legacy dates from a different year", () => {
  assert.equal(
    itineraryDateLabel("2027-12-31", "2027-12-31", "2028-01-02"),
    "D1 - 2027/12/31(五)",
  );
  assert.equal(
    itineraryDateLabel("2028-01-01", "2027-12-31", "2028-01-02"),
    "D2 - 2028/1/1(六)",
  );
  assert.equal(
    itineraryDateText("2028-01-01", "2027-04-13", "2027-04-18"),
    "2028/1/1(六)",
  );
  assert.equal(
    itineraryDateLabel("2026-04-12", "2026-04-13", "2026-04-18"),
    "4/12(日)",
  );
  assert.equal(itineraryDateLabel("bad", "2026-04-13", "2026-04-18"), "bad");
  assert.equal(
    itineraryDateLabel("2026-02-30", "2026-04-13", "2026-04-18"),
    "2026-02-30",
  );
});
