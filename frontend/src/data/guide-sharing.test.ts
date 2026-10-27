import { it } from "node:test";
import assert from "node:assert/strict";
import { syncGuideEditors } from "./guide-sharing.ts";
import {
  readGuideConfig,
  WRITE_SCOPE,
  DRIVE_FILE_SCOPE,
} from "./guide-auth.ts";
const config = readGuideConfig({
  VITE_GOOGLE_CLIENT_ID: "client",
  VITE_GUIDE_EMAILS:
    '["owner@example.com","reader@example.com","new@example.com"]',
});
const session = {
  email: "owner@example.com",
  token: "token",
  expiresAt: Date.now() + 60000,
  scopes: [WRITE_SCOPE, DRIVE_FILE_SCOPE],
};
it("reads all permissions before sequentially upgrading and adding named guide editors", async () => {
  const calls: { url: URL; method: string; body: unknown }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)),
      method = init?.method || "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer token",
    );
    if (url.pathname.endsWith("/files/sheet"))
      return Response.json({
        mimeType: "application/vnd.google-apps.spreadsheet",
        capabilities: { canShare: true },
      });
    if (method === "GET")
      return url.searchParams.has("pageToken")
        ? Response.json({
            permissions: [
              {
                id: "reader",
                type: "user",
                role: "reader",
                emailAddress: "READER@example.com",
              },
            ],
          })
        : Response.json({
            permissions: [
              {
                id: "owner",
                type: "user",
                role: "owner",
                emailAddress: "owner@example.com",
              },
              { id: "public", type: "anyone", role: "reader" },
            ],
            nextPageToken: "page-2",
          });
    return Response.json({ id: "done" });
  };
  await syncGuideEditors(session, config, "sheet", fetcher);
  assert.deepEqual(
    calls.map((c) => c.method),
    ["GET", "GET", "GET", "PATCH", "POST"],
  );
  assert.ok(calls[3].url.pathname.endsWith("/permissions/reader"));
  assert.deepEqual(calls[3].body, { role: "writer" });
  assert.deepEqual(calls[4].body, {
    type: "user",
    role: "writer",
    emailAddress: "new@example.com",
  });
  assert.equal(calls[4].url.searchParams.get("sendNotificationEmail"), "false");
});
it("retries safely after a partial result by reading existing grants and never downgrades owners or editors", async () => {
  let writes = 0;
  await syncGuideEditors(session, config, "sheet", async (input, init) => {
    const url = new URL(String(input));
    if (init?.method && init.method !== "GET") {
      writes++;
      return Response.json({});
    }
    return url.pathname.endsWith("/files/sheet")
      ? Response.json({
          mimeType: "application/vnd.google-apps.spreadsheet",
          capabilities: { canShare: true },
        })
      : Response.json({
          permissions: config.emails.map((email, i) => ({
            id: String(i),
            type: "user",
            role: i ? "writer" : "owner",
            emailAddress: email,
          })),
        });
  });
  assert.equal(writes, 0);
});
it("blocks invalid sessions, missing scope, invalid IDs, sharing refusal and malformed permission lists", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({});
  };
  await assert.rejects(syncGuideEditors(null, config, "sheet", fetcher));
  await assert.rejects(
    syncGuideEditors(
      { ...session, scopes: [WRITE_SCOPE] },
      config,
      "sheet",
      fetcher,
    ),
    /授權/,
  );
  await assert.rejects(syncGuideEditors(session, config, "../bad", fetcher));
  assert.equal(calls, 0);
  await assert.rejects(
    syncGuideEditors(session, config, "sheet", async () =>
      Response.json({
        mimeType: "application/vnd.google-apps.spreadsheet",
        capabilities: { canShare: false },
      }),
    ),
    /管理.*共用/,
  );
  for (const body of [
    {},
    { permissions: [{ id: "x" }] },
    { permissions: [], nextPageToken: 123 },
  ])
    await assert.rejects(
      syncGuideEditors(session, config, "sheet", async (input) =>
        String(input).includes("/permissions")
          ? Response.json(body)
          : Response.json({
              mimeType: "application/vnd.google-apps.spreadsheet",
              capabilities: { canShare: true },
            }),
      ),
      /格式/,
    );
  for (const status of [401, 403, 404])
    await assert.rejects(
      syncGuideEditors(
        session,
        config,
        "sheet",
        async () => new Response("", { status }),
      ),
      new RegExp(String(status)),
    );
});
it("does not recreate files or blindly retry writes after Google or network failures", async () => {
  for (const fail of ["google", "network"]) {
    let writes = 0;
    await assert.rejects(
      syncGuideEditors(session, config, "sheet", async (input, init) => {
        if (init?.method === "POST") {
          writes++;
          if (fail === "network") throw new TypeError("offline");
          return new Response("", { status: 403 });
        }
        return String(input).includes("/permissions")
          ? Response.json({ permissions: [] })
          : Response.json({
              mimeType: "application/vnd.google-apps.spreadsheet",
              capabilities: { canShare: true },
            });
      }),
    );
    assert.equal(writes, 1);
  }
});
it("fails closed on repeated pages, non-spreadsheet files and invalid JSON before any permission writes", async () => {
  await assert.rejects(
    syncGuideEditors(session, config, "sheet", async () =>
      Response.json({
        mimeType: "text/plain",
        capabilities: { canShare: true },
      }),
    ),
    /試算表/,
  );
  await assert.rejects(
    syncGuideEditors(
      session,
      config,
      "sheet",
      async () => new Response("broken json"),
    ),
    /格式/,
  );
  let writes = 0;
  await assert.rejects(
    syncGuideEditors(session, config, "sheet", async (input, init) => {
      if (init?.method) {
        writes++;
        return Response.json({});
      }
      return String(input).includes("/permissions")
        ? Response.json({ permissions: [], nextPageToken: "same" })
        : Response.json({
            mimeType: "application/vnd.google-apps.spreadsheet",
            capabilities: { canShare: true },
          });
    }),
    /分頁格式/,
  );
  assert.equal(writes, 0);
});
it("rejects permission synchronization by non-super guides before any Google request", async () => {
  let calls = 0;
  await assert.rejects(
    syncGuideEditors(
      { ...session, email: "reader@example.com" },
      config,
      "sheet",
      async () => {
        calls++;
        return Response.json({});
      },
    ),
    /非管理員/,
  );
  assert.equal(calls, 0);
});
