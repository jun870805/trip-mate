import { describe, it } from "node:test";
import assert from "node:assert/strict";
import rules from "./id-rules.json" with { type: "json" };
import {
  nextRecordId,
  nextRecordIdFromRows,
  assertRecordId,
  assertRecordIds,
} from "./record-id.ts";

describe("project-wide record IDs", () => {
  it("validates custom IDs and foreign keys with the same canonical format", () => {
    for (const id of ["T001", "T042", "T999", "T1000", "T9999"])
      assert.doesNotThrow(() => assertRecordId("trip", id));
    for (const id of [
      "T000",
      "T01",
      "t001",
      "M001",
      "T0001",
      "T0999",
      "T10000",
      "trip_old",
      "T1.5",
    ])
      assert.throws(() => assertRecordId("trip", id));
    assert.doesNotThrow(() =>
      assertRecordIds(
        {
          交易ID: "F001",
          公積金交易ID: "F002",
          團員ID: "M001",
          負責團員ID: "M002",
          試算表ID: "google-external-id",
          住宿ID: "",
        },
        "測試",
      ),
    );
    assert.throws(() => assertRecordIds({ 負責團員ID: "T001" }, "測試"));
  });
  it("uses each table prefix and exactly three zero-padded digits initially", () => {
    for (const kind of Object.keys(rules) as (keyof typeof rules)[]) {
      assert.equal(nextRecordId(kind, []), `${rules[kind].prefix}001`);
    }
    assert.equal(nextRecordId("trip", ["T001", "T009"]), "T010");
    assert.equal(nextRecordId("trip", ["T098"]), "T099");
  });
  it("uses the highest existing serial, not the number or order of rows", () => {
    assert.equal(nextRecordId("trip", ["T007", "T001", "T003"]), "T008");
    assert.equal(
      nextRecordId("member", ["M009", "T999", "legacy_member", ""]),
      "M010",
    );
  });
  it("grows to five characters only after 999 and stops before six characters", () => {
    assert.equal(nextRecordId("trip", ["T998"]), "T999");
    assert.equal(nextRecordId("trip", ["T999"]), "T1000");
    assert.equal(nextRecordId("trip", ["T9998"]), "T9999");
    assert.throws(() => nextRecordId("trip", ["T9999"]), /9999/);
  });
  it("ignores legacy IDs without renaming them and handles reordered headers", () => {
    const rows = [
      ["旅程名稱", "旅程ID"],
      ["舊資料", "trip_old"],
      ["新資料", "T002"],
      ["", ""],
    ];
    assert.equal(nextRecordIdFromRows("trip", rows), "T003");
    assert.equal(rows[1][1], "trip_old");
    assert.throws(() => nextRecordIdFromRows("trip", [["錯誤欄位"]]));
  });
});
