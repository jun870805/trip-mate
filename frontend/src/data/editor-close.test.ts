import { it } from "node:test";
import assert from "node:assert/strict";
import { confirmTripEditorClose } from "./editor-close.ts";
it("requires confirmation whenever any trip editor add/edit form is open", () => {
  const prompts: string[] = [];
  assert.equal(
    confirmTripEditorClose(true, false, (message) => {
      prompts.push(message);
      return false;
    }),
    false,
  );
  assert.equal(prompts.length, 1);
  assert.ok(prompts[0].includes("不會保存"));
  assert.equal(
    confirmTripEditorClose(true, false, () => true),
    true,
  );
});
it("closes list views without prompting", () => {
  assert.equal(
    confirmTripEditorClose(false, false, () => {
      assert.fail("No confirmation expected");
    }),
    true,
  );
});
it("never closes or prompts while a write is active", () => {
  const unexpected = () => {
    assert.fail("Cannot prompt during saving");
  };
  assert.equal(confirmTripEditorClose(true, true, unexpected), false);
  assert.equal(confirmTripEditorClose(false, true, unexpected), false);
});
