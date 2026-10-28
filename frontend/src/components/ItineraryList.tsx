import { useEffect, useRef, useState } from "react";
import type { Row, Trip } from "../data/portal";
import type { TripMutation } from "../data/trip-editor";
import {
  tripDates,
  orderedItinerary,
  moveItinerary,
  readReorderPreference,
  writeReorderPreference,
} from "../data/itinerary";
import { displayDate } from "../data/display-date";
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
  const entries = orderedItinerary(rows.filter((row) => row["日期"] === day));
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    pointerId: number;
    from: number;
    to: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  const [notice, setNotice] = useState("");
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
  function move(id: string, index: number) {
    if (
      busy ||
      pending ||
      index < 0 ||
      index >= entries.length ||
      entries.findIndex((row) => row["行程ID"] === id) === index
    )
      return;
    const result = moveItinerary(entries, id, index);
    const value = {
      row: entries.find((row) => row["行程ID"] === id)!,
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
  }
  return (
    <>
      <label className={styles.date}>
        <span className="sr-only">日期</span>
        <select
          aria-label="編輯行程日期"
          value={day}
          disabled={busy}
          onChange={(event) => onDay(event.target.value)}
        >
          {dates.map((date) => (
            <option key={date} value={date}>
              {displayDate(date)}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        <span className={styles.mobileHint}>拖曳卡片調整順序。</span>
        <span className={styles.desktopHint}>使用上下箭頭調整順序。</span>
      </p>
      {notice && (
        <p role="status" className="form-error">
          {notice}
        </p>
      )}
      <div ref={list} className={styles.list}>
        {entries.map((row, index) => (
          <article
            key={row["行程ID"]}
            data-itinerary-id={row["行程ID"]}
            className={`${styles.row} ${hover === row["行程ID"] ? styles.target : ""}`}
            onPointerDown={(event) => {
              if (
                busy ||
                pending ||
                !window.matchMedia("(max-width: 700px)").matches ||
                (event.target instanceof Element &&
                  event.target.closest("[data-no-drag]")) ||
                event.button !== 0 ||
                !event.isPrimary ||
                drag.current
              )
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: row["行程ID"],
                pointerId: event.pointerId,
                from: index,
                to: index,
                startY: event.clientY,
                moved: false,
              };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (!active || active.pointerId !== event.pointerId) return;
              if (Math.abs(event.clientY - active.startY) > 5)
                active.moved = true;
              if (!active.moved) return;
              const cards = Array.from(
                list.current?.querySelectorAll<HTMLElement>(
                  "[data-itinerary-id]",
                ) || [],
              );
              let target = cards.length - 1;
              for (let i = 0; i < cards.length; i++) {
                const rect = cards[i].getBoundingClientRect();
                if (event.clientY < rect.top + rect.height / 2) {
                  target = i;
                  break;
                }
              }
              active.to = target;
              setHover(cards[target]?.dataset.itineraryId || null);
              const scroll = list.current?.closest("dialog");
              if (scroll) {
                const rect = scroll.getBoundingClientRect();
                if (event.clientY < rect.top + 60) scroll.scrollTop -= 12;
                else if (event.clientY > rect.bottom - 60)
                  scroll.scrollTop += 12;
              }
            }}
            onPointerUp={(event) => {
              const active = drag.current;
              if (!active || active.pointerId !== event.pointerId) return;
              if (active.moved) event.preventDefault();
              drag.current = null;
              setHover(null);
              if (active?.moved) move(active.id, active.to);
            }}
            onPointerCancel={(event) => {
              if (drag.current?.pointerId !== event.pointerId) return;
              drag.current = null;
              setHover(null);
            }}
            onLostPointerCapture={(event) => {
              if (drag.current?.pointerId !== event.pointerId) return;
              drag.current = null;
              setHover(null);
            }}
          >
            <div className={styles.moveButtons}>
              <button
                type="button"
                aria-label={`上移「${row["標題"]}」`}
                title="上移"
                disabled={busy || !!pending || index === 0}
                onClick={() => move(row["行程ID"], index - 1)}
              >
                <Icon name="up" size={16} />
              </button>
              <button
                type="button"
                aria-label={`下移「${row["標題"]}」`}
                title="下移"
                disabled={busy || !!pending || index === entries.length - 1}
                onClick={() => move(row["行程ID"], index + 1)}
              >
                <Icon name="down" size={16} />
              </button>
            </div>
            <button
              type="button"
              className={styles.handle}
              disabled={busy || !!pending}
              aria-label={`調整「${row["標題"]}」順序`}
              aria-describedby="itinerary-drag-help"
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const next = index + (event.key === "ArrowUp" ? -1 : 1);
                  if (next >= 0 && next < entries.length)
                    move(row["行程ID"], next);
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
                data-no-drag="true"
                className="quiet-button"
                disabled={busy || !!pending}
                onClick={() => onEdit(row)}
              >
                編輯
              </button>
              <button
                type="button"
                data-no-drag="true"
                className="quiet-button delete-button"
                disabled={busy || !!pending}
                onClick={() => onRemove(row)}
              >
                刪除
              </button>
            </div>
          </article>
        ))}
        {!entries.length && <Empty>尚未安排當日行程。</Empty>}
      </div>
      <span id="itinerary-drag-help" className="sr-only">
        按上下方向鍵移動一個位置，或拖曳至同一天的其他位置。
      </span>
      {pending && (
        <ConflictDialog
          onCancel={() => setPending(null)}
          onConfirm={(skip) => commit(pending, skip)}
        />
      )}
    </>
  );
}
