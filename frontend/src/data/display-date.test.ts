import { it } from "node:test";
import assert from "node:assert/strict";
import {
  displayDate,
  displayDateTime,
  flightDayOffset,
} from "./display-date.ts";
it("shows dates using half-width slashes without changing source data", () => {
  const original = "2027-04-22";
  assert.equal(displayDate(original), "2027/04/22");
  assert.equal(original, "2027-04-22");
  assert.equal(displayDate(""), "");
  assert.equal(displayDate("未填寫"), "未填寫");
});
it("shows flight local timestamps without converting timezones or printing offsets", () => {
  assert.equal(
    displayDateTime("2027-04-22T09:30:00+08:00"),
    "2027/04/22 09:30",
  );
  assert.equal(displayDateTime("2027-04-22T09:30:00"), "2027/04/22 09:30");
  assert.equal(displayDateTime("2027-04-22"), "2027/04/22");
});
it("labels arrival by the difference in local calendar days rather than elapsed flight time", () => {
  assert.equal(
    flightDayOffset("2027-04-22T23:00:00+14:00", "2027-04-22T01:00:00-12:00"),
    "",
  );
  assert.equal(flightDayOffset("2027-04-30T23:00", "2027-05-01T16:34"), "(+1)");
  assert.equal(flightDayOffset("2027-12-31T23:00", "2028-01-02T16:34"), "(+2)");
  assert.equal(flightDayOffset("2028-02-28T23:00", "2028-03-01T16:34"), "(+2)");
  assert.equal(flightDayOffset("2027-04-22T23:00", "2027-04-21T16:34"), "(-1)");
  assert.equal(flightDayOffset("", ""), "");
});
