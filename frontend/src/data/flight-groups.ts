import type { Row } from "./portal.ts";
export interface FlightGroup {
  key: string;
  flights: Row[];
}
export function groupFlights(rows: Row[]): FlightGroup[] {
  const groups = new Map<string, FlightGroup>();
  const airport = (value: string) =>
    value.trim().replace(/\s+/g, " ").toUpperCase();
  for (const row of rows) {
    const key = JSON.stringify([
      row["出發時間"].slice(0, 10),
      airport(row["出發機場"]),
      airport(row["抵達機場"]),
    ]);
    let group = groups.get(key);
    if (!group) {
      group = { key, flights: [] };
      groups.set(key, group);
    }
    group.flights.push(row);
  }
  return [...groups.values()];
}
