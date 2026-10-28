import { it } from "node:test";
import assert from "node:assert/strict";
import {
  tripDates,
  orderedItinerary,
  insertItinerary,
  moveItinerary,
  mapNotes,
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
    { text: "集合餐廳", url: "https://maps.app.goo.gl/example" },
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
