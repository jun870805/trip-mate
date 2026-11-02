import type { AgentContext, Change, PreparedChange, Preview, ToolResult } from '../../ai/contracts.ts';
import type { GuideConfig, GuideSession } from '../../data/guide-auth.ts';
import { assertGuideSession, WRITE_SCOPE } from '../../data/guide-auth.ts';
import type { Trip, TripData, Row } from '../../data/portal.ts';
import { automaticTripIds, createTripEditor, mutateTripBook, readRows, TripEditApiError } from '../../data/trip-editor.ts';
import type { EditorSnapshot, TripMutation } from '../../data/trip-editor.ts';

export interface TripHostOptions {
  trip: Trip;
  source: "trip" | "demo";
  config: GuideConfig;
  getSession(): GuideSession | null;
  /** Existing successful public reader/state; must throw while loading or denied. */
  readData(): Promise<TripData>;
  fetcher?: typeof fetch;
  onSaved?(): void | Promise<void>;
  onExpired?(): void;
}
export type ItineraryMutation = Extract<TripMutation, { kind: 'record' }>;
export interface MutationPlan { summary: string; mutations: ItineraryMutation[]; warnings?: string[] }
export const editableColumns = ['日期', '開始時間', '標題', '說明', '內文', '類型', '類別'] as const;
export function activity(row: Row): Row {
  return Object.fromEntries(['行程ID', ...editableColumns, '地點', '地圖網址', '排序'].map(key => [key, row[key] || '']));
}

export function createTripHost(options: TripHostOptions) {
  const trip = Object.freeze(structuredClone(options.trip));
  const editor = createTripEditor(trip, 'itinerary', options.config, options.fetcher);
  let needsReload = false, committing = false;
  function session() {
    if (options.source === "demo") throw new Error("範例不允許寫入雲端。");
    const current = options.getSession();
    assertGuideSession(current, options.config);
    if (!current.scopes?.includes(WRITE_SCOPE)) throw new Error('請重新登入並同意試算表編輯授權。');
    return current;
  }
  const matches = (context: AgentContext) => {
    if (context.scope !== 'trip-itinerary' || context.scopeId !== trip.id)
      throw new Error('不能操作其他旅程。');
  };
  return {
    trip,
    getContext(): AgentContext {
      let canWrite = false;
      try { session(); canWrite = !needsReload && !committing; } catch { /* visitors have read access only */ }
      let canRead = true;
      if (options.source === 'demo') { try { assertGuideSession(options.getSession(), options.config); } catch { canRead = false; } }
      return { scope: 'trip-itinerary', scopeId: trip.id, locale: 'zh-TW', permissions: canWrite ? ['read', 'write'] : canRead ? ['read'] : [] };
    },
    async read(context: AgentContext, signal: AbortSignal) {
      matches(context); signal.throwIfAborted();
      if (options.source === "demo") assertGuideSession(options.getSession(), options.config);
      const data = await options.readData();
      if (options.source === "demo") assertGuideSession(options.getSession(), options.config);
      signal.throwIfAborted();
      if (data.trip.id !== trip.id || data.trip.spreadsheetId !== trip.spreadsheetId || data.sectionErrors?.itinerary)
        throw new Error('目前行程資料無法使用，請重新讀取。');
      return { trip: { id: trip.id, name: trip.name, destination: trip.destination, start: trip.start, end: trip.end },
        timezone: data.timezone, activities: data.tables['每日行程'].map(activity) };
    },
    async prepare(context: AgentContext, signal: AbortSignal, build: (snapshot: EditorSnapshot) => MutationPlan): Promise<PreparedChange> {
      matches(context); signal.throwIfAborted();
      if (needsReload || committing) throw new Error('請重新讀取後再修改。');
      const owner = session().email;
      const before = await editor.read(session());
      signal.throwIfAborted();
      const plan = structuredClone(build(structuredClone(before)));
      if (!plan.mutations.length || plan.mutations.length > 100 || plan.mutations.some(item => item.sheet !== '每日行程'))
        throw new Error('只允許 1～100 筆每日行程操作。');
      let book = before.book;
      for (const mutation of plan.mutations) book = mutateTripBook(trip, book, automaticTripIds(book, mutation));
      const original = readRows(before.book, '每日行程');
      const next = readRows(book, '每日行程');
      const changes: Change[] = [];
      for (const row of next) {
        const previous = original.find(item => item['行程ID'] === row['行程ID']);
        if (JSON.stringify(previous) !== JSON.stringify(row)) changes.push({ operation: previous ? 'update' : 'create',
          target: row['行程ID'], before: previous ? activity(previous) : undefined, after: activity(row) });
      }
      for (const row of original) if (!next.some(item => item['行程ID'] === row['行程ID']))
        changes.push({ operation: 'delete', target: row['行程ID'], before: activity(row) });
      if (!changes.length) throw new Error('沒有需要儲存的變更。');
      const preview: Preview = { summary: `${trip.name}：${plan.summary}`, changes, warnings: plan.warnings };
      let consumed = false;
      return { preview, async commit(current, commitSignal): Promise<ToolResult> {
        if (consumed) return { status: 'error', message: '操作已處理，請重新讀取。' };
        consumed = true;
        try {
          matches(current); commitSignal.throwIfAborted();
          if (needsReload || committing || session().email !== owner) throw new Error('登入或寫入狀態已變更。');
          committing = true;
          const authorized = session();
          await editor.saveItineraryBatch(authorized, before, plan.mutations, () => {
            commitSignal.throwIfAborted();
            const latest = session();
            if (latest.email !== owner || latest.token !== authorized.token) throw new Error('登入狀態已變更。');
          });
        } catch (error) {
          needsReload = true;
          if (error instanceof TripEditApiError && error.status === 401) options.onExpired?.();
          return { status: error instanceof Error && error.message.includes('其他地方更新') ? 'conflict' : 'error',
            message: '寫入未確認成功，請重新讀取或登入後再操作；勿直接重送。' };
        } finally { committing = false; }
        // A page refresh callback cannot turn a successful commit into a retryable failure.
        let refreshFailed = false;
        try { await options.onSaved?.(); } catch { refreshFailed = true; }
        return { status: 'success', data: { count: plan.mutations.length, targets: changes.map(change => change.target), refreshFailed } };
      } };
    },
    async reload() {
      if (committing) throw new Error('寫入中。');
      await editor.read(session()); needsReload = false;
    },
  };
}
export type TripHost = ReturnType<typeof createTripHost>;
