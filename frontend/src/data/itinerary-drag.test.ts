import { it } from "node:test";
import assert from "node:assert/strict";
import { dragDestination, dragScrollSpeed } from "./itinerary-drag.ts";
const zones = [
  {
    date: "2027-05-01",
    top: 0,
    bottom: 180,
    cards: [
      { id: "I001", top: 30, height: 60 },
      { id: "I002", top: 98, height: 70 },
    ],
  },
  { date: "2027-05-02", top: 190, bottom: 260, cards: [] },
  {
    date: "2027-05-03",
    top: 270,
    bottom: 400,
    cards: [{ id: "I003", top: 300, height: 90 }],
  },
];
it("finds insertion slots across dates, including empty days and variable heights", () => {
  assert.deepEqual(dragDestination(zones, 140, "I001"), {
    date: "2027-05-01",
    index: 1,
  });
  assert.deepEqual(dragDestination(zones, 210, "I001"), {
    date: "2027-05-02",
    index: 0,
  });
  assert.deepEqual(dragDestination(zones, 320, "I001"), {
    date: "2027-05-03",
    index: 0,
  });
  assert.deepEqual(dragDestination(zones, 380, "I001"), {
    date: "2027-05-03",
    index: 1,
  });
});
it("uses the nearest day at gaps and bounds, excludes the active card, and tolerates no valid destination", () => {
  assert.deepEqual(dragDestination(zones, -100, "I002"), {
    date: "2027-05-01",
    index: 0,
  });
  assert.deepEqual(dragDestination(zones, 185, "I002"), {
    date: "2027-05-01",
    index: 1,
  });
  assert.deepEqual(dragDestination(zones, 900, "I003"), {
    date: "2027-05-03",
    index: 0,
  });
  assert.equal(dragDestination([], 90, "I001"), null);
});
it("scrolls only near the visible dialog edges and bounds the scrolling speed", () => {
  assert.equal(dragScrollSpeed(150, 0, 300), 0);
  assert.equal(dragScrollSpeed(0, 0, 300), -10);
  assert.equal(dragScrollSpeed(300, 0, 300), 10);
  assert.ok(dragScrollSpeed(30, 0, 300) < 0);
  assert.ok(dragScrollSpeed(270, 0, 300) > 0);
  assert.equal(dragScrollSpeed(-200, 0, 300), -10);
});
