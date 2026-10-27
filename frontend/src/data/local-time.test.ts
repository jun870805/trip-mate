import { it } from "node:test";
import assert from "node:assert/strict";
import demo from "./demo.json" with { type: "json" };
import { parseCatalog, parseTrip } from "./portal.ts";
import {
  normalizeLocalDateTime,
  validateFlightTimes,
  formatClockTime,
  formatTimezoneDifference,
} from "./timezone.ts";
it("stores local date and time without inventing an airport offset", () => {
  assert.equal(
    normalizeLocalDateTime("2027-05-01T09:00"),
    "2027-05-01T09:00:00",
  );
  assert.equal(
    normalizeLocalDateTime("2027-05-01T09:00:30"),
    "2027-05-01T09:00:30",
  );
  for (const value of [
    "2027-02-30T09:00",
    "2027-05-01T24:00",
    "2027-05-01T09:60",
    "2027-05-01T09:00+08:00",
    "bad",
  ])
    assert.throws(() => normalizeLocalDateTime(value));
});
it("does not compare local clocks across different flight locations", () => {
  assert.doesNotThrow(() =>
    validateFlightTimes("2027-05-01T16:00:00", "2027-05-01T11:00:00"),
  );
  assert.doesNotThrow(() =>
    validateFlightTimes("2027-05-01T16:00:00+09:00", "2027-05-01T11:00:00"),
  );
  assert.throws(
    () =>
      validateFlightTimes(
        "2027-05-01T16:00:00+09:00",
        "2027-05-01T11:00:00+09:00",
      ),
    /晚於/,
  );
  assert.throws(() =>
    validateFlightTimes("2027-05-01T09:00:00", "2027-05-01T11:00:00+99:00"),
  );
});
it("reads existing offset timestamps and newly entered local flights together", () => {
  const book = structuredClone(demo),
    headers = book["航班"][0];
  book["航班"][1][headers.indexOf("出發時間")] = "2027-05-01T16:00:00";
  book["航班"][1][headers.indexOf("抵達時間")] = "2027-05-01T11:00:00";
  assert.doesNotThrow(() => parseTrip(parseCatalog(book["旅程清單"])[0], book));
});
it("shows Taiwan and destination clocks for one instant, including date changes and DST", () => {
  const now = new Date("2027-01-01T16:30:00Z");
  assert.equal(formatClockTime(now, "Asia/Taipei"), "00:30");
  assert.equal(formatClockTime(now, "Asia/Tokyo"), "01:30");
  assert.equal(formatClockTime(now, "UTC-5"), "11:30");
  assert.equal(formatClockTime(now, "UTC+05:45"), "22:15");
  assert.equal(
    formatClockTime(new Date("2027-07-01T04:30:00Z"), "America/New_York"),
    "00:30",
  );
});

it("shows signed destination offsets relative to Taiwan across DST and the date line", () => {
  const winter = new Date("2027-01-01T16:30:59Z");
  assert.equal(
    formatTimezoneDifference(winter, "Asia/Taipei"),
    "時差：+0 小時",
  );
  assert.equal(formatTimezoneDifference(winter, "Asia/Tokyo"), "時差：+1 小時");
  assert.equal(
    formatTimezoneDifference(winter, "America/New_York"),
    "時差：-13 小時",
  );
  assert.equal(
    formatTimezoneDifference(
      new Date("2027-07-01T16:30:00Z"),
      "America/New_York",
    ),
    "時差：-12 小時",
  );
  assert.equal(
    formatTimezoneDifference(winter, "UTC+09:30"),
    "時差：+1.5 小時",
  );
  assert.equal(
    formatTimezoneDifference(winter, "UTC+05:45"),
    "時差：-2.25 小時",
  );
  assert.equal(formatTimezoneDifference(winter, "UTC+14"), "時差：+6 小時");
  assert.equal(formatTimezoneDifference(winter, "UTC-12"), "時差：-20 小時");
});
