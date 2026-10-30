import { it } from "node:test";
import assert from "node:assert/strict";
import { itineraryTagHue } from "./itinerary-tag-color.ts";
it("gives common categories distinct fallback hues without trip context", () => {
  const categories = ["交通", "住宿", "景點", "美食", "購物", "自由活動"];
  const hues = categories.map((tag) => itineraryTagHue(tag));
  assert.equal(new Set(hues).size, categories.length);
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++) {
      const difference = Math.abs(hues[i] - hues[j]);
      assert.ok(Math.min(difference, 360 - difference) >= 35);
    }
});
it("keeps fallback colors stable across order, whitespace and equivalent Unicode", () => {
  const labels = ["集合地點", "必吃餐廳", "Shopping", "🍠景點"];
  const before = labels.map((tag) => itineraryTagHue(tag));
  assert.deepEqual(
    [...labels]
      .reverse()
      .map((tag) => itineraryTagHue(tag))
      .reverse(),
    before,
  );
  assert.equal(new Set(before).size, labels.length);
  for (const label of [...labels, ""]) {
    const hue = itineraryTagHue(label);
    assert.ok(Number.isFinite(hue) && hue >= 0 && hue < 360);
    assert.equal(itineraryTagHue(` ${label} `), hue);
  }
  assert.equal(itineraryTagHue("Café"), itineraryTagHue("Cafe\u0301"));
});
it("spaces the first five custom tags into clearly separated color families", () => {
  const tags = ["集合地點", "必吃餐廳", "Shopping", "🍠景點", "自由活動"];
  const hues = tags.map((tag) => itineraryTagHue(tag, tags));
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++) {
      const difference = Math.abs(hues[i] - hues[j]);
      assert.ok(Math.min(difference, 360 - difference) >= 50);
    }
});
it("keeps assigned colors when more tags are appended and separates later tags too", () => {
  const first = ["集合地點", "必吃餐廳", "Shopping", "🍠景點", "自由活動"];
  const all = [...first, "其他1", "其他2", "其他3", "其他4", "其他5"];
  assert.deepEqual(
    first.map((tag) => itineraryTagHue(tag, all)),
    first.map((tag) => itineraryTagHue(tag, first)),
  );
  const hues = all.map((tag) => itineraryTagHue(tag, all));
  assert.equal(new Set(hues).size, all.length);
  for (const hue of hues)
    assert.ok(Number.isFinite(hue) && hue >= 0 && hue < 360);
  assert.equal(
    itineraryTagHue(" 必吃餐廳 ", all),
    itineraryTagHue("必吃餐廳", [...all]),
  );
});

it("normalizes duplicate and empty context entries without consuming color slots", () => {
  assert.equal(
    itineraryTagHue("B", ["", "A", " A ", "B"]),
    itineraryTagHue("B", ["A", "B"]),
  );
  assert.equal(
    itineraryTagHue("Cafe\u0301", ["Café", "B"]),
    itineraryTagHue("Café", ["Café", "B"]),
  );
  assert.equal(
    itineraryTagHue("unknown", ["A", "B"]),
    itineraryTagHue("unknown"),
  );
});
