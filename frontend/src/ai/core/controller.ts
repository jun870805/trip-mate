import type { AgentContext, AgentOptions, AgentState, PreparedChange, Tool, ToolResult } from '../contracts.ts';
import { readConversation } from './conversation.ts';
import type { Conversation } from './conversation.ts';
import { ProviderRateLimitError, ProviderModelUnavailableError } from './errors.ts';
import { createRegistry } from './registry.ts';
import { BASE_RULES } from '../prompts/base-rules.ts';

// Preserve existing imports while keeping prompt maintenance separate from orchestration.
export { BASE_RULES } from '../prompts/base-rules.ts';


export function createAgent(options: AgentOptions) {
  const registry = createRegistry(options.tools);
  const bound = structuredClone(options.getContext());
  const maxTurns = options.maxTurns ?? 5, maxCalls = options.maxToolCalls ?? 10;
  const maxMessages = options.maxMessages ?? 80, maxInputChars = options.maxInputChars ?? 20000;
  if (![maxTurns, maxCalls, maxMessages, maxInputChars].every(n => Number.isSafeInteger(n) && n > 0))
    throw new Error('AI 限制必須是正整數。');
  let state: AgentState = { status: 'idle', messages: [], results: [] };
  let aborter = new AbortController(), epoch = 0, turns = 0, calls = 0;
  let hasFiles = false;
  let pending: { prepared: PreparedChange; tool: Tool } | undefined;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) { try { listener(); } catch { /* observers cannot interrupt writes */ } } };
  const snapshot = () => structuredClone(state);
  function context(): AgentContext {
    const current = options.getContext();
    if (current.scope !== bound.scope || current.scopeId !== bound.scopeId)
      throw new Error('AI 作用範圍已變更，請建立新的對話。');
    return structuredClone(current);
  }
  function active(token: number) { return token === epoch && !aborter.signal.aborted && state.status !== 'disposed'; }
  function fail(message = 'AI 請求失敗，請重新確認後再試。', errorCode?: AgentState['errorCode']) {
    pending = undefined;
    state = { ...state, status: 'error', pending: undefined, error: message, errorCode };
    emit();
  }
  function record(name: string, result: ToolResult) {
    state.results.push(structuredClone(result));
    state.messages.push({ role: 'user', parts: [{ result: { name, response: structuredClone(result) } }] });
  }
  async function loop(token: number): Promise<void> {
    try {
      while (active(token)) {
        if (turns++ >= maxTurns || state.messages.length >= maxMessages)
          throw new Error('AI 達到本次處理上限，請縮小問題範圍或建立新對話。');
        const current = context();
        if (new TextEncoder().encode(JSON.stringify(state.messages)).byteLength > 16 * 1024 * 1024)
          throw new Error('AI 對話資料超過上限，請建立新對話。');
        const response = await options.provider.generate({ system: [BASE_RULES, options.system].filter(Boolean).join('\n'),
          context: current, messages: structuredClone(state.messages), tools: registry.declarations(current), signal: aborter.signal });
        if (!active(token)) return;
        context();
        if (!Array.isArray(response.parts) || response.parts.length > maxCalls + 20)
          throw new Error('模型回應格式不正確。');
        const requested = response.parts.flatMap(part => 'call' in part ? [part.call] : []);
        if (requested.length > 1 && requested.some(call => registry.get(call.name)?.risk !== 'read'))
          throw new Error('一次只能提出一項待確認操作，請分開處理。');
        state.messages.push({ ...structuredClone(response), role: 'model' });
        for (const call of requested) {
          if (++calls > maxCalls) throw new Error('AI 工具呼叫次數已達上限。');
          const tool = registry.get(call.name);
          if (!tool) { record(call.name, { status: 'validation_error', message: '未註冊的工具。' }); continue; }
          const latest = context();
          if (!tool.enabled(latest)) { record(call.name, { status: 'permission_denied', message: '目前沒有操作權限。' }); continue; }
          const parsed = tool.schema.safeParse(call.args);
          if (!parsed.success) { record(call.name, { status: 'validation_error', message: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 2000) }); continue; }
          try {
            if (tool.risk === 'read') {
              const result = await tool.execute!(structuredClone(parsed.data), latest, aborter.signal);
              if (!active(token)) return;
              context();
              record(call.name, result);
            } else {
              const prepared = await tool.prepare!(structuredClone(parsed.data), latest, aborter.signal);
              if (!active(token)) return;
              context();
              pending = { prepared, tool };
              state = { ...state, status: 'awaiting_confirmation', pending: {
                ...structuredClone(prepared.preview), id: crypto.randomUUID(), scopeId: bound.scopeId, toolName: tool.name,
              } };
              emit(); return;
            }
          } catch {
            if (!active(token)) return;
            record(call.name, { status: 'error', message: '工具處理失敗，未確認任何修改；請檢查輸入或重新讀取。' });
          }
        }
        if (!requested.length) { state.status = 'idle'; emit(); return; }
        emit();
      }
    } catch (error) {
      if (active(token)) {
        if (error instanceof ProviderModelUnavailableError) fail(error.message,'model_unavailable');
        else if (error instanceof ProviderRateLimitError) fail(error.message,'rate_limit');
        else fail(error instanceof Error && /上限|範圍|一次只能|格式/.test(error.message) ? error.message : undefined);
      }
    }
  }
  async function decide(id: string, approved: boolean) {
    if (state.status !== 'awaiting_confirmation' || !pending || id !== state.pending?.id)
      throw new Error('確認操作不存在或已處理。');
    const selected = pending;
    pending = undefined;
    state = { ...state, pending: undefined, status: approved ? 'committing' : 'running' };
    emit();
    const token = epoch;
    try {
      const current = context();
      if (!selected.tool.enabled(current)) throw new Error('目前沒有操作權限。');
      const result: ToolResult = approved ? await selected.prepared.commit(current, aborter.signal) : { status: 'cancelled', message: '使用者取消，未執行修改。' };
      if (!active(token)) return;
      record(selected.tool.name, result);
      if (result.status !== 'success' && result.status !== 'cancelled') { fail(result.message); return; }
      state.status = 'running'; emit();
      await loop(token);
    } catch { if (active(token)) fail('操作未確認成功，請重新讀取資料與權限後再試；不要直接重送。'); }
  }
  function cancel() {
    if (state.status === 'committing') throw new Error('寫入中不能取消；取消不代表回滾。');
    if (state.status === 'disposed') return;
    epoch++; aborter.abort(); aborter = new AbortController(); pending = undefined;
    // Clear function-call history so a cancelled call cannot be silently replayed.
    hasFiles = false;
    state = { status: 'idle', messages: [], results: [] }; emit();
  }
  return {
    getState: snapshot,
    exportConversation(): Conversation | null {
      if (state.status !== 'idle' || hasFiles) return null;
      try { return readConversation({version:1,scope:bound.scope,scopeId:bound.scopeId,messages:state.messages}, bound.scope, bound.scopeId, maxMessages); }
      catch { return null; }
    },
    restoreConversation(value: unknown) {
      if (state.status !== 'idle' || state.messages.length) throw new Error('只能恢復到新的對話。');
      const checkpoint = readConversation(value, bound.scope, bound.scopeId, maxMessages);
      state.messages = checkpoint.messages;
      state.results = checkpoint.messages.flatMap(message => message.parts.flatMap(part => 'result' in part ? [part.result.response] : []));
      emit();
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async send(text: string, attachments: import('../contracts.ts').FilePart[] = []) {
      if (!['idle', 'error'].includes(state.status)) throw new Error('請先處理目前的操作。');
      if (!text.trim() || text.length > maxInputChars || attachments.length > 3 || state.messages.length >= maxMessages)
        throw new Error('訊息為空或超過對話限制，請建立新對話。');
      for (const part of attachments) {
        if ('text' in part) {
          if (typeof part.text !== 'string' || part.text.length > 201000) throw new Error('附件文字超過上限。');
        } else if (!('attachment' in part) || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(part.attachment.mimeType) ||
          part.attachment.data.length > 5600000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(part.attachment.data)) throw new Error('附件內容無效或過大。');
      }
      context();
      state = { ...state, status: 'running', pending: undefined, error: undefined, errorCode: undefined };
      hasFiles ||= attachments.length > 0;
      state.messages.push({ role: 'user', parts: [{ text }, ...structuredClone(attachments)] });
      turns = 0; calls = 0; emit();
      await loop(epoch);
    },
    approve: (id: string) => decide(id, true), reject: (id: string) => decide(id, false), cancel,
    dispose() {
      epoch++; aborter.abort(); pending = undefined;
      state = { status: 'disposed', messages: [], results: [] }; emit(); listeners.clear();
    },
  };
}
