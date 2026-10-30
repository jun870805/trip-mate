import { useEffect, useId, useRef, useState } from "react";
import { appendItineraryTag, itineraryTags } from "../data/itinerary";
import { CloseButton } from "./CloseButton";
import { Icon } from "./Icon";
import { ItineraryTag } from "./ItineraryTag";
import styles from "./ItineraryTagInput.module.css";

export function ItineraryTagInput({
  value,
  tags,
  disabled = false,
  onChange,
}: {
  value: string;
  tags: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const selected = new Set(itineraryTags([{ 類型: value }]));
  function close(focus: "input" | "trigger" | null = "trigger") {
    if (panel.current?.matches(":popover-open")) panel.current.hidePopover();
    if (focus)
      (focus === "input" ? input : trigger).current?.focus({
        preventScroll: true,
      });
  }
  function show() {
    if (disabled || !panel.current || !trigger.current) return;
    if (panel.current.matches(":popover-open")) {
      close();
      return;
    }
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const height = Math.min(320, window.innerHeight - 24);
    Object.assign(panel.current.style, {
      width: `${width}px`,
      left: `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`,
      maxHeight: `${height}px`,
    });
    panel.current.showPopover();
    const actualHeight = panel.current.getBoundingClientRect().height;
    panel.current.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - actualHeight - 12))}px`;
    panel.current.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (disabled) close(null);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => close(null);
    const dialog = trigger.current?.closest("dialog");
    dialog?.addEventListener("scroll", dismiss, { passive: true });
    window.addEventListener("resize", dismiss);
    return () => {
      dialog?.removeEventListener("scroll", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);
  return (
    <span className={styles.control}>
      <input
        ref={input}
        type="text"
        aria-label="標籤"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.altKey && event.key === "ArrowDown") ||
            event.key === "F4"
          ) {
            event.preventDefault();
            show();
          }
        }}
      />
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-label="選擇既有標籤"
        title="選擇既有標籤"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={show}
      >
        <Icon name="down" size={16} />
      </button>
      <span
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        tabIndex={-1}
        aria-labelledby={id + "-title"}
        className={styles.panel}
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <span className={`dialog-heading ${styles.heading}`}>
          <span id={id + "-title"} role="heading" aria-level={3}>
            選擇既有標籤
          </span>
          <CloseButton onClick={() => close()} label="關閉標籤選擇" />
        </span>
        {tags.length ? (
          <span className={styles.options}>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={styles.option}
                disabled={disabled || selected.has(tag)}
                aria-pressed={selected.has(tag)}
                onClick={() => {
                  if (disabled || selected.has(tag)) return;
                  onChange(appendItineraryTag(value, tag));
                  close("input");
                }}
              >
                <ItineraryTag tag={tag} allTags={tags} />
              </button>
            ))}
          </span>
        ) : (
          <span className={styles.empty}>尚無既有標籤</span>
        )}
      </span>
    </span>
  );
}
