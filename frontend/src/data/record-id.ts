import rules from "./id-rules.json" with { type: "json" };
import type { SheetRows } from "./sheets.ts";

export type RecordKind = keyof typeof rules;

const columnKinds = new Map<string, RecordKind>();
for (const kind of Object.keys(rules) as RecordKind[]) {
  const rule = rules[kind];
  columnKinds.set(rule.column, kind);
  if ("referenceColumns" in rule)
    for (const name of rule.referenceColumns) columnKinds.set(name, kind);
}

export function assertRecordId(
  kind: RecordKind,
  id: string,
  context = rules[kind].table,
): void {
  const prefix = rules[kind].prefix;
  if (
    !new RegExp(`^${prefix}(?:[0-9]{3}|[1-9][0-9]{3})$`).test(id) ||
    Number(id.slice(1)) === 0
  )
    throw new Error(
      `${context}：ID 須為 ${prefix}001～${prefix}999 或 ${prefix}1000～${prefix}9999。`,
    );
}

export function assertRecordIds(
  row: Record<string, string>,
  context: string,
): void {
  for (const [column, kind] of columnKinds)
    if (row[column])
      assertRecordId(kind, row[column], `${context}「${column}」`);
}

export function nextRecordId(
  kind: RecordKind,
  existing: Iterable<string>,
): string {
  const prefix = rules[kind].prefix;
  const pattern = new RegExp(`^${prefix}([0-9]+)$`);
  let highest = 0;
  for (const id of existing) {
    const match = id.trim().match(pattern);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  if (highest >= 9999)
    throw new Error(
      `${rules[kind].table}的 ID 已達 9999，請先確認擴充編碼規則。`,
    );
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export function nextRecordIdFromRows(
  kind: RecordKind,
  rows: SheetRows,
): string {
  const index =
    rows[0]?.findIndex(
      (value) => String(value).trim() === rules[kind].column,
    ) ?? -1;
  if (index < 0)
    throw new Error(`缺少「${rules[kind].column}」欄位，無法自動產生 ID。`);
  return nextRecordId(
    kind,
    rows.slice(1).map((row) => String(row[index] ?? "")),
  );
}
