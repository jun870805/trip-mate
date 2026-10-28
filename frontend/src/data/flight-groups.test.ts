import { it } from "node:test";
import assert from "node:assert/strict";
import { groupFlights } from "./flight-groups.ts";
import type { Row } from "./portal.ts";
const flight = (id: string, from: string, to: string, time: string): Row => ({
  航班ID: id,
  出發機場: from,
  抵達機場: to,
  出發時間: time,
});
it("groups same-date parallel flights without mixing return routes, other days or connection legs", () => {
  const rows = [
    flight("A001", "TPE", "KIX", "2027-05-01T08:00+08:00"),
    flight("A002", "KIX", "TPE", "2027-05-03T09:00"),
    flight("A003", "TPE", "KIX", "2027-05-01T13:00"),
    flight("A004", "KIX", "TPE", "2027-05-03T16:00"),
    flight("A005", "TPE", "KIX", "2027-05-02T08:00"),
    flight("A006", "KIX", "NRT", "2027-05-01T18:00"),
  ];
  const before = structuredClone(rows);
  const groups = groupFlights(rows);
  assert.deepEqual(
    groups.map((g) => g.flights.map((r) => r["航班ID"])),
    [["A001", "A003"], ["A002", "A004"], ["A005"], ["A006"]],
  );
  assert.equal(new Set(groups.map((g) => g.key)).size, 4);
  assert.deepEqual(rows, before);
});
it("normalizes incidental airport whitespace and letter case without guessing city equivalence", () => {
  const rows = [
    flight("A001", " 桃園   TPE ", "關西 KIX", "2027-05-01T08:00"),
    flight("A002", "桃園 tpe", "關西 kix", "2027-05-01T10:00"),
    flight("A003", "桃園 TPE", "大阪 ITM", "2027-05-01T12:00"),
  ];
  assert.deepEqual(
    groupFlights(rows).map((g) => g.flights.length),
    [2, 1],
  );
  assert.deepEqual(groupFlights([]), []);
});
