import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTimezone,
  timezoneForSheets,
  dateInTimezone,
} from "./timezone.ts";

describe("fixed UTC offsets and geographic timezones", () => {
  it("normalizes UTC offsets without reversing the sign", () => {
    for (const [input, expected] of [
      ["utc+9", "UTC+09:00"],
      [" UTC + 8 ", "UTC+08:00"],
      ["UTC-5", "UTC-05:00"],
      ["UTC+05:30", "UTC+05:30"],
      ["UTC+5:45", "UTC+05:45"],
      ["UTC-03:30", "UTC-03:30"],
      ["UTC", "UTC"],
      ["UTC-0", "UTC"],
      ["UTC+14", "UTC+14:00"],
      ["UTC-12", "UTC-12:00"],
      ["Asia/Tokyo", "Asia/Tokyo"],
    ])
      assert.equal(normalizeTimezone(input), expected);
  });
  it("rejects invalid offsets and unknown zones with an actionable error", () => {
    for (const input of [
      "",
      "UTC+",
      "UTC+14:01",
      "UTC-12:01",
      "UTC+25",
      "UTC+5:60",
      "UTC+5:3",
      "UTC+5junk",
      "somewhere",
    ])
      assert.throws(() => normalizeTimezone(input), /時區/);
  });
  it("converts fixed offsets to Google Sheets custom GMT zones", () => {
    assert.equal(timezoneForSheets("UTC+5:30"), "GMT+05:30");
    assert.equal(timezoneForSheets("UTC-3:30"), "GMT-03:30");
    assert.equal(timezoneForSheets("Asia/Tokyo"), "Asia/Tokyo");
    assert.equal(timezoneForSheets("UTC"), "UTC");
  });
  it("calculates the local calendar date across midnight for positive and negative offsets", () => {
    const now = new Date("2027-01-01T20:00:00Z");
    assert.equal(dateInTimezone(now, "UTC+5:30"), "2027-01-02");
    assert.equal(
      dateInTimezone(new Date("2027-01-01T01:00:00Z"), "UTC-3:30"),
      "2026-12-31",
    );
    assert.equal(dateInTimezone(now, "UTC"), "2027-01-01");
    assert.equal(dateInTimezone(now, "Asia/Tokyo"), "2027-01-02");
  });
  it("keeps fixed offsets constant while geographic zones follow daylight saving", () => {
    assert.equal(
      dateInTimezone(new Date("2027-07-01T04:30:00Z"), "UTC-5"),
      "2027-06-30",
    );
    assert.equal(
      dateInTimezone(new Date("2027-07-01T04:30:00Z"), "America/New_York"),
      "2027-07-01",
    );
  });
});
