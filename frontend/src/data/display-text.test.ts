import { it } from "node:test";
import assert from "node:assert/strict";
import { displayMultiline } from "./display-text.ts";
it("renders escaped newlines while preserving real newlines and other characters", () => {
  assert.equal(
    displayMultiline("第一行\\n第二行\n第三行"),
    "第一行\n第二行\n第三行",
  );
  assert.equal(
    displayMultiline("標題 [官網](https://example.com)"),
    "標題 [官網](https://example.com)",
  );
  assert.equal(displayMultiline(""), "");
});
