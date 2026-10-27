import { CloseButton } from "./CloseButton";
import { useEffect, useId, useRef, useState } from "react";
import { displayDate } from "../data/display-date";
import styles from "./PdfExportDialog.module.css";

export function PdfExportDialog({
  dates,
  initialDates,
  onClose,
  onConfirm,
}: {
  dates: string[];
  initialDates: string[];
  onClose: () => void;
  onConfirm: (dates: string[]) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const all = useRef<HTMLInputElement>(null);
  const id = useId();
  const [selected, setSelected] = useState(() =>
    initialDates.filter((date) => dates.includes(date)),
  );
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  useEffect(() => {
    if (all.current)
      all.current.indeterminate =
        selected.length > 0 && selected.length < dates.length;
  }, [selected, dates]);
  return (
    <dialog
      ref={ref}
      className={`catalog-dialog no-print ${styles.dialog}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dates.length === 0 || selected.length)
            onConfirm(dates.filter((date) => selected.includes(date)));
        }}
      >
        <div className="dialog-heading">
          <h2 id={id}>匯出 PDF</h2>
          <CloseButton onClick={onClose} label="關閉匯出設定" />
        </div>
        <p className={styles.hint}>
          匯出所選日期的每日行程，以及全部航班與住宿。請在列印視窗選擇「另存為
          PDF」。
        </p>
        {dates.length ? (
          <fieldset className={styles.dates}>
            <legend>選擇行程日期</legend>
            <label>
              <input
                ref={all}
                type="checkbox"
                checked={selected.length === dates.length}
                onChange={(event) =>
                  setSelected(event.target.checked ? [...dates] : [])
                }
              />
              全部日期
            </label>
            {dates.map((date) => (
              <label key={date}>
                <input
                  type="checkbox"
                  checked={selected.includes(date)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, date]
                        : current.filter((item) => item !== date),
                    )
                  }
                />
                {displayDate(date)}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="muted">尚無每日行程，將匯出航班與住宿。</p>
        )}
        {dates.length > 0 && !selected.length && (
          <p role="status" className={styles.hint}>
            請至少選擇一個日期。
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="button"
            disabled={dates.length > 0 && !selected.length}
          >
            匯出 PDF
          </button>
        </div>
      </form>
    </dialog>
  );
}
