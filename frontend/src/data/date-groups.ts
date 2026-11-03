import type { Row } from './portal.ts';

/** Group validated ISO dates without changing row order within a day or mutating the source. */
export function groupRowsByDate(rows: Row[], dateKey: string): { date: string; rows: Row[] }[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const date = row[dateKey];
    const group = groups.get(date);
    if (group) group.push(row);
    else groups.set(date, [row]);
  }
  return [...groups].sort(([left], [right]) => left.localeCompare(right))
    .map(([date, rows]) => ({ date, rows }));
}
