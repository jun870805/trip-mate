function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function pickerAnchor(
  value: string,
  start: string,
  today: string,
): string {
  return [value.slice(0, 10), start.slice(0, 10), today].find(validDate)!;
}
export function shiftMonth(date: string, delta: number): string {
  const result = new Date(date.slice(0, 7) + "-01T00:00:00Z");
  result.setUTCMonth(result.getUTCMonth() + delta);
  return result.toISOString().slice(0, 10);
}
export function monthDays(date: string): (string | null)[] {
  const first = date.slice(0, 7) + "-01";
  const next = new Date(shiftMonth(first, 1));
  next.setUTCDate(0);
  const offset = new Date(first).getUTCDay();
  const count = next.getUTCDate();
  return Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= count
        ? first.slice(0, 8) + String(day).padStart(2, "0")
        : null;
    },
  );
}

export function pickerInputValue(text: string): string {
  return text.replaceAll("/", "-").replace(" ", "T");
}
export function pickerInputDisplay(value: string): string {
  return value.replaceAll("-", "/").replace("T", " ");
}
export function pickerInputError(
  value: string,
  type: "date" | "datetime-local" | "time",
  min = "",
): string {
  if (!value) return "";
  const validTime = (time: string) =>
    /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  const valid =
    type === "date"
      ? validDate(value)
      : type === "time"
        ? validTime(value)
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
          validDate(value.slice(0, 10)) &&
          validTime(value.slice(11));
  if (!valid)
    return type === "date"
      ? "請輸入有效日期，例如 2027/04/22。"
      : type === "time"
        ? "請使用 24 小時制 HH:mm，例如 23:05。"
        : "請輸入有效日期及 24 小時制時間，例如 2027/04/22 23:05。";
  return min && value < min ? `不得早於 ${pickerInputDisplay(min)}。` : "";
}
