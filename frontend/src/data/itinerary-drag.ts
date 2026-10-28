export interface DragZone {
  date: string;
  top: number;
  bottom: number;
  cards: { id: string; top: number; height: number }[];
}
export function dragDestination(
  zones: DragZone[],
  y: number,
  active: string,
): { date: string; index: number } | null {
  let closest: DragZone | undefined;
  let distance = Infinity;
  for (const zone of zones) {
    const next = Math.max(zone.top - y, y - zone.bottom, 0);
    if (next < distance) {
      closest = zone;
      distance = next;
    }
  }
  if (!closest) return null;
  return {
    date: closest.date,
    index: closest.cards.filter(
      (card) => card.id !== active && y > card.top + card.height / 2,
    ).length,
  };
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
