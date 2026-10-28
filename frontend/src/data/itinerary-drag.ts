export interface DragRect {
  top: number;
  height: number;
}
export interface DragLayout {
  offset: number;
  target: number;
  settledOffset: number;
  shifts: number[];
}
export function dragLayout(
  cards: DragRect[],
  from: number,
  delta: number,
  gap: number,
): DragLayout {
  const active = cards[from];
  if (!active) throw Error("找不到拖曳中的行程。");
  const offset = Math.max(
    cards[0].top - active.top,
    Math.min(
      cards.at(-1)!.top + cards.at(-1)!.height - active.height - active.top,
      delta,
    ),
  );
  const center = active.top + active.height / 2 + delta;
  let target = 0;
  for (let i = 0; i < cards.length; i++)
    if (i !== from && center > cards[i].top + cards[i].height / 2) target++;
  const shifts = cards.map((_, i) =>
    i === from
      ? offset
      : from < target && i > from && i <= target
        ? -(active.height + gap)
        : from > target && i >= target && i < from
          ? active.height + gap
          : 0,
  );
  const settledOffset =
    target === from
      ? 0
      : target < from
        ? cards[target].top - active.top
        : cards[target].top + cards[target].height - active.height - active.top;
  return { offset, target, settledOffset, shifts };
}
export function dragScrollSpeed(
  y: number,
  top: number,
  bottom: number,
): number {
  const edge = Math.min(56, (bottom - top) / 3);
  if (y < top + edge)
    return -Math.min(10, Math.ceil(((top + edge - y) / edge) * 10));
  if (y > bottom - edge)
    return Math.min(10, Math.ceil(((y - bottom + edge) / edge) * 10));
  return 0;
}
