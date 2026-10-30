import { ItineraryTagInput } from "./ItineraryTagInput";
import { confirmTripEditorClose } from "../data/editor-close";
import { ItineraryList } from "./ItineraryList";
import { CloseButton } from "./CloseButton";
import bookingStyles from "./BookingCards.module.css";
import { displayDate, displayDateTime } from "../data/display-date";
import { useEffect, useRef, useState } from "react";
import type { Trip, Row, Workbook } from "../data/portal";
import { money, toMinor } from "../data/portal";
import type { GuideSession } from "../data/guide-auth";
import { isSuperUser } from "../data/guide-auth";
import { guideConfig } from "../hooks/useGuideAuth";
import { nextRecordIdFromRows, nextRecordId } from "../data/record-id";
import rules from "../data/id-rules.json" with { type: "json" };
import type { RecordKind } from "../data/record-id";
import { normalizeLocalDateTime } from "../data/timezone";
import { DatePicker } from "./DatePicker";
import { RequiredMark } from "./RequiredMark";
import {
  tripDates,
  itinerarySubtitle,
  itineraryDateLabel,
  itineraryTags,
  orderedItinerary,
} from "../data/itinerary";
import {
  createTripEditor,
  readRows,
  TripEditApiError,
  mutateTripBook,
  isPersonalAmountInput,
} from "../data/trip-editor";
import type {
  EditorScope,
  EditorSnapshot,
  TripMutation,
  BasicSheet,
  ShareInput,
  ReceiptInput,
} from "../data/trip-editor";

type Entity = BasicSheet | "公積金" | "行前費用" | "收款";
const entities: Record<EditorScope, Entity[]> = {
  itinerary: ["每日行程", "航班", "飯店"],
  accounting: ["公積金", "行前費用", "收款", "團員"],
  tasks: ["開團待辦"],
};
const names: Record<Entity, string> = {
  每日行程: "每日行程",
  航班: "航班",
  飯店: "飯店",
  團員: "團員",
  開團待辦: "進度事項",
  公積金: "公積金交易",
  行前費用: "行前費用",
  收款: "收款批次",
};
const entityKind: Record<Entity, RecordKind> = {
  每日行程: "itinerary",
  航班: "flight",
  飯店: "hotel",
  團員: "member",
  開團待辦: "task",
  公積金: "fund",
  行前費用: "expense",
  收款: "batch",
};
const scopeNames: Record<EditorScope, string> = {
  itinerary: "行程",
  accounting: "帳務",
  tasks: "進度",
};
function items(book: Workbook, entity: Entity): Row[] {
  if (entity === "公積金") return readRows(book, "公積金交易");
  if (entity === "行前費用")
    return readRows(book, "支出明細").filter(
      (row) => row["支付方式"] === "行前收款",
    );
  if (entity === "收款") {
    const rows = readRows(book, "收款明細");
    return rows.filter(
      (row, index) =>
        rows.findIndex((item) => item["收款批次ID"] === row["收款批次ID"]) ===
        index,
    );
  }
  return readRows(book, entity);
}
function itemId(entity: Entity, row: Row) {
  return row[rules[entityKind[entity]].column];
}
function itemLabel(entity: Entity, row: Row, book: Workbook) {
  if (entity === "收款")
    return `${readRows(book, "團員").find((member) => member["團員ID"] === row["團員ID"])?.["顯示名稱"] || ""} - ${displayDate(row["收款日期"])}`;
  return (
    row["標題"] ||
    row["項目"] ||
    row["事項"] ||
    row["飯店名稱"] ||
    row["航班編號"] ||
    row["顯示名稱"]
  );
}
function itemAmount(entity: Entity, row: Row, book: Workbook): string {
  if (entity === "公積金")
    return money(
      toMinor(row["記帳金額"], readRows(book, "旅程設定")[0]["記帳幣別"]),
      readRows(book, "旅程設定")[0]["記帳幣別"],
    );
  if (entity === "行前費用") return money(toMinor(row["金額"], "TWD"), "TWD");
  if (entity === "收款")
    return money(
      readRows(book, "收款明細")
        .filter((item) => item["收款批次ID"] === row["收款批次ID"])
        .reduce((sum, item) => sum + toMinor(item["實收金額"], "TWD"), 0),
      "TWD",
    );
  return "";
}
export function TripEditing({
  trip,
  tab,
  session,
  loginBusy,
  onLogin,
  onExpired,
  onBusy,
  onSaved,
}: {
  trip: Trip;
  tab: string;
  session: GuideSession | null;
  loginBusy: boolean;
  onLogin: () => void;
  onExpired: () => void;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<EditorScope | null>(null);
  const available: EditorScope[] =
    tab === "overview"
      ? ["tasks", "itinerary", "accounting"]
      : [
          tab === "tasks"
            ? "tasks"
            : tab === "itinerary"
              ? "itinerary"
              : "accounting",
        ];
  return (
    <>
      {session && (
        <div className="trip-edit-tools no-print">
          {available.map((value) => (
            <button
              key={value}
              className="button secondary"
              onClick={() => setScope(value)}
            >
              編輯{scopeNames[value]}
            </button>
          ))}
        </div>
      )}
      {scope && (
        <TripEditor
          key={scope}
          trip={trip}
          scope={scope}
          initialEntity={tab === "expenses" ? "行前費用" : undefined}
          session={session}
          loginBusy={loginBusy}
          onLogin={onLogin}
          onExpired={onExpired}
          onBusy={onBusy}
          onSaved={onSaved}
          onClose={() => setScope(null)}
        />
      )}
    </>
  );
}
export function TripEditor({
  trip,
  scope,
  initialEntity,
  session,
  loginBusy,
  onLogin,
  onExpired,
  onBusy,
  onSaved,
  onClose,
}: {
  trip: Trip;
  scope: EditorScope;
  initialEntity?: Entity;
  session: GuideSession | null;
  loginBusy: boolean;
  onLogin: () => void;
  onExpired: () => void;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [owner, setOwner] = useState("");
  const [entity, setEntity] = useState<Entity>(
    initialEntity && entities[scope].includes(initialEntity)
      ? initialEntity
      : entities[scope][0],
  );
  const [target, setTarget] = useState<{
    entity: Entity;
    row: Row | null;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [needsReload, setNeedsReload] = useState(false),
    [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [itineraryDay, setItineraryDay] = useState("all");
  const active = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setSnapshot(null);
    setError("");
    setTarget(null);
    setNeedsReload(false);
    createTripEditor(trip, scope, guideConfig)
      .read(session)
      .then((value) => {
        if (!cancelled) {
          setSnapshot(value);
          setOwner(session.email);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          if (cause instanceof TripEditApiError && cause.status === 401)
            onExpired();
          setError(
            cause instanceof Error ? cause.message : "無法讀取編輯資料。",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trip, scope, session, revision]);
  async function save(mutation: TripMutation) {
    if (!session || !snapshot || active.current || needsReload) return;
    active.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const next = await createTripEditor(trip, scope, guideConfig).save(
        session,
        snapshot,
        mutation,
      );
      setSnapshot(next);
      setTarget(null);
      setNotice(mutation.kind === "duplicate" ? "已複製。" : "已儲存。");
      onSaved();
    } catch (cause) {
      if (cause instanceof TripEditApiError && cause.status === 401)
        onExpired();
      setError(
        cause instanceof Error ? cause.message : "儲存失敗，請重新讀取後確認。",
      );
      // Any failed save must be checked against Google again before another write.
      setNeedsReload(true);
    } finally {
      active.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  function duplicate(row: Row) {
    if (entity === "每日行程" || entity === "航班" || entity === "飯店") {
      void save({ kind: "duplicate", sheet: entity, id: itemId(entity, row) });
    }
  }
  function remove(row: Row) {
    const id = itemId(entity, row);
    if (
      !window.confirm(
        `確定刪除「${itemLabel(entity, row, snapshot!.book)}」？${entity === "公積金" ? "相關分攤與支出紀錄也會一併移除。" : entity === "收款" ? "本批次全部收款明細將一併刪除。" : ""}`,
      )
    )
      return;
    const mutation: TripMutation =
      entity === "公積金"
        ? {
            kind: "fund",
            mode: "delete",
            id,
            values: {},
            shares: [],
            expense: {},
          }
        : entity === "行前費用"
          ? { kind: "expense", mode: "delete", id, values: {}, shares: [] }
          : entity === "收款"
            ? {
                kind: "receipt",
                mode: "delete",
                id,
                values: {},
                allocations: [],
              }
            : { kind: "record", mode: "delete", sheet: entity, id, values: {} };
    void save(mutation);
  }
  function requestClose() {
    if (
      confirmTripEditorClose(!!target, active.current || busy, (message) =>
        window.confirm(message),
      )
    )
      onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="catalog-dialog trip-editor no-print"
      aria-labelledby="trip-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
    >
      <div className="trip-editor-body">
        <div className="dialog-heading">
          <h2 id="trip-editor-title">編輯{scopeNames[scope]}</h2>
          <CloseButton onClick={requestClose} disabled={busy} />
        </div>
        {!session ? (
          <div className="form-error">
            <p>請登入導遊帳號後編輯。</p>
            <button className="button" disabled={loginBusy} onClick={onLogin}>
              {loginBusy ? "登入中…" : "重新登入"}
            </button>
          </div>
        ) : (
          <>
            {notice && !target && (
              <p className="save-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {(needsReload || (!loading && !snapshot)) && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setRevision((value) => value + 1)}
              >
                重新讀取編輯資料
              </button>
            )}
            {loading ? (
              <p role="status">讀取編輯資料中…</p>
            ) : snapshot && owner === session.email && !needsReload ? (
              <>
                {target ? (
                  <TripForm
                    key={`${target.entity}:${target.row ? itemId(target.entity, target.row) : "new"}`}
                    trip={trip}
                    book={snapshot.book}
                    entity={target.entity}
                    row={target.row}
                    busy={busy}
                    initialDate={
                      target.entity === "每日行程" && itineraryDay !== "all"
                        ? itineraryDay
                        : undefined
                    }
                    canEditIds={isSuperUser(session, guideConfig)}
                    onCancel={() => setTarget(null)}
                    onSave={(mutation) => void save(mutation)}
                  />
                ) : (
                  <>
                    <div className="editor-list-toolbar">
                      <label>
                        <span className="sr-only">資料類型</span>
                        <select
                          value={entity}
                          disabled={busy}
                          onChange={(event) => {
                            setNotice("");
                            setEntity(event.target.value as Entity);
                          }}
                        >
                          {entities[scope].map((value) => (
                            <option key={value} value={value}>
                              {names[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          try {
                            nextRecordIdFromRows(
                              entityKind[entity],
                              snapshot.book[rules[entityKind[entity]].table],
                            );
                            setNotice("");
                            setTarget({ entity, row: null });
                            setError("");
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : "無法產生 ID。",
                            );
                          }
                        }}
                      >
                        新增{names[entity]}
                      </button>
                    </div>
                    {entity === "每日行程" ? (
                      <ItineraryList
                        trip={trip}
                        rows={items(snapshot.book, entity)}
                        day={itineraryDay}
                        onDay={setItineraryDay}
                        busy={busy}
                        onEdit={(row) => {
                          setNotice("");
                          setTarget({ entity, row });
                        }}
                        onRemove={remove}
                        onDuplicate={duplicate}
                        onReorder={(mutation) => void save(mutation)}
                      />
                    ) : (
                      <div
                        className={`editor-records${entity === "航班" || entity === "飯店" ? ` ${bookingStyles["booking-records"]}` : ""}`}
                      >
                        {items(snapshot.book, entity).map((row) => (
                          <article
                            className={`editor-record${entity === "航班" || entity === "飯店" ? ` ${bookingStyles["booking-card"]}` : ""}`}
                            key={itemId(entity, row)}
                          >
                            <div>
                              <strong>
                                {itemLabel(entity, row, snapshot.book)}
                              </strong>
                              {itemAmount(entity, row, snapshot.book) && (
                                <span className="editor-record-amount">
                                  {itemAmount(entity, row, snapshot.book)}
                                </span>
                              )}
                              <small>
                                {displayDateTime(
                                  row["日期"] ||
                                    row["截止日期"] ||
                                    row["入住日期"] ||
                                    row["出發時間"] ||
                                    "",
                                )}{" "}
                                {row["類型"] || row["狀態"] || ""}
                              </small>
                            </div>
                            <div className="editor-row-actions">
                              {scope === "itinerary" && (
                                <button
                                  type="button"
                                  className="quiet-button"
                                  disabled={busy}
                                  onClick={() => duplicate(row)}
                                >
                                  複製
                                </button>
                              )}
                              <button
                                className="quiet-button"
                                disabled={busy}
                                onClick={() => {
                                  setNotice("");
                                  setTarget({ entity, row });
                                }}
                              >
                                編輯
                              </button>
                              <button
                                className="quiet-button delete-button"
                                disabled={busy}
                                onClick={() => remove(row)}
                              >
                                刪除
                              </button>
                            </div>
                          </article>
                        ))}
                        {!items(snapshot.book, entity).length && (
                          <p className="muted">尚無{names[entity]}。</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}

type Field = {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  relation?: BasicSheet;
  startKey?: string;
};
const fields: Record<BasicSheet, Field[]> = {
  團員: [
    { key: "顯示名稱", required: true },
    { key: "排序", type: "number" },
  ],
  開團待辦: [
    { key: "事項", required: true },
    { key: "分類" },
    { key: "截止日期", type: "date", required: true },
    {
      key: "狀態",
      required: true,
      options: ["待辦", "進行中", "已完成", "已取消"],
    },
    { key: "完成日期", type: "date" },
    { key: "負責團員ID", label: "負責人", relation: "團員" },
    { key: "排序", type: "number" },
    { key: "備註", type: "textarea" },
  ],
  飯店: [
    { key: "飯店名稱", required: true },
    { key: "副標題" },
    { key: "飯店圖片網址", type: "url" },
    { key: "入住日期", type: "date", required: true },
    { key: "入住時間", type: "time" },
    { key: "退房日期", type: "date", required: true, startKey: "入住日期" },
    { key: "退房時間", type: "time" },
    { key: "地址", required: true },
    { key: "電話" },
    { key: "價格" },
    { key: "地圖網址", type: "url" },
    { key: "訂房網站網址", label: "訂房網站", type: "url" },
    { key: "備註", type: "textarea" },
  ],
  航班: [
    { key: "航空公司", required: true },
    { key: "航班編號", required: true },
    { key: "出發機場", required: true },
    { key: "出發航廈" },
    { key: "抵達機場", required: true },
    { key: "抵達航廈" },
    {
      key: "出發時間",
      label: "出發當地時間",
      type: "datetime-local",
      required: true,
    },
    {
      key: "抵達時間",
      label: "抵達當地時間",
      type: "datetime-local",
      required: true,
      startKey: "出發時間",
    },
    { key: "行李說明" },
    { key: "備註", type: "textarea" },
  ],
  每日行程: [
    { key: "日期", type: "date", required: true },
    { key: "開始時間", label: "時間", type: "time" },
    { key: "標題", required: true, type: "textarea" },
    { key: "說明", label: "副標", type: "textarea" },
    { key: "內文", type: "textarea" },
    { key: "類型", label: "標籤" },
  ],
};
function defaultValues(book: Workbook, entity: Entity, row: Row | null): Row {
  const kind = entityKind[entity],
    key = rules[kind].column;
  const value: Row = row
    ? { ...row }
    : {
        [key]: nextRecordIdFromRows(kind, book[rules[kind].table]),
        排序: "10",
      };
  if (!row) {
    if (entity === "公積金") value["類型"] = "儲值";
    if (entity === "開團待辦") value["狀態"] = "待辦";
  }
  if (entity === "每日行程" && row) value["說明"] = itinerarySubtitle(row);
  if (entity === "公積金" && row && row["類型"] !== "調整")
    value["記帳金額"] = row["記帳金額"].replace(/^-/, "");
  if (entity === "航班" && row)
    for (const prefix of ["出發", "抵達"]) {
      value[prefix + "時間"] = row[prefix + "時間"].slice(0, 16);
    }
  return value;
}
export function TripForm({
  trip,
  book,
  entity,
  row,
  busy,
  onCancel,
  onSave,
  canEditIds = false,
  initialDate,
}: {
  trip: Trip;
  book: Workbook;
  entity: Entity;
  row: Row | null;
  busy: boolean;
  canEditIds?: boolean;
  initialDate?: string;
  onCancel: () => void;
  onSave: (mutation: TripMutation) => void;
}) {
  const [values, setValues] = useState<Row>(() => ({
    ...defaultValues(book, entity, row),
    ...(!row && entity === "每日行程" && initialDate
      ? { 日期: initialDate }
      : {}),
  }));
  const kind = entityKind[entity],
    idKey = rules[kind].column;
  const members = readRows(book, "團員"),
    currency = readRows(book, "旅程設定")[0]["記帳幣別"];
  const [shares, setShares] = useState<ShareInput[]>(() =>
    row && entity === "公積金"
      ? readRows(book, "公積金分攤")
          .filter((item) => item["交易ID"] === row["交易ID"])
          .map((item) => ({
            memberId: item["團員ID"],
            amount:
              row["類型"] === "退款"
                ? item["個人金額"].replace(/^-/, "")
                : item["個人金額"],
          }))
      : row && entity === "行前費用"
        ? readRows(book, "行前費用分攤")
            .filter((item) => item["支出ID"] === row["支出ID"])
            .map((item) => ({
              memberId: item["團員ID"],
              amount: item["應繳金額"],
            }))
        : [],
  );
  const [expense, setExpense] = useState<Row>(() =>
    row && entity === "公積金"
      ? readRows(book, "支出明細").find(
          (item) => item["公積金交易ID"] === row["交易ID"],
        ) || {
          支出ID: nextRecordIdFromRows("expense", book["支出明細"]),
          分類: "其他",
        }
      : {
          支出ID:
            entity === "公積金"
              ? nextRecordIdFromRows("expense", book["支出明細"])
              : "",
          分類: "其他",
        },
  );
  const [allocations, setAllocations] = useState<
    (ReceiptInput & { locked?: boolean })[]
  >(() =>
    row && entity === "收款"
      ? readRows(book, "收款明細")
          .filter((item) => item["收款批次ID"] === row["收款批次ID"])
          .map((item) => ({
            expenseId: item["支出ID"],
            amount: item["實收金額"],
            id: item["收款明細ID"],
            locked: true,
          }))
      : [],
  );
  const [error, setError] = useState("");
  function field(key: string, value: string) {
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "狀態"
        ? {
            完成日期: value === "已完成" ? current["完成日期"] || "" : "",
          }
        : {}),
    }));
  }
  function renderField(def: Field) {
    const {
      key,
      label = key,
      type = "text",
      required,
      options,
      relation,
      startKey,
    } = def;
    const isRequired =
      required || (key === "完成日期" && values["狀態"] === "已完成");
    return (
      <label key={key}>
        <span>
          {label}
          {isRequired && <RequiredMark />}
        </span>
        {entity === "每日行程" && key === "日期" ? (
          <select
            required
            value={values[key] || ""}
            onChange={(event) => field(key, event.target.value)}
          >
            <option value="">選擇日期</option>
            {tripDates(trip.start, trip.end).map((date) => (
              <option key={date} value={date}>
                {itineraryDateLabel(date, trip.start, trip.end)}
              </option>
            ))}
          </select>
        ) : entity === "每日行程" && key === "類型" ? (
          <ItineraryTagInput
            value={values[key] || ""}
            tags={itineraryTags(orderedItinerary(readRows(book, "每日行程")))}
            disabled={busy}
            onChange={(value) => field(key, value)}
          />
        ) : relation ? (
          <select
            value={values[key] || ""}
            required={isRequired}
            onChange={(event) => field(key, event.target.value)}
          >
            <option value="">未指定</option>
            {readRows(book, relation).map((item) => (
              <option
                key={itemId(relation, item)}
                value={itemId(relation, item)}
              >
                {itemLabel(relation, item, book)}
                {canEditIds && `（${itemId(relation, item)}）`}
              </option>
            ))}
          </select>
        ) : options ? (
          <select
            required={isRequired}
            value={values[key] || options[0]}
            onChange={(event) => field(key, event.target.value)}
          >
            {[
              ...new Set([...options, ...(values[key] ? [values[key]] : [])]),
            ].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : type === "date" || type === "datetime-local" || type === "time" ? (
          <DatePicker
            type={type}
            label={label}
            value={values[key] || ""}
            start={
              startKey && values[startKey]
                ? values[startKey]
                : entity === "行前費用"
                  ? ""
                  : trip.start
            }
            required={isRequired}
            disabled={key === "完成日期" && values["狀態"] !== "已完成"}
            onChange={(value) => field(key, value)}
          />
        ) : type === "textarea" ? (
          <textarea
            required={isRequired}
            value={values[key] || ""}
            onChange={(event) => field(key, event.target.value)}
            rows={key === "內文" ? 8 : key === "標題" ? 2 : 3}
          />
        ) : (
          <input
            type={type}
            required={isRequired}
            disabled={key === "完成日期" && values["狀態"] !== "已完成"}
            step={type === "number" ? "any" : undefined}
            value={values[key] || ""}
            onChange={(event) => field(key, event.target.value)}
          />
        )}
      </label>
    );
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      let mutation: TripMutation;
      if (entity === "公積金")
        mutation = {
          kind: "fund",
          mode: row ? "edit" : "add",
          id: row?.["交易ID"],
          values,
          shares,
          expense,
        };
      else if (entity === "行前費用")
        mutation = {
          kind: "expense",
          mode: row ? "edit" : "add",
          id: row?.["支出ID"],
          values,
          shares,
        };
      else if (entity === "收款")
        mutation = {
          kind: "receipt",
          mode: row ? "edit" : "add",
          id: row?.["收款批次ID"],
          values,
          allocations,
        };
      else {
        const clean = { ...values };
        if (entity === "每日行程") {
          clean["結束時間"] = "";
          clean["地點"] = "";
          clean["地圖網址"] = "";
        }
        if (entity === "航班")
          for (const prefix of ["出發", "抵達"]) {
            const original = row?.[prefix + "時間"];
            clean[prefix + "時間"] =
              original && original.slice(0, 16) === values[prefix + "時間"]
                ? original
                : normalizeLocalDateTime(values[prefix + "時間"]);
          }
        mutation = {
          kind: "record",
          mode: row ? "edit" : "add",
          sheet: entity,
          id: row?.[idKey],
          values: clean,
        };
      }
      mutateTripBook(trip, book, mutation);
      onSave(mutation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "請檢查欄位。");
    }
  }
  const financial = entity === "公積金" || entity === "行前費用";
  let preview = "";
  try {
    if (
      entity === "公積金" &&
      values["類型"] === "支出" &&
      values["記帳金額"] &&
      shares.length
    ) {
      const amount = toMinor(values["記帳金額"], currency),
        perPerson = Math.ceil(amount / shares.length);
      preview = `${shares.length} 人各扣 ${money(perPerson, currency)}，公共餘款增加 ${money(perPerson * shares.length - amount, currency)}`;
    }
  } catch {
    /* Validation is shown on save. */
  }
  try {
    if (
      entity === "公積金" &&
      values["類型"] !== "支出" &&
      shares.length &&
      shares.every((share) => share.amount)
    )
      preview = `合計 ${money(
        shares.reduce((sum, share) => sum + toMinor(share.amount, currency), 0),
        currency,
      )}`;
    if (
      entity === "行前費用" &&
      shares.length &&
      shares.every((share) => share.amount)
    )
      preview = `個人應繳合計 ${money(
        shares.reduce((sum, share) => sum + toMinor(share.amount, "TWD"), 0),
        "TWD",
      )}`;
    if (
      entity === "收款" &&
      allocations.length &&
      allocations.every((item) => item.amount)
    )
      preview = `本批次合計 ${money(
        allocations.reduce((sum, item) => sum + toMinor(item.amount, "TWD"), 0),
        "TWD",
      )}`;
  } catch {
    /* Amount errors are handled by form validation. */
  }
  return (
    <form onSubmit={submit} className="trip-record-form">
      <h3>
        {row ? "編輯" : "新增"}
        {names[entity]}
      </h3>
      <fieldset className="catalog-fields" disabled={busy}>
        {canEditIds && (
          <label>
            <span>
              {names[entity]} ID
              <RequiredMark />
            </span>
            <input
              required
              readOnly={!!row}
              value={values[idKey] || ""}
              onChange={(event) => field(idKey, event.target.value)}
            />
          </label>
        )}
        {financial ? (
          <>
            {renderField({ key: "日期", type: "date", required: true })}
            {renderField({ key: "項目", required: true })}
            {entity === "公積金"
              ? renderField({
                  key: "類型",
                  options: ["儲值", "支出", "退款", "調整"],
                  required: true,
                })
              : null}
            {(entity === "行前費用" || values["類型"] === "支出") &&
              renderField({
                key: entity === "行前費用" ? "金額" : "記帳金額",
                label: `${entity === "行前費用" ? "實際刷卡金額" : "實際支出金額"}（${entity === "行前費用" ? "TWD" : currency}）`,
                required: true,
              })}
            {entity === "行前費用" &&
              renderField({ key: "分類", required: true })}
            {entity === "公積金" && values["類型"] === "支出" && (
              <>
                {canEditIds && (
                  <label>
                    <span>
                      支出 ID
                      <RequiredMark />
                    </span>
                    <input
                      required
                      readOnly={
                        !!row &&
                        !!readRows(book, "支出明細").find(
                          (item) => item["公積金交易ID"] === row["交易ID"],
                        )
                      }
                      value={expense["支出ID"]}
                      onChange={(event) =>
                        setExpense((current) => ({
                          ...current,
                          支出ID: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}
                <label>
                  <span>
                    分類
                    <RequiredMark />
                  </span>
                  <input
                    required
                    value={expense["分類"]}
                    onChange={(event) =>
                      setExpense((current) => ({
                        ...current,
                        分類: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            )}
            <div className="participant-fields">
              <h4>
                {entity === "行前費用"
                  ? "個人應繳（TWD）"
                  : values["類型"] === "支出"
                    ? "實際參與者"
                    : `個人金額（${currency}）`}
                <RequiredMark />
              </h4>
              {!members.length && (
                <p className="muted">請先在團員管理新增團員。</p>
              )}
              {members.map((member) => {
                const share = shares.find(
                  (item) => item.memberId === member["團員ID"],
                );
                return (
                  <div className="participant-row" key={member["團員ID"]}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!share}
                        onChange={(event) =>
                          setShares((current) =>
                            event.target.checked
                              ? [
                                  ...current,
                                  { memberId: member["團員ID"], amount: "" },
                                ]
                              : current.filter(
                                  (item) => item.memberId !== member["團員ID"],
                                ),
                          )
                        }
                      />
                      {member["顯示名稱"]}
                      {share &&
                        !(entity === "公積金" && values["類型"] === "支出") && (
                          <RequiredMark />
                        )}
                    </label>
                    {share &&
                      !(entity === "公積金" && values["類型"] === "支出") && (
                        <input
                          required
                          type="text"
                          inputMode={
                            entity === "公積金" && values["類型"] === "調整"
                              ? "text"
                              : "numeric"
                          }
                          pattern="-?[0-9]+"
                          aria-label={`${member["顯示名稱"]}金額`}
                          value={share.amount}
                          onChange={(event) => {
                            if (!isPersonalAmountInput(event.target.value))
                              return;
                            setShares((current) =>
                              current.map((item) =>
                                item.memberId === share.memberId
                                  ? { ...item, amount: event.target.value }
                                  : item,
                              ),
                            );
                          }}
                        />
                      )}
                  </div>
                );
              })}
            </div>
            {preview && (
              <p role="status" className="muted">
                {preview}
              </p>
            )}
            {entity === "公積金" && values["類型"] !== "支出" && (
              <p className="muted">
                交易金額由個人金額加總；退款請填正數，調整可填正負金額且須說明原因。
              </p>
            )}
            {renderField({
              key: "備註",
              label:
                entity === "公積金" && values["類型"] === "調整"
                  ? "調整原因"
                  : "備註",
              type: "textarea",
              required: entity === "公積金" && values["類型"] === "調整",
            })}
          </>
        ) : entity === "收款" ? (
          <>
            {renderField({ key: "收款日期", type: "date", required: true })}
            {renderField({
              key: "團員ID",
              label: "繳款團員",
              relation: "團員",
              required: true,
            })}
            <div className="receipt-allocations">
              <h4>本次收款項目（TWD）</h4>
              {allocations.map((allocation, index) => (
                <div key={index} className="receipt-allocation">
                  <label>
                    <span>
                      行前費用
                      <RequiredMark />
                    </span>
                    <select
                      required
                      value={allocation.expenseId}
                      onChange={(event) =>
                        setAllocations((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, expenseId: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">選擇項目</option>
                      {readRows(book, "行前費用分攤")
                        .filter((item) => item["團員ID"] === values["團員ID"])
                        .map((item) => (
                          <option key={item["支出ID"]} value={item["支出ID"]}>
                            {
                              readRows(book, "支出明細").find(
                                (expense) =>
                                  expense["支出ID"] === item["支出ID"],
                              )?.["項目"]
                            }
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>
                      實收金額
                      <RequiredMark />
                    </span>
                    <input
                      required
                      inputMode="decimal"
                      value={allocation.amount}
                      onChange={(event) =>
                        setAllocations((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  {canEditIds && (
                    <label>
                      <span>
                        收款明細 ID
                        <RequiredMark />
                      </span>
                      <input
                        required
                        readOnly={allocation.locked === true}
                        value={allocation.id}
                        onChange={(event) =>
                          setAllocations((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, id: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="quiet-button delete-button"
                    onClick={() =>
                      setAllocations((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    移除此項
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  try {
                    const id = nextRecordId("receipt", [
                      ...readRows(book, "收款明細").map(
                        (item) => item["收款明細ID"],
                      ),
                      ...allocations.map((item) => item.id),
                    ]);
                    setAllocations((current) => [
                      ...current,
                      { expenseId: "", amount: "", id },
                    ]);
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "無法產生 ID。",
                    );
                  }
                }}
              >
                加入收款項目
              </button>
            </div>
            {renderField({ key: "備註", type: "textarea" })}
          </>
        ) : (
          fields[entity].map(renderField)
        )}
        {entity === "航班" && row?.["航廈"] && (
          <p className="muted">
            既有航廈資訊：{row["航廈"]}，請確認後分別填入出發與抵達航廈。
          </p>
        )}
      </fieldset>
      {entity === "收款" && preview && (
        <p role="status" className="muted">
          {preview}
        </p>
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
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </button>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}
