import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPortalRepository, PortalReadError } from "./portal-api.ts";

const permission = {
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message: "The caller does not have permission",
  },
};
const read = (body: unknown, status = 403) =>
  createPortalRepository("private-api-key", async () =>
    Response.json(body, { status }),
  ).read("trip-file", ["旅程設定"]);

describe("public trip access errors", () => {
  it("identifies an explicit file permission denial without disclosing credentials", async () => {
    await assert.rejects(read(permission), (error: unknown) => {
      assert.ok(error instanceof PortalReadError);
      assert.equal(error.status, 403);
      assert.equal(error.accessDenied, true);
      assert.ok(!error.message.includes("private-api-key"));
      return true;
    });
  });
  it("does not classify API restrictions, disabled services or quota failures as private trips", async () => {
    for (const reason of [
      "API_KEY_HTTP_REFERRER_BLOCKED",
      "SERVICE_DISABLED",
      "RATE_LIMIT_EXCEEDED",
      "API_KEY_INVALID",
    ]) {
      await assert.rejects(
        read({ error: { ...permission.error, details: [{ reason }] } }),
        (error: unknown) =>
          error instanceof PortalReadError && !error.accessDenied,
      );
    }
    await assert.rejects(
      read({
        error: {
          ...permission.error,
          errors: [{ reason: "dailyLimitExceeded" }],
        },
      }),
      (error: unknown) =>
        error instanceof PortalReadError && !error.accessDenied,
    );
    await assert.rejects(
      read({
        error: {
          code: 403,
          status: "PERMISSION_DENIED",
          message: "Requests from this referer are blocked.",
        },
      }),
      (error: unknown) =>
        error instanceof PortalReadError && !error.accessDenied,
    );
  });
  it("keeps ambiguous errors and missing files distinct from confirmed access denials", async () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      await assert.rejects(
        read({}, status),
        (error: unknown) =>
          error instanceof PortalReadError &&
          error.status === status &&
          !error.accessDenied,
      );
    }
    for (const body of [
      null,
      { error: null },
      { error: "bad" },
      { error: { ...permission.error, details: [{ reason: "UNKNOWN" }] } },
    ])
      await assert.rejects(
        read(body),
        (error: unknown) =>
          error instanceof PortalReadError && !error.accessDenied,
      );
    await assert.rejects(
      createPortalRepository(
        "key",
        async () => new Response("not json", { status: 403 }),
      ).read("trip", ["旅程設定"]),
      (error: unknown) =>
        error instanceof PortalReadError && !error.accessDenied,
    );
  });
  it("keeps public reads independent of guide login and never falls back to authenticated data", async () => {
    await createPortalRepository("key", async (_url, init) => {
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      assert.equal(init?.cache, "no-store");
      return Response.json({ valueRanges: [{ values: [] }] });
    }).read("trip", ["旅程設定"]);
    const problem = new Error("offline");
    await assert.rejects(
      createPortalRepository("key", async () => {
        throw problem;
      }).read("trip", ["旅程設定"]),
      problem,
    );
  });
});
