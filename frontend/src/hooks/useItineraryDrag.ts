import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { dragLayout, dragScrollSpeed } from "../data/itinerary-drag";
import type { DragRect, DragLayout } from "../data/itinerary-drag";

interface Preview extends DragLayout {
  id: string;
  from: number;
  dragging: boolean;
}
interface Gesture {
  id: string;
  pointerId: number;
  handle: HTMLButtonElement;
  from: number;
  startY: number;
  clientY: number;
  startScroll: number;
  scroll: HTMLDialogElement | null;
  cards: DragRect[];
  gap: number;
}
export function useItineraryDrag({
  revision,
  disabled,
  onDrop,
}: {
  revision: string;
  disabled: boolean;
  onDrop: (id: string, index: number) => boolean;
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
    return dragLayout(
      current.cards,
      current.from,
      current.clientY -
        current.startY +
        (current.scroll?.scrollTop || 0) -
        current.startScroll,
      current.gap,
    );
  }
  function tick() {
    const current = gesture.current;
    if (!current) return;
    if (
      callbacks.current.disabled ||
      !window.matchMedia("(max-width: 700px)").matches
    ) {
      cancel();
      return;
    }
    if (current.scroll) {
      const rect = current.scroll.getBoundingClientRect();
      current.scroll.scrollTop += dragScrollSpeed(
        current.clientY,
        Math.max(0, rect.top),
        Math.min(window.innerHeight, rect.bottom),
      );
    }
    const next = layout(current);
    setPreview((previous) =>
      previous?.dragging &&
      previous.id === current.id &&
      previous.offset === next.offset &&
      previous.target === next.target
        ? previous
        : { ...next, id: current.id, from: current.from, dragging: true },
    );
    frame.current = requestAnimationFrame(tick);
  }
  function start(
    event: ReactPointerEvent<HTMLButtonElement>,
    id: string,
    from: number,
  ) {
    if (
      callbacks.current.disabled ||
      gesture.current ||
      event.button !== 0 ||
      !event.isPrimary ||
      !window.matchMedia("(max-width: 700px)").matches ||
      !list.current
    )
      return;
    const elements = Array.from(
      list.current.querySelectorAll<HTMLElement>("[data-itinerary-id]"),
    );
    if (elements.length < 2) return;
    stop();
    const cards = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
    const scroll = list.current.closest("dialog");
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const current: Gesture = {
      id,
      from,
      pointerId: event.pointerId,
      handle: event.currentTarget,
      startY: event.clientY,
      clientY: event.clientY,
      scroll,
      startScroll: scroll?.scrollTop || 0,
      cards,
      gap: parseFloat(getComputedStyle(list.current).rowGap) || 0,
    };
    gesture.current = current;
    setPreview({ ...layout(current), id, from, dragging: true });
    frame.current = requestAnimationFrame(tick);
  }
  function update(event: ReactPointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointerId === event.pointerId)
      gesture.current.clientY = event.clientY;
  }
  function end(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.clientY = event.clientY;
    const next = layout(current);
    stop();
    event.preventDefault();
    const settled = {
      ...next,
      id: current.id,
      from: current.from,
      dragging: false,
      offset: next.settledOffset,
      shifts: next.shifts.map((offset, index) =>
        index === current.from ? next.settledOffset : offset,
      ),
    };
    setPreview(settled);
    if (!callbacks.current.onDrop(current.id, next.target))
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
    document.addEventListener("visibilitychange", hidden);
    return () => {
      stop();
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return { list, preview, start, update, end, interrupted, cancel };
}
