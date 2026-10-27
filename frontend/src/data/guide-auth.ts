export const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GUIDE_SCOPES = `openid email ${WRITE_SCOPE} ${DRIVE_FILE_SCOPE}`;
export interface GuideConfig {
  clientId: string;
  emails: string[];
  error: string;
}
export interface GuideSession {
  email: string;
  token: string;
  expiresAt: number;
  scopes?: string[];
}
export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

export function readGuideConfig(
  env: Record<string, string | undefined>,
): GuideConfig {
  const clientId = env.VITE_GOOGLE_CLIENT_ID?.trim() || "";
  try {
    const value: unknown = JSON.parse(env.VITE_GUIDE_EMAILS || "[]");
    if (
      !Array.isArray(value) ||
      !value.length ||
      !value.every(
        (email) =>
          typeof email === "string" &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
      )
    )
      throw new Error("請將 VITE_GUIDE_EMAILS 設為 email 的 JSON 清單。");
    const emails = [
      ...new Set(value.map((email: string) => email.trim().toLowerCase())),
    ];
    return {
      clientId,
      emails,
      error: clientId
        ? ""
        : "尚未設定 VITE_GOOGLE_CLIENT_ID，請依 README 設定 Google 登入。",
    };
  } catch {
    return {
      clientId,
      emails: [],
      error: "請將 VITE_GUIDE_EMAILS 設為有效的 email JSON 清單。",
    };
  }
}
export function assertGuideSession(
  session: GuideSession | null,
  config: GuideConfig,
  now = Date.now(),
): asserts session is GuideSession {
  if (config.error) throw new Error(config.error);
  if (
    !session ||
    !session.token ||
    !config.emails.includes(session.email.toLowerCase())
  )
    throw new Error("此帳號沒有導遊編輯權限。");
  if (!Number.isFinite(session.expiresAt) || session.expiresAt <= now)
    throw new Error("導遊登入已過期，請重新登入。");
}
export async function authorizeGuide(
  response: TokenResponse,
  config: GuideConfig,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<GuideSession> {
  if (config.error) throw new Error(config.error);
  if (
    response.error ||
    !response.access_token ||
    !Number.isFinite(response.expires_in) ||
    response.expires_in! <= 0 ||
    !response.scope?.split(" ").includes(WRITE_SCOPE)
  )
    throw new Error("Google 登入未完成，或尚未授權試算表編輯。");
  const result = await fetcher(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${response.access_token}` },
      cache: "no-store",
    },
  );
  if (!result.ok) throw new Error("Google 登入驗證失敗，請重新登入。");
  const profile: unknown = await result.json();
  if (
    !profile ||
    typeof profile !== "object" ||
    !("email" in profile) ||
    typeof profile.email !== "string" ||
    !("email_verified" in profile) ||
    profile.email_verified !== true
  )
    throw new Error("無法確認 Google 帳號的 email。");
  const session = {
    email: profile.email.trim().toLowerCase(),
    token: response.access_token,
    expiresAt: now + Math.min(response.expires_in!, 86400) * 1000,
    scopes: [...new Set(response.scope!.split(" ").filter(Boolean))],
  };
  assertGuideSession(session, config, now);
  return session;
}
