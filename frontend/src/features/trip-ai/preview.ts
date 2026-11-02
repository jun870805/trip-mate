import type { AgentActivity, Change, ToolResult } from '../../ai/contracts.ts';

const toolActivities: Record<string, string> = {
  itinerary_get_summary: '正在查詢旅程摘要…', itinerary_get_activities: '正在查詢行程…',
  itinerary_search: '正在搜尋行程…', itinerary_missing_maps: '正在檢查地圖資訊…',
  itinerary_add: '正在準備新增預覽…', itinerary_update: '正在準備修改預覽…',
  itinerary_delete: '正在準備刪除預覽…', itinerary_move: '正在準備調整順序預覽…',
  itinerary_import: '正在整理匯入預覽…', itinerary_apply_maps: '正在準備地圖預覽…',
  itinerary_request_email: '正在準備郵件預覽…',
};
export function activityLabel(activity?: AgentActivity): string {
  if (activity?.phase === 'responding') return '正在回覆…';
  if (activity?.phase === 'tool') return toolActivities[activity.toolName || ''] || '正在處理資料…';
  return '思考中...';
}

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
  if (name === 'itinerary_request_email') {
    if (result.status === 'success') return '郵件服務已接受寄送申請，等待導遊回覆；行程尚未修改。';
    if (result.status === 'cancelled') return '已取消寄送，未寄出郵件。';
    return '郵件未確認寄送成功。請先確認收件情況，勿直接重送；行程未修改。';
  }
  if (!writeTools.has(name)) return null;
  if (result.status === 'cancelled') return '已取消，未執行修改。';
  if (result.status === 'success') {
    const data = record(result.data);
    const count = Number.isSafeInteger(data.count) && Number(data.count) > 0 ? ` ${data.count} 項操作` : '變更';
    return `已儲存${count}。${data.refreshFailed ? '畫面更新失敗，請重新讀取旅程。' : ''}`;
  }
  return '修改未確認成功，請重新讀取資料後再操作，勿直接重送。';
}
