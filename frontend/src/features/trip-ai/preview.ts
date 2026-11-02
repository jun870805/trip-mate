import type { Change, ToolResult } from '../../ai/contracts.ts';

export function displayAIText(text: string, showIds: boolean): string {
  return showIds ? text : text.replace(/\b[TMFERBAHIP](?:\d{3}|[1-9]\d{3})\b/g, '該項目');
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function valueText(value: unknown, name: string): string {
  if (name === "日期" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", "/");
  return value === undefined || value === null || value === '' ? '未填寫' : typeof value === 'string' ? value : JSON.stringify(value);
}
export function previewRows(change: Change, showIds: boolean) {
  const before = record(change.before), after = record(change.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !key.endsWith('ID') && key !== '排序');
  return {
    title: String(after['標題'] || before['標題'] || '行程項目'),
    id: showIds ? change.target : undefined,
    fields: keys.filter(key => change.operation === 'create' ? after[key] !== '' && after[key] !== undefined :
      change.operation === 'delete' ? before[key] !== '' && before[key] !== undefined : before[key] !== after[key])
      .map(name => ({ name, before: valueText(before[name], name), after: valueText(after[name], name) })),
  };
}
const writeTools = new Set(['itinerary_add','itinerary_update','itinerary_delete','itinerary_move','itinerary_import','itinerary_apply_maps']);
export function writeResultLabel(name: string, result: ToolResult): string | null {
  if (!writeTools.has(name)) return null;
  if (result.status === 'cancelled') return '已取消，未執行修改。';
  if (result.status === 'success') {
    const data = record(result.data);
    const count = Number.isSafeInteger(data.count) && Number(data.count) > 0 ? ` ${data.count} 項操作` : '變更';
    return `已儲存${count}。${data.refreshFailed ? '畫面更新失敗，請重新讀取旅程。' : ''}`;
  }
  return '修改未確認成功，請重新讀取資料後再操作，勿直接重送。';
}
