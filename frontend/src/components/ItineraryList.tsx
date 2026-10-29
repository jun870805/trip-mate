import { useItineraryDrag } from "../hooks/useItineraryDrag";
import { Fragment, useEffect, useRef, useState } from "react";
import type { Row, Trip } from "../data/portal";
import type { TripMutation } from "../data/trip-editor";
import {
  tripDates,
  orderedItinerary,
  moveItineraryToDay,
  itineraryDateLabel,
  readReorderPreference,
  writeReorderPreference,
} from "../data/itinerary";
import { Empty, Icon } from "./ui";
import { CloseButton } from "./CloseButton";
import styles from "./ItineraryList.module.css";

type Move = { row: Row; ids: string[]; conflict: boolean };
function ConflictDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (skip: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [skip, setSkip] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`catalog-dialog no-print ${styles.conflictDialog}`}
      aria-labelledby="reorder-title"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className={styles.confirm}>
        <div className="dialog-heading">
          <h2 id="reorder-title">調整行程順序</h2>
          <CloseButton onClick={onCancel} />
        </div>
        <p>
          調整後的順序與時間不符。繼續會移除這筆行程的時間，並依新順序儲存。
        </p>
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={skip}
            onChange={(event) => setSkip(event.target.checked)}
          />
          不再提醒
        </label>
        <div className={styles.actions}>
          <button type="button" className="button secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="button"
            onClick={() => onConfirm(skip)}
          >
            移除時間並排序
          </button>
        </div>
      </div>
    </dialog>
  );
}
export function ItineraryList({
  trip,
  rows,
  day,
  onDay,
  busy,
  onEdit,
  onRemove,
  onReorder,
}: {
  trip: Trip;
  rows: Row[];
  day: string;
  onDay: (day: string) => void;
  busy: boolean;
  onEdit: (row: Row) => void;
  onRemove: (row: Row) => void;
  onReorder: (mutation: TripMutation) => void;
}) {
  const dates = [
    ...new Set([
      ...tripDates(trip.start, trip.end),
      ...rows.map((row) => row["日期"]),
    ]),
  ].sort();
  const entries = orderedItinerary(
    rows.filter((row) => day === "all" || row["日期"] === day),
  );
  const [pending, setPending] = useState<Move | null>(null);
  const [notice, setNotice] = useState("");
  const revision = JSON.stringify([
    day,
    entries.map((row) => [
      row["行程ID"],
      row["日期"],
      row["排序"],
      row["開始時間"],
    ]),
  ]);
  const drag = useItineraryDrag({
    revision,
    disabled: busy || !!pending,
    onDrop: move,
  });
  const dragging = !!drag.preview?.dragging;

  function commit(move: Move, skip = false) {
    if (skip) {
      try {
        if (
          !writeReorderPreference(
            window.localStorage,
            import.meta.env.BASE_URL,
            true,
          )
        )
          setNotice("瀏覽器無法保存「不再提醒」，下次仍會顯示提示。");
      } catch {
        setNotice("瀏覽器無法保存「不再提醒」，下次仍會顯示提示。");
      }
    }
    setPending(null);
    onReorder({
      kind: "record",
      mode: "edit",
      sheet: "每日行程",
      id: move.row["行程ID"],
      values: {
        ...move.row,
        ...(move.conflict ? { 開始時間: "", 結束時間: "" } : {}),
      },
      itineraryOrder: move.ids,
    });
  }
  function move(id: string, date: string, index: number) {
    if (busy || pending || date < trip.start || date > trip.end) return false;
    const row = rows.find((row) => row["行程ID"] === id);
    if (!row) return false;
    const current = orderedItinerary(
      rows.filter((row) => row["日期"] === date),
    );
    if (
      row["日期"] === date &&
      current.findIndex((row) => row["行程ID"] === id) === index
    )
      return false;
    if (
      index < 0 ||
      index > current.filter((row) => row["行程ID"] !== id).length
    )
      return false;
    const result = moveItineraryToDay(rows, id, date, index);
    const value = {
      row: result.rows.find((row) => row["行程ID"] === id)!,
      ids: result.rows.map((row) => row["行程ID"]),
      conflict: result.conflict,
    };
    let skip = false;
    try {
      skip = readReorderPreference(
        window.localStorage,
        import.meta.env.BASE_URL,
      );
    } catch {
      /* Ask again if storage is inaccessible. */
    }
    if (value.conflict && !skip) setPending(value);
    else commit(value);
    return true;
  }
  return (
    <>
      <label className={styles.date}>
        <span className="sr-only">日期</span>
        <select
          aria-label="編輯行程日期"
          value={day}
          disabled={busy || dragging}
          onChange={(event) => onDay(event.target.value)}
        >
          <option value="all">全部日期</option>
          {dates.map((date) => (
            <option key={date} value={date}>
              {itineraryDateLabel(date, trip.start, trip.end)}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        按住拖曳圖示調整順序；選擇全部日期可跨天移動。
      </p>
      {notice && (
        <p role="status" className="form-error">
          {notice}
        </p>
      )}
      <div ref={drag.list} className={styles.list}>
        {(day === "all" ? dates : [day]).map((date) => {
          const dateRows = entries.filter((row) => row["日期"] === date);
          const remaining = dateRows.filter(
            (row) => row["行程ID"] !== drag.preview?.id,
          );
          const target = drag.preview?.date === date;
          const placeholder = (
            <div
              className={styles.placeholder}
              data-drag-placeholder="true"
              aria-hidden="true"
              style={{ height: drag.preview?.height }}
            />
          );
          return (
            <section
              key={date}
              className={styles.day}
              data-drop-date={
                date >= trip.start && date <= trip.end ? date : undefined
              }
            >
              {day === "all" && (
                <h3 className={styles.dayHeading}>
                  {itineraryDateLabel(date, trip.start, trip.end)}
                </h3>
              )}
              <div className={styles.dayRows}>
                {dateRows.map((row, index) => (
                  <Fragment key={row["行程ID"]}>
                    {target &&
                      row["行程ID"] !== drag.preview?.id &&
                      remaining.indexOf(row) === drag.preview?.index &&
                      placeholder}
                    <article
                      key={row["行程ID"]}
                      data-itinerary-id={row["行程ID"]}
                      className={`${styles.row} ${drag.preview?.id === row["行程ID"] ? styles.floating : ""} ${drag.preview?.dragging && drag.preview.id === row["行程ID"] ? styles.dragging : ""}`}
                      style={
                        drag.preview?.id === row["行程ID"]
                          ? {
                              position: "fixed",
                              top: drag.preview.top,
                              left: drag.preview.left,
                              width: drag.preview.width,
                              height: drag.preview.height,
                            }
                          : undefined
                      }
                      data-dragging={
                        drag.preview?.dragging &&
                        drag.preview.id === row["行程ID"]
                          ? "true"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className={styles.handle}
                        data-drag-handle="true"
                        aria-label={`調整「${row["標題"]}」順序`}
                        aria-pressed={
                          drag.preview?.dragging &&
                          drag.preview.id === row["行程ID"]
                        }
                        disabled={
                          busy ||
                          !!pending ||
                          (day !== "all" && dateRows.length < 2)
                        }
                        onPointerDown={(event) =>
                          drag.start(event, row["行程ID"], date, index)
                        }
                        onPointerMove={drag.update}
                        onPointerUp={drag.end}
                        onPointerCancel={drag.interrupted}
                        onLostPointerCapture={drag.interrupted}
                        onKeyDown={(event) => {
                          if (drag.preview) return;
                          if (
                            event.key === "ArrowUp" ||
                            event.key === "ArrowDown"
                          ) {
                            event.preventDefault();
                            move(
                              row["行程ID"],
                              date,
                              index + (event.key === "ArrowUp" ? -1 : 1),
                            );
                          }
                        }}
                      >
                        <Icon name="grip" size={18} />
                      </button>
                      <div className={styles.content}>
                        <div className={styles.heading}>
                          {row["開始時間"] && <time>{row["開始時間"]}</time>}
                          <strong title={row["標題"]}>{row["標題"]}</strong>
                        </div>
                      </div>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="quiet-button"
                          disabled={busy || !!pending || dragging}
                          onClick={() => onEdit(row)}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className="quiet-button delete-button"
                          disabled={busy || !!pending || dragging}
                          onClick={() => onRemove(row)}
                        >
                          刪除
                        </button>
                      </div>
                    </article>
                  </Fragment>
                ))}
                {target &&
                  drag.preview?.index === remaining.length &&
                  placeholder}
                {!dateRows.length && !target && (
                  <Empty>尚未安排當日行程。</Empty>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {pending && (
        <ConflictDialog
          onCancel={() => {
            setPending(null);
            drag.cancel();
          }}
          onConfirm={(skip) => commit(pending, skip)}
        />
      )}
    </>
  );
}
