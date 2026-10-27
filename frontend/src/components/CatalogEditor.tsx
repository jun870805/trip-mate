import { displayDate } from "../data/display-date";
import { createPortalRepository } from "../data/portal-api";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Trip, Row } from "../data/portal";
import type { SheetRows } from "../data/sheets";
import type { GuideSession } from "../data/guide-auth";
import {
  createCatalogEditor,
  GuideApiError,
  CatalogConflictError,
  spreadsheetIdFromInput,
} from "../data/catalog-editor";
import { guideConfig } from "../hooks/useGuideAuth";
import { nextRecordIdFromRows } from "../data/record-id";
import { assertRecordId } from "../data/record-id";
import { parseCatalog } from "../data/portal";
import { TripFileCreator } from "./TripFileCreator";
import { DatePicker } from "./DatePicker";
import { RequiredMark } from "./RequiredMark";

export interface EditorTarget {
  trip: Trip | null;
  remove?: boolean;
}
export function formFromTrip(trip: Trip | null): Row {
  return trip
    ? {
        旅程ID: trip.id,
        旅程名稱: trip.name,
        目的地: trip.destination,
        開始日期: trip.start,
        結束日期: trip.end,
        試算表ID: trip.spreadsheetId,
        旅程狀態: trip.status,
        封面圖片網址: trip.cover,
        排序: String(trip.order),
      }
    : {
        旅程ID: "",
        旅程名稱: "",
        目的地: "",
        開始日期: "",
        結束日期: "",
        試算表ID: "",
        旅程狀態: "規劃中",
        封面圖片網址: "",
        排序: "0",
      };
}
export function CatalogEditor({
  target,
  catalogId,
  before,
  session,
  loginBusy,
  authError,
  onLogin,
  onExpired,
  onClose,
  onSaved,
  onBusy,
}: {
  target: EditorTarget;
  catalogId: string;
  before: SheetRows;
  session: GuideSession | null;
  loginBusy: boolean;
  authError: string;
  onLogin: () => void;
  onExpired: () => void;
  onClose: () => void;
  onSaved: (rows: SheetRows) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => {
    const original = formFromTrip(target.trip);
    if (!target.trip) {
      try {
        original["旅程ID"] = nextRecordIdFromRows("trip", before);
      } catch {
        /* Validation explains the error on save. */
      }
    }
    return original;
  });
  const [snapshot, setSnapshot] = useState(before);
  const [conflict, setConflict] = useState<SheetRows | null>(null);
  const [readCheck, setReadCheck] = useState("");
  const [checking, setChecking] = useState(false);
  const close = onClose;
  async function inspect() {
    setChecking(true);
    setReadCheck("");
    try {
      const id = spreadsheetIdFromInput(draft["試算表ID"]);
      const book = await createPortalRepository(
        import.meta.env.VITE_GOOGLE_SHEETS_API_KEY || "",
      ).read(id, ["旅程設定"]);
      const rows = book["旅程設定"],
        index = rows[0]?.indexOf("旅程ID");
      if (
        index === undefined ||
        index < 0 ||
        rows.length !== 2 ||
        rows[1]?.[index] !== draft["旅程ID"]
      )
        throw new Error("旅程設定 ID 與入口不一致，請修正後再公開。");
      setReadCheck("可公開讀取，旅程 ID 一致。");
    } catch (cause) {
      setReadCheck(
        `尚未通過公開讀取檢查：${cause instanceof Error ? cause.message : "請確認共用設定。"} 私人檔案仍可儲存入口。`,
      );
    } finally {
      setChecking(false);
    }
  }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);
  const saving = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
    };
  }, []);
  function field(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setReadCheck("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !session) return;
    saving.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const mutation =
        target.remove && target.trip
          ? { kind: "delete" as const, id: target.trip.id }
          : target.trip
            ? { kind: "edit" as const, id: target.trip.id, draft }
            : { kind: "add" as const, draft };
      const next = await createCatalogEditor(catalogId, guideConfig).save(
        session,
        snapshot,
        mutation,
      );
      onSaved(next);
    } catch (cause) {
      if (cause instanceof CatalogConflictError) setConflict(cause.rows);
      if (cause instanceof GuideApiError && cause.status === 401) onExpired();
      setError(
        cause instanceof Error
          ? cause.message
          : "儲存結果未能確認，請重新讀取清單後再操作。",
      );
    } finally {
      saving.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const title = target.remove
    ? "刪除旅程"
    : target.trip
      ? "編輯旅程"
      : "新增旅程";
  return (
    <dialog
      ref={dialog}
      className="catalog-dialog no-print"
      aria-labelledby="catalog-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving.current) close();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="dialog-heading">
          <h2 id="catalog-editor-title">{title}</h2>
          <button
            type="button"
            className="quiet-button"
            onClick={close}
            disabled={busy}
            aria-label="關閉編輯"
          >
            關閉
          </button>
        </div>
        {authError && (
          <p role="alert" className="form-error">
            {authError}
          </p>
        )}
        {!session && (
          <div className="form-error">
            <p>請重新登入後儲存，已填內容會保留。</p>
            <button
              type="button"
              className="button secondary"
              onClick={onLogin}
              disabled={loginBusy}
            >
              {loginBusy ? "登入中…" : "重新登入"}
            </button>
          </div>
        )}
        {target.remove ? (
          <div className="delete-note">
            <p>確定刪除「{target.trip?.name}」？</p>
            <p className="muted">
              只移除清單紀錄，不會刪除對應的 Google 試算表。
            </p>
          </div>
        ) : (
          <fieldset
            className="catalog-fields"
            disabled={busy || checking || !session}
          >
            <label>
              <span>
                旅程名稱
                <RequiredMark />
              </span>
              <input
                required
                name="tripName"
                value={draft["旅程名稱"]}
                onChange={(e) => field("旅程名稱", e.target.value)}
              />
            </label>
            <label>
              <span>
                目的地
                <RequiredMark />
              </span>
              <input
                required
                name="destination"
                value={draft["目的地"]}
                onChange={(e) => field("目的地", e.target.value)}
              />
            </label>
            <div className="field-pair">
              <label>
                <span>
                  開始日期
                  <RequiredMark />
                </span>
                <DatePicker
                  label="開始日期"
                  required
                  type="date"
                  value={draft["開始日期"]}
                  onChange={(value) => field("開始日期", value)}
                />
              </label>
              <label>
                <span>
                  結束日期
                  <RequiredMark />
                </span>
                <DatePicker
                  label="結束日期"
                  required
                  type="date"
                  min={draft["開始日期"]}
                  value={draft["結束日期"]}
                  start={draft["開始日期"]}
                  onChange={(value) => field("結束日期", value)}
                />
              </label>
            </div>
            <label>
              <span>
                旅程狀態
                <RequiredMark />
              </span>
              <select
                required
                value={draft["旅程狀態"]}
                onChange={(e) => field("旅程狀態", e.target.value)}
              >
                {["規劃中", "即將出發", "旅途中", "已結束"].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              <span>
                旅程試算表 ID 或網址
                <RequiredMark />
              </span>
              <input
                required
                value={draft["試算表ID"]}
                onChange={(e) => field("試算表ID", e.target.value)}
                autoComplete="off"
              />
              <small>請使用此趟旅程的試算表，不是旅程目錄。</small>
            </label>
            <div>
              <button
                type="button"
                className="button secondary"
                disabled={checking}
                onClick={() => void inspect()}
              >
                {checking ? "檢查中…" : "檢查公開讀取"}
              </button>
              {readCheck && (
                <p role="status" className="muted">
                  {readCheck}
                </p>
              )}
            </div>
            {!target.trip && (
              <TripFileCreator
                name={draft["旅程名稱"]}
                tripId={draft["旅程ID"]}
                spreadsheetId={draft["試算表ID"]}
                session={session}
                loginBusy={loginBusy}
                onLogin={onLogin}
                onExpired={onExpired}
                beforeCreate={() => {
                  assertRecordId("trip", draft["旅程ID"]);
                  if (
                    parseCatalog(snapshot).some(
                      (trip) => trip.id === draft["旅程ID"],
                    )
                  )
                    throw new Error("旅程 ID 已被使用，請先修改後再建立檔案。");
                }}
                onCreated={(file) => {
                  field("試算表ID", file.id);
                  setCreatedTripId(file.tripId);
                }}
                onBusy={(value) => {
                  saving.current = value;
                  setBusy(value);
                  onBusy(value);
                }}
              />
            )}
            <label>
              <span>
                旅程 ID
                <RequiredMark />
              </span>
              <input
                required
                value={draft["旅程ID"]}
                readOnly={!!target.trip || !!createdTripId}
                onChange={(e) => field("旅程ID", e.target.value)}
                pattern="T([0-9]{3}|[1-9][0-9]{3})"
                autoComplete="off"
              />
              <small>
                {target.trip || createdTripId
                  ? "既有 ID 固定。"
                  : "預設自動編號，可修改為未使用的 T001～T9999。"}
                請與旅程試算表「旅程設定」中的旅程ID保持一致。
              </small>
            </label>
            <label>
              封面圖片網址（選填）
              <input
                type="url"
                value={draft["封面圖片網址"]}
                onChange={(e) => field("封面圖片網址", e.target.value)}
              />
            </label>
            <label>
              排序
              <input
                type="number"
                step="any"
                value={draft["排序"]}
                onChange={(e) => field("排序", e.target.value)}
              />
              <small>數字越小越前面。</small>
            </label>
          </fieldset>
        )}
        {conflict && (
          <div className="warning-box" role="status">
            <p>
              最新清單與編輯時不同。請比較後採用最新版本作為儲存基準；目前表單內容不會被清除。
            </p>
            <pre className="conflict-preview">
              {JSON.stringify(
                conflict,
                (_key, value) =>
                  typeof value === "string" ? displayDate(value) : value,
                2,
              )}
            </pre>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setSnapshot(conflict);
                setConflict(null);
                setError("已重新載入清單，請確認表單內容後再按儲存。");
              }}
            >
              採用最新清單並保留目前輸入
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            onClick={close}
            disabled={busy}
          >
            取消
          </button>
          <button
            className={`button ${target.remove ? "danger-button" : ""}`}
            type="submit"
            disabled={
              busy ||
              checking ||
              !!conflict ||
              !session ||
              (!target.remove && !draft["旅程ID"])
            }
          >
            {busy ? "儲存中…" : target.remove ? "確認刪除" : "儲存"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
