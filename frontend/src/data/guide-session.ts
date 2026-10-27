import {
  assertGuideSession,
  authorizeGuide,
  WRITE_SCOPE,
} from "./guide-auth.ts";
import type { GuideConfig, GuideSession } from "./guide-auth.ts";
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function guideSessionKey(base: string): string {
  return `trip-mate:guide-session:${base}`;
}
export function clearStoredGuideSession(
  storage: SessionStorage,
  key: string,
  expectedToken?: string,
): void {
  try {
    if (expectedToken) {
      const current = JSON.parse(storage.getItem(key) || "null");
      if (current?.session?.token !== expectedToken) return;
    }
    storage.removeItem(key);
  } catch {
    /* Storage can be unavailable; in-memory logout must still work. */
  }
}
export function readStoredGuideSession(
  storage: SessionStorage,
  key: string,
  config: GuideConfig,
  now = Date.now(),
): GuideSession | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (stored?.version !== 1 || stored.clientId !== config.clientId)
      throw new Error("Saved configuration changed.");
    const value = stored.session;
    if (
      !value ||
      typeof value.email !== "string" ||
      typeof value.token !== "string" ||
      !value.token.trim() ||
      value.token !== value.token.trim() ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt > now + 86400000 ||
      !Array.isArray(value.scopes) ||
      !value.scopes.every((scope: unknown) => typeof scope === "string") ||
      !value.scopes.includes(WRITE_SCOPE)
    )
      throw new Error("Invalid saved session.");
    const session: GuideSession = {
      email: value.email.trim().toLowerCase(),
      token: value.token,
      expiresAt: value.expiresAt,
      scopes: [...new Set<string>(value.scopes)],
    };
    assertGuideSession(session, config, now);
    return session;
  } catch {
    clearStoredGuideSession(storage, key);
    return null;
  }
}
export function saveStoredGuideSession(
  storage: SessionStorage,
  key: string,
  session: GuideSession,
  config: GuideConfig,
  now = Date.now(),
): boolean {
  try {
    assertGuideSession(session, config, now);
    if (!session.scopes?.includes(WRITE_SCOPE)) {
      clearStoredGuideSession(storage, key);
      return false;
    }
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        clientId: config.clientId,
        session: {
          email: session.email,
          token: session.token,
          expiresAt: session.expiresAt,
          scopes: session.scopes,
        },
      }),
    );
    return true;
  } catch {
    clearStoredGuideSession(storage, key);
    return false;
  }
}
export async function restoreStoredGuideSession(
  session: GuideSession,
  config: GuideConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<GuideSession> {
  assertGuideSession(session, config, now);
  const verified = await authorizeGuide(
    {
      access_token: session.token,
      expires_in: (session.expiresAt - now) / 1000,
      scope: session.scopes?.join(" "),
    },
    config,
    fetcher,
    now,
  );
  if (verified.email !== session.email)
    throw new Error("保存的登入帳號與 Google 驗證結果不符。");
  return { ...verified, expiresAt: session.expiresAt };
}
