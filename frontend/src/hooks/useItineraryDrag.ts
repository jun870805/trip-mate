import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { dragDestination, dragScrollSpeed } from "../data/itinerary-drag";

interface Preview {
  id: string;
  date: string;
  index: number;
  top: number;
  left: number;
  width: number;
  height: number;
  dragging: boolean;
}
interface Gesture {
  pointerId: number;
  handle: HTMLButtonElement;
  preview: Preview;
  startY: number;
  clientY: number;
  offsetY: number;
  moved: boolean;
  scroll: HTMLDialogElement | null;
}
export function useItineraryDrag({
  revision,
  disabled,
  onDrop,
}: {
  revision: string;
  disabled: boolean;
  onDrop: (id: string, date: string, index: number) => boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const callbacks = useRef({ disabled, onDrop });
  callbacks.current = { disabled, onDrop };
  function stop() {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current = gesture.current;
    gesture.current = null;
    if (current?.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
  }
  function cancel() {
    stop();
    setPreview(null);
  }
  function layout(current: Gesture) {
    const next = { ...current.preview, top: current.clientY - current.offsetY };
    if (!current.moved) return next;
    const center = next.top + next.height / 2;
    const placeholder = list.current
      ?.querySelector<HTMLElement>("[data-drag-placeholder]")
      ?.getBoundingClientRect();
    // Keep a stable slot while crossing its placeholder; otherwise live layout
    // changes could bounce the insertion point between adjacent cards.
    if (
      placeholder &&
      center >= placeholder.top &&
      center <= placeholder.bottom
    )
      return next;
    const zones = Array.from(
      list.current?.querySelectorAll<HTMLElement>("[data-drop-date]") || [],
    ).map((group) => {
      const rect = group.getBoundingClientRect();
      return {
        date: group.dataset.dropDate!,
        top: rect.top,
        bottom: rect.bottom,
        cards: Array.from(
          group.querySelectorAll<HTMLElement>("[data-itinerary-id]"),
        ).map((card) => {
          const bounds = card.getBoundingClientRect();
          return {
            id: card.dataset.itineraryId!,
            top: bounds.top,
            height: bounds.height,
          };
        }),
      };
    });
    const destination = dragDestination(zones, center, next.id);
    return destination ? { ...next, ...destination } : next;
  }
  function tick() {
    const current = gesture.current;
    if (!current) return;
    if (callbacks.current.disabled) {
      cancel();
      return;
    }
    if (current.moved && current.scroll) {
      const rect = current.scroll.getBoundingClientRect();
      current.scroll.scrollTop += dragScrollSpeed(
        current.clientY,
        Math.max(0, rect.top),
        Math.min(window.innerHeight, rect.bottom),
      );
    }
    current.preview = layout(current);
    const next = current.preview;
    setPreview((previous) =>
      previous?.top === next.top &&
      previous.date === next.date &&
      previous.index === next.index
        ? previous
        : next,
    );
    frame.current = requestAnimationFrame(tick);
  }
  function start(
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    date: string,
    index: number,
  ) {
    if (
      callbacks.current.disabled ||
      gesture.current ||
      preview ||
      event.button !== 0 ||
      !event.isPrimary ||
      !list.current
    )
      return;
    const card = event.currentTarget.closest<HTMLElement>(
      "[data-itinerary-id]",
    );
    if (!card) return;
    stop();
    const rect = card.getBoundingClientRect();
    const initial: Preview = {
      id,
      date,
      index,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      dragging: true,
    };
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      handle: event.currentTarget,
      preview: initial,
      startY: event.clientY,
      clientY: event.clientY,
      offsetY: event.clientY - rect.top,
      moved: false,
      scroll: list.current.closest("dialog"),
    };
    setPreview(initial);
    frame.current = requestAnimationFrame(tick);
  }
  function update(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    current.clientY = event.clientY;
    if (Math.abs(current.clientY - current.startY) > 4) current.moved = true;
  }
  function end(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    update(event);
    const next = layout(current);
    stop();
    event.preventDefault();
    if (!current.moved) {
      setPreview(null);
      return;
    }
    setPreview({ ...next, dragging: false });
    // Wait for the final placeholder to be laid out before settling the card.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const rect = list.current
        ?.querySelector<HTMLElement>("[data-drag-placeholder]")
        ?.getBoundingClientRect();
      if (rect)
        setPreview((previous) =>
          previous ? { ...previous, top: rect.top, left: rect.left } : null,
        );
    });
    if (!callbacks.current.onDrop(next.id, next.date, next.index))
      timer.current = setTimeout(() => setPreview(null), 160);
  }
  function interrupted(event: ReactPointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointerId === event.pointerId) cancel();
  }
  useLayoutEffect(() => {
    cancel();
  }, [revision]);
  useEffect(() => {
    if (disabled && gesture.current) cancel();
  }, [disabled]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      stop();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return { list, preview, start, update, end, interrupted, cancel };
}
