import { useRef, useState } from "react";
import type { GuideSession } from "../data/guide-auth";
import { DRIVE_FILE_SCOPE, isSuperUser } from "../data/guide-auth";
import { syncGuideEditors } from "../data/guide-sharing";
import { spreadsheetIdFromInput } from "../data/catalog-editor";
import { TripFileApiError } from "../data/trip-file";
import { guideConfig } from "../hooks/useGuideAuth";

export function GuideSharing({
  spreadsheetId,
  session,
  loginBusy,
  onBusy,
  onLogin,
  onExpired,
}: {
  spreadsheetId: string;
  session: GuideSession | null;
  loginBusy: boolean;
  onBusy: (busy: boolean) => void;
  onLogin: () => void;
  onExpired: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const active = useRef(false);
  if (!session || !spreadsheetId.trim() || !isSuperUser(session, guideConfig))
    return null;
  const hasScope = session.scopes?.includes(DRIVE_FILE_SCOPE);
  async function run() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setStatus("");
    try {
      await syncGuideEditors(
        session,
        guideConfig,
        spreadsheetIdFromInput(spreadsheetId),
      );
      setStatus("指定導遊的編輯權已同步。");
    } catch (cause) {
      if (cause instanceof TripFileApiError && cause.status === 401)
        onExpired();
      setError(cause instanceof Error ? cause.message : "同步未完成，請重試。");
    } finally {
      active.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="button secondary"
        disabled={busy || loginBusy}
        onClick={() => (hasScope ? void run() : onLogin())}
      >
        {busy ? "同步中…" : hasScope ? "同步導遊編輯權" : "授權同步導遊編輯權"}
      </button>
      <p className="muted">
        將目前設定的導遊設為此旅程編輯者。需有管理共用權限；只新增或提升權限。
      </p>
      {status && (
        <p role="status" className="muted">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error} 若此檔案不是由本站建立或授權存取，請到 Google 試算表手動共用。
        </p>
      )}
    </div>
  );
}
