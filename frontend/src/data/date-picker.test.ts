import { it } from "node:test";
import assert from "node:assert/strict";
import {
  pickerAnchor,
  monthDays,
  shiftMonth,
  pickerInputValue,
  pickerInputDisplay,
  pickerInputError,
} from "./date-picker.ts";
it("opens at the existing selection, then the start date, then today without filling a value", () => {
  assert.equal(
    pickerAnchor("2028-02-12T10:20", "2027-04-22", "2026-10-27"),
    "2028-02-12",
  );
  assert.equal(pickerAnchor("", "2027-04-22", "2026-10-27"), "2027-04-22");
  assert.equal(pickerAnchor("", "", "2026-10-27"), "2026-10-27");
  assert.equal(
    pickerAnchor("invalid", "2027-02-30", "2026-10-27"),
    "2026-10-27",
  );
});
it("builds a Sunday-first calendar with leap days and month navigation across years", () => {
  const days = monthDays("2028-02-12");
  assert.equal(days.length, 35);
  assert.equal(days[0], null);
  assert.equal(days[2], "2028-02-01");
  assert.ok(days.includes("2028-02-29"));
  assert.equal(monthDays("2027-02-01").filter(Boolean).length, 28);
  assert.equal(shiftMonth("2027-12-22", 1), "2028-01-01");
  assert.equal(shiftMonth("2027-01-22", -1), "2026-12-01");
});

it("accepts directly typed slash dates and strict 24-hour times without timezone conversion", () => {
  assert.equal(pickerInputValue("2027/04/22 23:05"), "2027-04-22T23:05");
  assert.equal(pickerInputValue("2027-04-22T00:00"), "2027-04-22T00:00");
  assert.equal(pickerInputDisplay("2027-04-22T23:05"), "2027/04/22 23:05");
  assert.equal(pickerInputError("2028-02-29", "date"), "");
  assert.equal(pickerInputError("2027-04-22T00:00", "datetime-local"), "");
  assert.equal(pickerInputError("23:59", "time"), "");
  assert.equal(pickerInputError("", "date"), "");
  for (const value of ["2027-02-29", "2027-04-31", "2027-13-01", "2027-04-2"])
    assert.ok(pickerInputError(value, "date"));
  for (const value of ["24:00", "12:60", "1:30", "1:30 PM", "-1:00"])
    assert.ok(pickerInputError(value, "time"));
  assert.ok(pickerInputError("2027-04-22T24:00", "datetime-local"));
  assert.ok(pickerInputError("2027-04-21", "date", "2027-04-22"));
  assert.equal(pickerInputError("2027-04-22", "date", "2027-04-22"), "");
});
it("pads a single-digit hour on complete typed times and flight date-times", () => {
  for (const [text, expected] of [
    ["9:30", "09:30"],
    ["1:05", "01:05"],
    ["0:00", "00:00"],
    ["11:30", "11:30"],
    ["12:00", "12:00"],
    ["23:59", "23:59"],
    ["2027/04/22 9:30", "2027-04-22T09:30"],
    ["2027-04-22T7:05", "2027-04-22T07:05"],
  ]) {
    const value = pickerInputValue(text);
    assert.equal(value, expected);
    assert.equal(
      pickerInputError(value, value.includes("T") ? "datetime-local" : "time"),
      "",
    );
  }
  for (const partial of ["9", "9:", "9:3", "9:60", "24:00", "123:30", ""])
    assert.equal(pickerInputValue(partial), partial);
  assert.ok(pickerInputError(pickerInputValue("9:60"), "time"));
  assert.equal(pickerInputError(pickerInputValue("9:30"), "time", "08:00"), "");
  assert.ok(pickerInputError(pickerInputValue("7:30"), "time", "08:00"));
});
