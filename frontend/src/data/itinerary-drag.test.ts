import { it } from "node:test";
import assert from "node:assert/strict";
import { dragLayout, dragScrollSpeed } from "./itinerary-drag.ts";
const cards = [
  { top: 0, height: 60 },
  { top: 68, height: 90 },
  { top: 166, height: 70 },
];
it("follows the finger and shifts adjacent cards to show the pending slot", () => {
  const down = dragLayout(cards, 0, 120, 8);
  assert.equal(down.offset, 120);
  assert.equal(down.target, 1);
  assert.deepEqual(down.shifts, [120, -68, 0]);
  assert.equal(down.settledOffset, 98);
  const up = dragLayout(cards, 2, -180, 8);
  assert.equal(up.target, 0);
  assert.deepEqual(up.shifts, [78, 78, -166]);
  assert.equal(up.settledOffset, -166);
});
it("clamps to list boundaries, handles variable heights and leaves a tap in its original slot", () => {
  assert.equal(dragLayout(cards, 0, -999, 8).offset, 0);
  assert.equal(dragLayout(cards, 0, 999, 8).offset, 176);
  assert.equal(dragLayout(cards, 0, 999, 8).target, 2);
  assert.deepEqual(dragLayout(cards, 1, 0, 8).shifts, [0, 0, 0]);
  assert.equal(dragLayout(cards, 1, 3, 8).target, 1);
  assert.equal(dragLayout(cards, 1, 3, 8).settledOffset, 0);
  assert.equal(dragLayout([{ top: 4, height: 30 }], 0, 80, 8).offset, 0);
  assert.throws(() => dragLayout([], 0, 0, 8));
  assert.throws(() => dragLayout(cards, -1, 0, 8));
});
it("scrolls only near the visible dialog edges and bounds the scrolling speed", () => {
  assert.equal(dragScrollSpeed(150, 0, 300), 0);
  assert.equal(dragScrollSpeed(0, 0, 300), -10);
  assert.equal(dragScrollSpeed(300, 0, 300), 10);
  assert.ok(dragScrollSpeed(30, 0, 300) < 0);
  assert.ok(dragScrollSpeed(270, 0, 300) > 0);
  assert.equal(dragScrollSpeed(-200, 0, 300), -10);
});
