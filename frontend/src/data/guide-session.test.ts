import { it } from "node:test";
import assert from "node:assert/strict";
import { readGuideConfig, WRITE_SCOPE } from "./guide-auth.ts";
import {
  guideSessionKey,
  readStoredGuideSession,
  saveStoredGuideSession,
  clearStoredGuideSession,
  restoreStoredGuideSession,
} from "./guide-session.ts";
const config = readGuideConfig({
  VITE_GOOGLE_CLIENT_ID: "client",
  VITE_GUIDE_EMAILS: '["guide@example.com"]',
});
const session = {
  email: "guide@example.com",
  token: "mock-token",
  expiresAt: 61000,
  scopes: [WRITE_SCOPE],
};
function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
it("persists a guide session by project path and restores only unexpired matching configuration", () => {
  const storage = memory(),
    key = guideSessionKey("/trip-mate/");
  assert.notEqual(key, guideSessionKey("/other/"));
  assert.equal(
    saveStoredGuideSession(storage, key, session, config, 1000),
    true,
  );
  assert.deepEqual(readStoredGuideSession(storage, key, config, 1001), session);
  assert.equal(
    readStoredGuideSession(
      storage,
      key,
      { ...config, clientId: "different" },
      1001,
    ),
    null,
  );
  assert.equal(storage.getItem(key), null);
});
it("removes expired, malformed and unauthorized saved sessions", () => {
  const storage = memory(),
    key = "test";
  for (const value of [
    "broken",
    JSON.stringify({
      version: 1,
      clientId: "client",
      session: { ...session, expiresAt: 999 },
    }),
    JSON.stringify({
      version: 1,
      clientId: "client",
      session: { ...session, email: "other@example.com" },
    }),
    JSON.stringify({
      version: 1,
      clientId: "client",
      session: { ...session, scopes: [] },
    }),
  ]) {
    storage.setItem(key, value);
    assert.equal(readStoredGuideSession(storage, key, config, 1000), null);
    assert.equal(storage.getItem(key), null);
  }
});
it("verifies saved tokens with Google using an authorization header without extending expiry", async () => {
  const restored = await restoreStoredGuideSession(
    session,
    config,
    async (input, init) => {
      assert.equal(
        String(input),
        "https://openidconnect.googleapis.com/v1/userinfo",
      );
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer mock-token",
      );
      assert.ok(!String(input).includes(session.token));
      return Response.json({ email: session.email, email_verified: true });
    },
    1000,
  );
  assert.equal(restored.expiresAt, session.expiresAt);
  assert.equal(restored.email, session.email);
});
it("rejects a revoked token and changed Google identity", async () => {
  await assert.rejects(
    restoreStoredGuideSession(
      session,
      config,
      async () => Response.json({}, { status: 401 }),
      1000,
    ),
  );
  await assert.rejects(
    restoreStoredGuideSession(
      session,
      { ...config, emails: [session.email, "another@example.com"] },
      async () =>
        Response.json({ email: "another@example.com", email_verified: true }),
      1000,
    ),
  );
});
it("clears logout state while avoiding removal of a newer session from another tab", () => {
  const storage = memory(),
    key = "test";
  saveStoredGuideSession(storage, key, session, config, 1000);
  clearStoredGuideSession(storage, key, "old-token");
  assert.ok(storage.getItem(key));
  clearStoredGuideSession(storage, key, session.token);
  assert.equal(storage.getItem(key), null);
  saveStoredGuideSession(storage, key, session, config, 1000);
  clearStoredGuideSession(storage, key);
  assert.equal(storage.getItem(key), null);
});
it("keeps the app usable when browser storage is blocked", () => {
  const blocked = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    },
  };
  assert.equal(
    saveStoredGuideSession(blocked, "key", session, config, 1000),
    false,
  );
  assert.equal(readStoredGuideSession(blocked, "key", config, 1000), null);
  assert.doesNotThrow(() => clearStoredGuideSession(blocked, "key"));
});
it("discards invalid credential shapes and does not reuse an old account after failed persistence", () => {
  const storage = memory(),
    key = "test";
  for (const changed of [
    { token: 3 },
    { token: "\nmock-token" },
    { email: null },
    { expiresAt: "61000" },
    { expiresAt: 1000 + 86400001 },
    { scopes: [WRITE_SCOPE, 1] },
  ]) {
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        clientId: "client",
        session: { ...session, ...changed },
      }),
    );
    assert.equal(readStoredGuideSession(storage, key, config, 1000), null);
  }
  saveStoredGuideSession(storage, key, session, config, 1000);
  const full = {
    ...storage,
    setItem() {
      throw Error("quota");
    },
  };
  assert.equal(
    saveStoredGuideSession(
      full,
      key,
      { ...session, token: "new-token" },
      config,
      1000,
    ),
    false,
  );
  assert.equal(storage.getItem(key), null);
  assert.equal(
    saveStoredGuideSession(
      storage,
      key,
      { ...session, scopes: [] },
      config,
      1000,
    ),
    false,
  );
});
it("does not contact Google when a saved session is already expired or lacks write scope", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw Error("unexpected request");
  };
  await assert.rejects(
    restoreStoredGuideSession(
      { ...session, expiresAt: 999 },
      config,
      fetcher,
      1000,
    ),
  );
  await assert.rejects(
    restoreStoredGuideSession(
      { ...session, scopes: [] },
      config,
      fetcher,
      1000,
    ),
  );
  assert.equal(calls, 0);
});
