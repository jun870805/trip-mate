import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readGuideConfig,
  authorizeGuide,
  assertGuideSession,
  GUIDE_SCOPES,
  isSuperUser,
  assertSuperUser,
} from "./guide-auth.ts";

const env = {
  VITE_GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
  VITE_GUIDE_EMAILS:
    '[" Me@Example.com ","other@example.com","me@example.com"]',
};
describe("guide access configuration", () => {
  it("parses a JSON list, normalizes case and removes duplicates", () => {
    assert.deepEqual(readGuideConfig(env).emails, [
      "me@example.com",
      "other@example.com",
    ]);
    assert.equal(readGuideConfig(env).error, "");
  });
  it("keeps viewing available but denies editing for missing or malformed configuration", () => {
    for (const value of [
      "",
      "me@example.com",
      "null",
      "{}",
      "[1]",
      '["bad"]',
      "[]",
    ]) {
      assert.ok(readGuideConfig({ ...env, VITE_GUIDE_EMAILS: value }).error);
    }
    assert.ok(readGuideConfig({ ...env, VITE_GOOGLE_CLIENT_ID: "" }).error);
  });
});
describe("verified Google account session", () => {
  const token = {
    access_token: "test-token",
    expires_in: 3600,
    scope: GUIDE_SCOPES,
  };
  it("checks verified email with Google and keeps tokens in a short-lived session", async () => {
    const fetcher: typeof fetch = async (input, options) => {
      assert.equal(
        String(input),
        "https://openidconnect.googleapis.com/v1/userinfo",
      );
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer test-token",
      );
      return Response.json({ email: "ME@example.com", email_verified: true });
    };
    const session = await authorizeGuide(
      token,
      readGuideConfig(env),
      fetcher,
      1000,
    );
    assert.equal(session.email, "me@example.com");
    assert.equal(session.expiresAt, 3601000);
    assert.doesNotThrow(() =>
      assertGuideSession(session, readGuideConfig(env), 1001),
    );
    assert.throws(
      () => assertGuideSession(session, readGuideConfig(env), 3601000),
      /登入已過期/,
    );
    assert.throws(() =>
      assertGuideSession(
        { ...session, email: "stranger@example.com" },
        readGuideConfig(env),
        1001,
      ),
    );
  });
  it("rejects unauthorized, unverified and failed identity lookups", async () => {
    for (const profile of [
      { email: "stranger@example.com", email_verified: true },
      { email: "me@example.com", email_verified: false },
      {},
      null,
    ]) {
      await assert.rejects(
        authorizeGuide(token, readGuideConfig(env), async () =>
          Response.json(profile),
        ),
      );
    }
    await assert.rejects(
      authorizeGuide(
        token,
        readGuideConfig(env),
        async () => new Response("", { status: 401 }),
      ),
      /登入/,
    );
  });
  it("requires write scope, valid lifetime and a configured allowed list", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("must not fetch");
    };
    for (const response of [
      { ...token, error: "access_denied" },
      { ...token, access_token: "" },
      { ...token, expires_in: 0 },
      { ...token, scope: "openid email" },
    ]) {
      await assert.rejects(
        authorizeGuide(response, readGuideConfig(env), fetcher),
        (error) => (error as Error).message !== "must not fetch",
      );
    }
    await assert.rejects(authorizeGuide(token, readGuideConfig({}), fetcher));
    assert.throws(() => assertGuideSession(null, readGuideConfig(env)));
  });
});

it("uses only the first normalized email as super user without changing guide access", () => {
  const config = readGuideConfig(env),
    now = 1000;
  const primary = { email: "me@example.com", token: "t", expiresAt: 2000 };
  const secondary = { ...primary, email: "other@example.com" };
  assert.equal(isSuperUser(primary, config, now), true);
  assert.equal(isSuperUser(secondary, config, now), false);
  assert.doesNotThrow(() => assertGuideSession(secondary, config, now));
  assert.throws(() => assertSuperUser(secondary, config, now), /非管理員/);
  assert.doesNotThrow(() => assertSuperUser(primary, config, now));
  assert.equal(isSuperUser(null, config, now), false);
  assert.equal(
    isSuperUser({ ...primary, expiresAt: 1000 }, config, now),
    false,
  );
  assert.equal(
    isSuperUser(
      primary,
      readGuideConfig({ ...env, VITE_GUIDE_EMAILS: "[]" }),
      now,
    ),
    false,
  );
  const reordered = readGuideConfig({
    ...env,
    VITE_GUIDE_EMAILS: '["other@example.com","me@example.com"]',
  });
  assert.equal(isSuperUser(primary, reordered, now), false);
  assert.equal(isSuperUser(secondary, reordered, now), true);
});
