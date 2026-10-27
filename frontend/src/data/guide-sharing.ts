import { assertSuperUser, DRIVE_FILE_SCOPE } from "./guide-auth.ts";
import type { GuideConfig, GuideSession } from "./guide-auth.ts";
import { TripFileApiError } from "./trip-file.ts";

type Permission = {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  deleted?: boolean;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Add named editors only. Never changes public access, ownership or unrelated grants. */
export async function syncGuideEditors(
  session: GuideSession | null,
  config: GuideConfig,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  assertSuperUser(session, config);
  if (!session.scopes?.includes(DRIVE_FILE_SCOPE))
    throw new Error(
      "請重新登入並同意 Google Drive 檔案授權，再同步導遊編輯權。",
    );
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("無效的試算表 ID。");
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
  async function request(url: URL, init: RequestInit = {}): Promise<unknown> {
    assertSuperUser(session, config);
    let result: Response;
    try {
      result = await fetcher(url.href, {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${session!.token}`,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new Error(
        "同步結果無法確認，可能已有部分帳號取得權限；請重試同步，網站會先重新讀取權限。",
      );
    }
    if (!result.ok) throw new TripFileApiError(result.status, "同步導遊編輯權");
    if (init.method === "POST" || init.method === "PATCH") return;
    try {
      return await result.json();
    } catch {
      throw new Error("Google 共用權限回傳格式不正確，未繼續設定。");
    }
  }
  const url = (path = "", fields?: string) => {
    const result = new URL(base + path);
    result.searchParams.set("supportsAllDrives", "true");
    if (fields) result.searchParams.set("fields", fields);
    return result;
  };
  const file = await request(url("", "mimeType,capabilities(canShare)"));
  if (
    !object(file) ||
    file.mimeType !== "application/vnd.google-apps.spreadsheet"
  )
    throw new Error("找不到可設定的 Google 試算表，或檔案資訊格式不正確。");
  if (!object(file.capabilities) || file.capabilities.canShare !== true)
    throw new Error(
      "此帳號無法管理此試算表的共用權限，請使用擁有者或可管理共用的帳號。",
    );
  const permissions: Permission[] = [];
  const seen = new Set<string>();
  let token = "";
  do {
    const target = url(
      "/permissions",
      "nextPageToken,permissions(id,type,role,emailAddress,deleted)",
    );
    target.searchParams.set("pageSize", "100");
    if (token) target.searchParams.set("pageToken", token);
    const body = await request(target);
    if (
      !object(body) ||
      !Array.isArray(body.permissions) ||
      !body.permissions.every(
        (p) =>
          object(p) &&
          typeof p.id === "string" &&
          typeof p.type === "string" &&
          typeof p.role === "string" &&
          (p.type !== "user" ||
            p.deleted === true ||
            typeof p.emailAddress === "string"),
      ) ||
      (body.nextPageToken !== undefined &&
        typeof body.nextPageToken !== "string")
    )
      throw new Error("Google 共用權限回傳格式不正確，未繼續設定。");
    permissions.push(...(body.permissions as Permission[]));
    token = (body.nextPageToken as string) || "";
    if (token && seen.has(token))
      throw new Error("Google 共用權限分頁格式不正確，未繼續設定。");
    seen.add(token);
  } while (token);
  // Drive does not support concurrent permission updates on the same file.
  for (const email of config.emails) {
    const existing = permissions.filter(
      (p) =>
        !p.deleted &&
        p.type === "user" &&
        p.emailAddress?.trim().toLowerCase() === email,
    );
    if (
      existing.some((p) =>
        ["owner", "writer", "organizer", "fileOrganizer"].includes(p.role),
      )
    )
      continue;
    const permission = existing[0];
    const target = url(
      permission
        ? `/permissions/${encodeURIComponent(permission.id)}`
        : "/permissions",
      "id",
    );
    if (!permission) target.searchParams.set("sendNotificationEmail", "false");
    await request(target, {
      method: permission ? "PATCH" : "POST",
      body: JSON.stringify(
        permission
          ? { role: "writer" }
          : { type: "user", role: "writer", emailAddress: email },
      ),
    });
  }
}
