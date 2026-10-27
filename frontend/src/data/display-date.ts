/** Presentation only: leave ISO values untouched in forms, comparisons and Sheets. */
export function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", "/") : value;
}
export function displayDateTime(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
    ? `${displayDate(value.slice(0, 10))} ${value.slice(11, 16)}`
    : displayDate(value);
}
/** Compare the recorded local dates, without converting either airport's timezone. */
export function flightDayOffset(departure: string, arrival: string): string {
  const days =
    (Date.parse(`${arrival.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${departure.slice(0, 10)}T00:00:00Z`)) /
    86400000;
  return Number.isFinite(days) && days !== 0
    ? `(${days > 0 ? "+" : ""}${days})`
    : "";
}
