import { z } from 'zod';
import type { Tool } from '../../ai/contracts.ts';
import type { Row } from '../../data/portal.ts';
import { itinerarySubtitle, moveItineraryToDay, orderedItinerary, tripDates } from '../../data/itinerary.ts';
import { readRows } from '../../data/trip-editor.ts';
import categories from '../../data/itinerary-categories.json' with { type: 'json' };
import type { TripHost, ItineraryMutation, MutationPlan } from './host.ts';
import { hasMapLink, mapSearchUrl } from './maps.ts';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => tripDates(value, value).length === 1, '日期無效');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/);
const fields = {
  date, time: time.optional(), title: z.string().trim().min(1).max(4000),
  subtitle: z.string().max(20000).optional(), body: z.string().max(100000).optional(),
  tags: z.string().max(4000).optional(), category: z.enum(categories as [string, ...string[]]).optional(),
};
const draft = z.strictObject(fields);
const id = z.string().regex(/^I(?:[0-9]{3}|[1-9][0-9]{3})$/);
const patch = z.strictObject({ ...fields, date: date.optional(), title: fields.title.optional() });
const columns: Record<string, string> = { date: '日期', time: '開始時間', title: '標題', subtitle: '說明', body: '內文', tags: '類型', category: '類別' };
function values(input: Record<string, unknown>, previous?: Row): Row {
  const result: Row = previous ? { ...previous, 說明: itinerarySubtitle(previous), 地點: '', 地圖網址: '', 結束時間: '' }
    : { 行程ID: '', 日期: '', 標題: '', 開始時間: '', 結束時間: '', 時區: '', 說明: '', 地點: '', 地圖網址: '', 內文: '', 類型: '', 類別: '', 航班ID: '', 住宿ID: '', 排序: '' };
  for (const [key, value] of Object.entries(input)) if (value !== undefined) result[columns[key]] = String(value);
  return result;
}
function record(mode: 'add' | 'edit' | 'delete', row: Row): ItineraryMutation {
  return { kind: 'record', sheet: '每日行程', mode, id: mode === 'add' ? undefined : row['行程ID'], values: row };
}
function find(rows: Row[], target: string): Row {
  const row = rows.find(item => item['行程ID'] === target);
  if (!row) throw new Error('找不到指定行程。');
  return row;
}
export function createTripTools(host: TripHost): Tool[] {
  const read = (name: string, description: string, schema: z.ZodType, select: (input: unknown, data: Awaited<ReturnType<TripHost['read']>>) => unknown): Tool => ({
    name, description, risk: 'read', schema, enabled: context => context.permissions.includes('read'),
    async execute(input, context, signal) { return { status: 'success', data: select(input, await host.read(context, signal)) }; },
  });
  const write = (name: string, description: string, schema: z.ZodType, build: (input: unknown, rows: Row[]) => MutationPlan, destructive = false): Tool => ({
    name, description, risk: destructive ? 'destructive' : 'write', schema, enabled: context => context.permissions.includes('write'),
    async prepare(input, context, signal) { return host.prepare(context, signal, snapshot => build(input, readRows(snapshot.book, '每日行程'))); },
  });
  return [
    read('itinerary_get_summary', '讀取目前旅程名稱、目的地、日期與各天行程數。', z.strictObject({}), (_, data) => ({
      trip: data.trip, timezone: data.timezone,
      days: tripDates(data.trip.start, data.trip.end).map(day => ({ date: day, count: data.activities.filter(row => row['日期'] === day).length })),
    })),
    read('itinerary_get_activities', '讀取目前旅程行程；日期可省略。未查證交通、營業時間與費用，不推定路線最佳化。', z.strictObject({ date: date.optional() }), (input, data) =>
      orderedItinerary(data.activities.filter(row => !(input as {date?: string}).date || row['日期'] === (input as {date?: string}).date))),
    read('itinerary_search', '搜尋目前旅程已知景點，回傳穩定 ID。', z.strictObject({ query: z.string().trim().min(1).max(200) }), (input, data) => {
      const query = (input as {query: string}).query.toLocaleLowerCase();
      return orderedItinerary(data.activities.filter(row => [row['標題'], itinerarySubtitle(row)].join('\n').toLocaleLowerCase().includes(query)));
    }),
    read('itinerary_missing_maps', '找出沒有 Google Maps 連結的行程；搜尋連結未經地點核實。', z.strictObject({}), (_, data) =>
      data.activities.filter(row => !hasMapLink(row)).map(row => ({ id: row['行程ID'], date: row['日期'], title: row['標題'] }))),
    write('itinerary_add', '準備新增目前旅程的一筆行程，必須等待使用者確認。', draft, input => ({ summary: '新增行程', mutations: [record('add', values(input as Record<string, unknown>))] })),
    write('itinerary_update', '準備修改指定行程，僅傳需要變更欄位。保留其他資料，等待確認。', z.strictObject({ id, patch }), (input, rows) => {
      const request = input as { id: string; patch: Record<string, unknown> };
      if (!Object.keys(request.patch).length) throw new Error('請指定修改欄位。');
      return { summary: '修改行程', mutations: [record('edit', values(request.patch, find(rows, request.id)))] };
    }),
    write('itinerary_delete', '準備刪除指定行程；破壞性操作，必須等待確認。', z.strictObject({ id }), (input, rows) => ({
      summary: '刪除行程（確認後無法復原）', mutations: [record('delete', find(rows, (input as {id: string}).id))],
    }), true),
    write('itinerary_move', '移動一筆行程到指定日期與從 0 起算的位置；時間衝突會在預覽明列清除該筆時間，等待確認。', z.strictObject({ id, date, index: z.number().int().min(0).max(10000) }), (input, rows) => {
      const request = input as {id: string; date: string; index: number};
      const moved = moveItineraryToDay(rows, request.id, request.date, request.index);
      const row = values({}, find(rows, request.id)); row['日期'] = request.date;
      if (moved.conflict) { row['開始時間'] = ''; row['結束時間'] = ''; }
      return { summary: '移動行程', warnings: moved.conflict ? ['時間順序衝突：確認後清除被移動這筆的時間，其他活動時間保留。'] : [],
        mutations: [{ ...record('edit', row), itineraryOrder: moved.rows.map(item => item['行程ID']) }] };
    }),
    write('itinerary_import', '將上傳文件抽取為行程。只能使用文件明確提供的日期、時間、標題；缺少日期或日期不符須詢問，不能編造。未解析內容列 warnings。最多100筆，等待逐筆預覽確認。',
      z.strictObject({ activities: z.array(draft).min(1).max(100), warnings: z.array(z.string().max(1000)).max(100) }), (input, rows) => {
        const request = input as {activities: Record<string, unknown>[]; warnings: string[]};
        const mutations = request.activities.map(item => record('add', values(item)));
        const seen = new Set(rows.map(row => JSON.stringify([row['日期'], row['開始時間'], row['標題'].trim()])));
        const warnings = [...request.warnings];
        for (const mutation of mutations) {
          const row = mutation.values, key = JSON.stringify([row['日期'], row['開始時間'], row['標題'].trim()]);
          if (seen.has(key)) warnings.push(`疑似重複：${row['日期']} ${row['開始時間']} ${row['標題']}`);
          seen.add(key);
        }
        return { summary: `匯入 ${mutations.length} 筆行程`, mutations, warnings };
      }),
    write('itinerary_apply_maps', '為缺少地圖的具體景點建立 Google Maps 搜尋連結，非查證地點；只用現有景點名稱及旅程目的地。已有連結不覆蓋，模糊名稱須先詢問。等待確認。',
      z.strictObject({ ids: z.array(id).min(1).max(100) }), (input, rows) => {
        const ids = (input as {ids: string[]}).ids;
        if (new Set(ids).size !== ids.length) throw new Error('不能重複指定行程。');
        const mutations = ids.map(target => {
          const previous = find(rows, target);
          if (hasMapLink(previous)) throw new Error('已有地圖連結，不能覆蓋。');
          const row = values({}, previous);
          row['說明'] = [row['說明'], `[Google Maps](${mapSearchUrl(previous['標題'], host.trip.destination)})`].filter(Boolean).join('\n');
          return record('edit', row);
        });
        return { summary: `補上 ${mutations.length} 筆地圖搜尋連結`, mutations, warnings: ['這些是 Google Maps 搜尋網址，尚未核實精確地點。'] };
      }),
  ];
}
