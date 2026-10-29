import { it } from "node:test";
import assert from "node:assert/strict";
import { itineraryTagHue } from "./itinerary-tag-color.ts";
it("gives common itinerary categories distinct hues", () => {
  const categories = ["交通", "住宿", "景點", "美食", "購物", "自由活動"];
  const hues = categories.map(itineraryTagHue);
  assert.equal(new Set(hues).size, categories.length);
  for (let i = 0; i < hues.length; i++)
    for (let j = i + 1; j < hues.length; j++) {
      const difference = Math.abs(hues[i] - hues[j]);
      assert.ok(Math.min(difference, 360 - difference) >= 35);
    }
});
it("keeps custom labels stable across order, surrounding whitespace and equivalent Unicode", () => {
  const labels = ["集合地點", "必吃餐廳", "Shopping", "🍠景點"];
  const before = labels.map(itineraryTagHue);
  assert.deepEqual(
    [...labels].reverse().map(itineraryTagHue).reverse(),
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
