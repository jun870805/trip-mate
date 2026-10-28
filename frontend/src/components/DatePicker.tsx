import styles from "./DatePicker.module.css";
import { useEffect, useId, useRef, useState } from "react";
import {
  pickerAnchor,
  monthDays,
  shiftMonth,
  pickerInputValue,
  pickerInputDisplay,
  pickerInputError,
} from "../data/date-picker";
import { dateInTimezone } from "../data/timezone";
import { displayDate } from "../data/display-date";
import { TimeWheel } from "./TimeWheel";

// The visible calendar has its own anchor; opening it never changes the form value.
export function DatePicker({
  value,
  onChange,
  start = "",
  type = "date",
  required,
  disabled,
  min,
  label,
  wheelOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  start?: string;
  type?: "date" | "datetime-local" | "time";
  required?: boolean;
  disabled?: boolean;
  min?: string;
  label: string;
  wheelOnly?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLInputElement>(null);
  const today = dateInTimezone(new Date(), "Asia/Taipei");
  const [month, setMonth] = useState(() => pickerAnchor(value, start, today));
  const [selected, setSelected] = useState("");
  const [time, setTime] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [year, setYear] = useState(() => Number(month.slice(0, 4)));
  const [yearPage, setYearPage] = useState(1);
  useEffect(() => {
    trigger.current?.setCustomValidity(pickerInputError(value, type, min));
  }, [value, type, min]);
  function show() {
    if (disabled || !panel.current || !trigger.current) return;
    const anchor = pickerAnchor(value, start, today);
    setMonth(anchor);
    setView("days");
    setYear(Number(anchor.slice(0, 4)));
    setSelected(anchor);
    setTime(
      (value || start)
        .split("T")
        .at(-1)
        ?.match(/^\d{2}:\d{2}/)?.[0] || "00:00",
    );
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const height =
      type === "time" ? 250 : type === "datetime-local" ? 540 : 350;
    Object.assign(panel.current.style, {
      width: `${width}px`,
      left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
      top: `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - height - 12))}px`,
      maxHeight: `${window.innerHeight - 24}px`,
    });
    panel.current.showPopover();
    panel.current.focus();
  }
  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus();
  }
  function commit(date: string) {
    onChange(
      type === "date" ? date : type === "time" ? time : `${date}T${time}`,
    );
    close();
  }
  return (
    <span className={styles["date-picker"]}>
      <input
        ref={trigger}
        type="text"
        readOnly={wheelOnly}
        onClick={wheelOnly ? show : undefined}
        value={pickerInputDisplay(value)}
        placeholder={
          type === "date"
            ? "YYYY/MM/DD"
            : type === "time"
              ? "HH:mm"
              : "YYYY/MM/DD HH:mm"
        }
        autoComplete="off"
        required={required}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onChange={(event) => {
          const next = pickerInputValue(event.target.value);
          event.target.setCustomValidity(pickerInputError(next, type, min));
          onChange(next);
        }}
        onKeyDown={(event) => {
          if (
            (event.key === "ArrowDown" && event.altKey) ||
            event.key === "F4" ||
            (wheelOnly && (event.key === "Enter" || event.key === " "))
          ) {
            event.preventDefault();
            show();
          }
        }}
      />
      <button
        type="button"
        className={styles["date-picker-trigger"]}
        aria-label={`選擇${label}`}
        disabled={disabled}
        onClick={show}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 11h18" />
        </svg>
      </button>
      <span
        id={id}
        ref={panel}
        popover="auto"
        role="dialog"
        tabIndex={-1}
        aria-label={`選擇${label}`}
        className={styles["date-picker-panel"]}
        onToggle={(event) => setOpen(event.newState === "open")}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
            trigger.current?.focus();
          }
        }}
      >
        {type !== "time" && (
          <>
            <span className={styles["date-picker-month"]}>
              <button
                type="button"
                aria-label="上個月"
                disabled={view !== "days" || month.slice(0, 7) === "0001-01"}
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                &lt;
              </button>
              <button
                type="button"
                aria-label="選擇年份與月份"
                onClick={() => {
                  setYear(Number(month.slice(0, 4)));
                  setView(view === "days" ? "months" : "days");
                }}
              >
                {month.slice(0, 4)} / {month.slice(5, 7)}
              </button>
              <button
                type="button"
                aria-label="下個月"
                disabled={view !== "days" || month.slice(0, 7) === "9999-12"}
                onClick={() => setMonth(shiftMonth(month, 1))}
              >
                &gt;
              </button>
            </span>
            {view === "days" ? (
              <span className={styles["date-picker-days"]}>
                {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                  <span key={day} className={styles["date-picker-weekday"]}>
                    {day}
                  </span>
                ))}
                {monthDays(month).map((date, index) =>
                  date ? (
                    <button
                      type="button"
                      key={date}
                      aria-label={displayDate(date)}
                      aria-pressed={date === selected}
                      disabled={!!min && date < min.slice(0, 10)}
                      onClick={() => {
                        setSelected(date);
                        if (type === "date") commit(date);
                      }}
                    >
                      {Number(date.slice(8))}
                    </button>
                  ) : (
                    <span key={index} />
                  ),
                )}
              </span>
            ) : view === "months" ? (
              <span className={styles["date-picker-periods"]}>
                <span className={styles["date-picker-month"]}>
                  <button
                    type="button"
                    aria-label="上一年"
                    disabled={year <= 1}
                    onClick={() => setYear(year - 1)}
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    aria-label="選擇年份"
                    onClick={() => {
                      setYearPage(
                        Math.min(9988, Math.floor((year - 1) / 12) * 12 + 1),
                      );
                      setView("years");
                    }}
                  >
                    {year} 年
                  </button>
                  <button
                    type="button"
                    aria-label="下一年"
                    disabled={year >= 9999}
                    onClick={() => setYear(year + 1)}
                  >
                    &gt;
                  </button>
                </span>
                <span className={styles["date-picker-period-grid"]}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() => {
                        setMonth(
                          `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}-01`,
                        );
                        setView("days");
                      }}
                    >
                      {index + 1} 月
                    </button>
                  ))}
                </span>
              </span>
            ) : (
              <span className={styles["date-picker-periods"]}>
                <span className={styles["date-picker-month"]}>
                  <button
                    type="button"
                    aria-label="前十二年"
                    disabled={yearPage <= 1}
                    onClick={() => setYearPage(Math.max(1, yearPage - 12))}
                  >
                    &lt;
                  </button>
                  <span aria-live="polite">
                    {yearPage} - {yearPage + 11}
                  </span>
                  <button
                    type="button"
                    aria-label="後十二年"
                    disabled={yearPage >= 9988}
                    onClick={() => setYearPage(Math.min(9988, yearPage + 12))}
                  >
                    &gt;
                  </button>
                </span>
                <span className={styles["date-picker-period-grid"]}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() => {
                        setYear(yearPage + index);
                        setView("months");
                      }}
                    >
                      {yearPage + index} 年
                    </button>
                  ))}
                </span>
              </span>
            )}
          </>
        )}
        {type !== "date" && (
          <TimeWheel value={time} onChange={setTime} active={open} />
        )}
        <span className={styles["date-picker-actions"]}>
          <button
            type="button"
            onClick={() => {
              onChange("");
              close();
            }}
          >
            清除
          </button>
          <button type="button" onClick={close}>
            取消
          </button>
          {type !== "date" && (
            <button
              type="button"
              disabled={
                !time ||
                !!pickerInputError(time, "time") ||
                (!!min && selected < min.slice(0, 10))
              }
              onClick={() => commit(selected)}
            >
              確定
            </button>
          )}
        </span>
      </span>
    </span>
  );
}
