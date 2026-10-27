import styles from "./TimeWheel.module.css";
import { useEffect, useId, useRef } from "react";

function Wheel({
  label,
  count,
  value,
  onChange,
  active,
}: {
  label: string;
  count: number;
  value: number;
  onChange: (value: number) => void;
  active: boolean;
}) {
  const list = useRef<HTMLSpanElement>(null);
  const id = useId();
  const openingValue = useRef(value);
  openingValue.current = value;
  // Opening positions the wheel without committing any form value.
  useEffect(() => {
    if (active && list.current)
      list.current.scrollTop = openingValue.current * 40;
    // The wheel owns scroll position while open; scrolling updates value, not vice versa.
  }, [active]);
  function select(next: number) {
    next = Math.max(0, Math.min(count - 1, next));
    if (list.current) list.current.scrollTop = next * 40;
    onChange(next);
  }
  return (
    <span className={styles["time-wheel-column"]}>
      <span className={styles["time-wheel-label"]}>{label}</span>
      <span className={styles["time-wheel-track"]}>
        <span
          ref={list}
          className={styles["time-wheel"]}
          role="listbox"
          aria-label={label}
          tabIndex={0}
          aria-activedescendant={`${id}-${value}`}
          onScroll={(event) => {
            const next = Math.max(
              0,
              Math.min(
                count - 1,
                Math.round(event.currentTarget.scrollTop / 40),
              ),
            );
            if (next !== value) onChange(next);
          }}
          onKeyDown={(event) => {
            const delta =
              event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
            if (delta || event.key === "Home" || event.key === "End") {
              event.preventDefault();
              event.stopPropagation();
              select(
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? count - 1
                    : value + delta,
              );
            }
          }}
        >
          {Array.from({ length: count }, (_, index) => (
            <button
              key={index}
              id={`${id}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === value}
              onClick={() => select(index)}
            >
              {String(index).padStart(2, "0")}
            </button>
          ))}
        </span>
      </span>
    </span>
  );
}
export function TimeWheel({
  value,
  onChange,
  active,
}: {
  value: string;
  onChange: (value: string) => void;
  active: boolean;
}) {
  const [hours, minutes] = value.split(":").map(Number);
  const hour = Number.isInteger(hours) && hours >= 0 && hours < 24 ? hours : 0;
  const minute =
    Number.isInteger(minutes) && minutes >= 0 && minutes < 60 ? minutes : 0;
  const set = (h: number, m: number) =>
    onChange(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return (
    <span
      className={styles["time-wheels"]}
      role="group"
      aria-label="24 小時制時間"
    >
      <Wheel
        label="小時"
        count={24}
        value={hour}
        onChange={(h) => set(h, minute)}
        active={active}
      />
      <span className={styles["time-wheel-separator"]} aria-hidden="true">
        :
      </span>
      <Wheel
        label="分鐘"
        count={60}
        value={minute}
        onChange={(m) => set(hour, m)}
        active={active}
      />
    </span>
  );
}
