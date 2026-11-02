import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AgentState } from '../../ai/contracts';
import { trapDialogFocus } from '../../ai/ui/dialog-focus';
import { ChatPanel } from '../../ai/ui/ChatPanel';
import { chatEntries } from '../../ai/ui/presentation';
import { createPortal } from 'react-dom';
import { CloseButton } from '../../components/CloseButton';
import { readModelOptions } from './model-options';
import { conversationKey, conversationStorage } from './conversation-storage';
import { useChatSurface } from './useChatSurface';
import { Icon } from '../../components/Icon';
import { MarkdownContent } from '../../components/MarkdownContent';
import type { GuideConfig, GuideSession } from '../../data/guide-auth';
import { isSuperUser } from '../../data/guide-auth';
import type { Trip, TripData } from '../../data/portal';
import type { createTripAgent } from './index';
import { EmailPreview } from './EmailPreview';
import { ChangePreview } from './ChangePreview';
import { displayAIText, writeResultLabel } from './preview';
import styles from './TripAIEntry.module.css';

type TripAgent = ReturnType<typeof createTripAgent>;
const idle = (): AgentState => ({ status: 'idle', messages: [], results: [] });
const suggestions = ['總結這趟行程', '看看哪一天安排太趕', '找出缺少地圖的景點'];
export interface TripAIEntryProps {
  trip: Trip; source: 'trip' | 'demo'; data: TripData | null; available: boolean; loading: boolean;
  config: GuideConfig; session: GuideSession | null;
  onSaved(): void; onExpired(): void; onBusy(busy: boolean): void; onExpanded?(expanded: boolean): void;
}

/** Host owns dialog, lifecycle and credentials; portable panel never sees these services. */
export function TripAIEntry(props: TripAIEntryProps) {
  const latest = useRef(props); latest.current = props;
  const dialog = useRef<HTMLElement>(null), launcher = useRef<HTMLButtonElement>(null);
  const current = useRef<TripAgent | null>(null), unsubscribe = useRef<(() => void) | undefined>(undefined);
  const generation = useRef(0), fileRead = useRef<AbortController | null>(null), ownRefresh = useRef(false);
  const previousData = useRef(props.data), holdsBusy = useRef(false);
  const [open, setOpen] = useState(false), [panelKey, setPanelKey] = useState(0);
  const [state, setState] = useState<AgentState>(idle);
  const [connecting, setConnecting] = useState(false), [parsing, setParsing] = useState(false), [ready, setReady] = useState(false);
  const [notice, setNotice] = useState(''), [error, setError] = useState('');
  const title = useId();
  const desktop = useChatSurface(open, dialog, props.onExpanded);
  const modelChoices=useMemo(() => {
    try { return readModelOptions({VITE_AI_DEFAULT_MODEL:import.meta.env.VITE_AI_DEFAULT_MODEL,VITE_AI_MODELS:import.meta.env.VITE_AI_MODELS}); }
    catch { return {defaultModel:import.meta.env.VITE_AI_DEFAULT_MODEL?.trim() || '',models:[] as string[]}; }
  }, []);
  const [selectedModel,setSelectedModel]=useState(modelChoices.defaultModel);
  const previousModel=useRef(selectedModel);
  const [memory, setMemory] = useState('本分頁暫存');
  const storage = useRef(conversationStorage(() => window.sessionStorage)).current;
  const storageScope=[import.meta.env.BASE_URL,props.source,props.trip.id,props.trip.spreadsheetId,
    props.session?.email.toLowerCase() || 'visitor',import.meta.env.VITE_AI_FIREBASE_CONFIG || ''];
  const storageKey=conversationKey([...storageScope,selectedModel]);
  const previousScope=useRef(storageScope);
  const previousIdentity = useRef(props.session?.email);
  const previousKey = useRef(storageKey);
  function removeSaved(key = storageKey) {
    try { storage.remove(key); return true; } catch { setMemory('僅保留本次對話：瀏覽器無法暫存'); return false; }
  }
  const writing = state.status === 'committing';

  function updateBusy(value: boolean) {
    if (holdsBusy.current !== value) {
      holdsBusy.current = value;
      latest.current.onBusy(value);
    }
  }
  function clear(resetPanel = true) {
    generation.current++; fileRead.current?.abort(); fileRead.current = null;
    unsubscribe.current?.(); unsubscribe.current = undefined;
    current.current?.agent.dispose(); current.current = null; ownRefresh.current = false;
    setState(idle()); setReady(false); setConnecting(false); setParsing(false); setError('');
    if (resetPanel) setPanelKey(key => key + 1); updateBusy(false);
  }
  async function connect(restore = true) {
    const token = ++generation.current;
    setConnecting(true); setError(''); setNotice('正在連線 AI 助手…');
    try {
      const { createConfiguredTripAgent } = await import('./index');
      const active = latest.current;
      if (import.meta.env.DEV && import.meta.env.VITE_AI_APP_CHECK_DEBUG_TOKEN) {
        (globalThis as typeof globalThis & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_AI_APP_CHECK_DEBUG_TOKEN;
      }
      const instance = await createConfiguredTripAgent({
        trip: active.trip, source: active.source, config: active.config,
        getSession: () => latest.current.data && latest.current.available ? latest.current.session : null,
        readData: async () => {
          const value = latest.current;
          if (!value.available || !value.data || value.loading) throw new Error('目前行程尚未讀取完成。');
          return value.data;
        },
        onExpired: () => latest.current.onExpired(),
        onSaved: () => { ownRefresh.current = true; latest.current.onSaved(); },
      }, {
        VITE_AI_ENABLED: import.meta.env.VITE_AI_ENABLED,
        VITE_AI_FIREBASE_CONFIG: import.meta.env.VITE_AI_FIREBASE_CONFIG,
        VITE_AI_DEFAULT_MODEL: import.meta.env.VITE_AI_DEFAULT_MODEL,
        VITE_AI_MODELS: import.meta.env.VITE_AI_MODELS,
        VITE_AI_APP_CHECK_SITE_KEY: import.meta.env.VITE_AI_APP_CHECK_SITE_KEY,
        VITE_EMAILJS_ENABLED: import.meta.env.VITE_EMAILJS_ENABLED,
        VITE_EMAILJS_SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID,
        VITE_EMAILJS_TEMPLATE_ID: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        VITE_EMAILJS_PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
      },selectedModel);
      if (token !== generation.current) { instance?.agent.dispose(); return; }
      if (!instance) { setNotice('AI 助手尚未啟用，請聯絡導遊。'); return; }
      current.current = instance;
      setMemory('本分頁暫存');
      try {
        const saved = restore ? storage.read(storageKey) : null;
        if (saved) { instance.agent.restoreConversation(saved); setMemory('已恢復本分頁的完整對話'); }
      } catch {
        removeSaved(); setMemory('無法恢復暫存；已開始新對話');
      }
      unsubscribe.current = instance.agent.subscribe(() => {
        const next = instance.agent.getState();
        setState(next); updateBusy(next.status === 'committing');
        try {
          if (next.status === 'idle') {
            const checkpoint = instance.agent.exportConversation();
            if (checkpoint) storage.write(storageKey, checkpoint);
            else { storage.remove(storageKey); setMemory('此對話僅保留本次，重新整理後清空'); }
          } else if (next.status === 'committing' || next.status === 'error') storage.remove(storageKey);
        } catch { setMemory('僅保留本次對話：瀏覽器無法暫存'); }
      });
      setState(instance.agent.getState()); setReady(true);
      setNotice('輸入提示詞即可開始使用，或是可以先試試以下功能～');
    } catch { if (token === generation.current) { setError('AI 服務目前無法啟動，請稍後再試或聯絡導遊。'); setNotice('AI 服務暫時無法使用。'); } }
    finally { if (token === generation.current) setConnecting(false); }
  }
  function resetConversation() {
    if (current.current?.agent.getState().status === 'committing') return;
    const removed = removeSaved(); clear(); setMemory('本分頁暫存');
    void connect(false).then(() => { if (!removed) setMemory('已清空本次，瀏覽器無法移除暫存'); });
  }
  function minimize() {
    if (current.current?.agent.getState().status === 'committing') return;
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus({ preventScroll: true }));
  }
  useEffect(() => {
    if (!open || desktop) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); minimize(); }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, desktop]);
  function show() {
    setOpen(true);
    if (!current.current && !connecting) void connect();
  }
  // Auth changes must not retain previews or responses from a previous identity.
  useEffect(() => {
    if (previousIdentity.current !== props.session?.email) {
      removeSaved(previousKey.current);
      for (const model of modelChoices.models) removeSaved(conversationKey([...previousScope.current,model]));
    }
    previousIdentity.current = props.session?.email; previousKey.current = storageKey; previousScope.current = storageScope;
    clear();
    if (open && latest.current.available) void connect();
    // Changes to mutable data/callbacks use latest; identity changes rebuild the host.
  }, [props.session?.email, props.session?.token, props.trip.id, props.trip.spreadsheetId, props.source]);
  useEffect(() => {
    if (previousModel.current===selectedModel) return;
    previousModel.current=selectedModel; previousKey.current=storageKey;
    clear(false);
    if (open && latest.current.available) void connect();
  }, [selectedModel]);
  function changeModel(value: string) {
    const active=current.current?.agent.getState().status;
    if (!modelChoices.models.includes(value) || connecting || parsing || props.loading || (active && ['running','awaiting_confirmation','committing'].includes(active))) return;
    setSelectedModel(value);
  }
  useEffect(() => {
    if (!props.available) {
      setOpen(false); clear();
    }
  }, [props.available]);
  useEffect(() => {
    if (previousData.current !== props.data && current.current) {
      if (ownRefresh.current) { if (props.data) ownRefresh.current = false; }
      else { clear(); setNotice('行程資料已更新，待確認操作已清除。'); }
    }
    previousData.current = props.data;
    if (props.data && open && !current.current && !connecting && props.available) void connect();
  }, [props.data]);
  useEffect(() => () => {
    generation.current++; fileRead.current?.abort(); unsubscribe.current?.(); current.current?.agent.dispose();
    updateBusy(false);
  }, []);

  async function send(text: string, files: File[]) {
    const instance = current.current, token = generation.current;
    if (!instance || latest.current.loading || !latest.current.data) throw new Error('請等行程與 AI 服務準備完成。');
    fileRead.current = new AbortController();
    try {
      setParsing(files.length > 0);
      if (files.length) { removeSaved(); setMemory('附件對話僅保留本次，重新整理後清空'); }
      const { prepareFiles } = await import('../../ai/files/intake');
      const parts = await prepareFiles(files, fileRead.current.signal);
      if (token !== generation.current) return;
      setParsing(false);
      await instance.agent.send(text, parts);
    } finally { if (token === generation.current) setParsing(false); }
  }
  async function decide(approved: boolean) {
    const instance = current.current, pending = instance?.agent.getState().pending;
    if (!instance || !pending || latest.current.loading) return;
    setError('');
    try { if (approved) await instance.agent.approve(pending.id); else await instance.agent.reject(pending.id); }
    catch { setError(pending.toolName === 'itinerary_request_email' ? '郵件操作已處理或無法提交，請先確認是否已寄送，勿直接重送。' : '此操作已處理或無法提交，請重新讀取行程後再試。'); }
  }
  const showIds = isSuperUser(props.session, props.config);
  const entries = chatEntries(state.messages, writeResultLabel).map(entry => ({ ...entry, text: displayAIText(entry.text, showIds) }));
  const status = connecting ? '正在連線…' : parsing ? '正在解析檔案…' : writing ? '正在提交，請勿關閉視窗…' : props.loading ? '正在更新行程…' :
    state.status === 'running' ? '思考中...' : state.status === 'awaiting_confirmation' ? state.pending?.toolName === 'itinerary_request_email' ? '等待你確認寄送' : '等待你確認變更' : !ready ? 'AI 尚未就緒' :
    '';
  const modelLocked=connecting || parsing || props.loading || ['running','committing','awaiting_confirmation'].includes(state.status);
  if (!props.available) return null;
  return <>
    <button ref={launcher} type="button" className={`no-print ${styles.launcher}`} aria-label={open ? 'AI 助手已開啟' : state.pending ? '開啟 AI 助手，尚有待確認變更' : '開啟 AI 助手'}
      aria-haspopup={desktop ? undefined : 'dialog'} aria-expanded={open} onClick={show}>
      <Icon name="robot" size={32} /><span>AI 助手</span>{state.pending && <span className={styles.pendingDot}>待確認</span>}
    </button>
    {typeof document !== 'undefined' && createPortal(<div className={`no-print ${styles.surface}`} hidden={!open}>
      <aside ref={dialog} className={styles.dialog} role={desktop ? 'complementary' : 'dialog'} aria-modal={!desktop && open ? true : undefined}
        data-modal-open={!desktop && open ? 'true' : undefined} aria-labelledby={title} tabIndex={-1}
        onKeyDown={event => {
          if (!desktop) trapDialogFocus(event.currentTarget, event);
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); minimize(); }
        }}>
        <div className={styles.heading}>
          <span className={styles.robot}><Icon name="robot" size={30} /></span>
          <div className={styles.title}><h2 id={title}>AI 助手</h2><p title={props.trip.name}>{props.trip.name}</p></div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.headerButton} disabled={writing || connecting} onClick={resetConversation}
              aria-label="新對話" title="新對話">新對話</button>
            <CloseButton label="關閉 AI 助手" disabled={writing} onClick={minimize} />
          </div>
        </div>
        {memory !== '本分頁暫存' && memory !== '已恢復本分頁的完整對話' && <p className={styles.memoryNotice}>{memory}</p>}
        <ChatPanel key={panelKey} entries={entries} disabled={!ready || connecting || parsing || props.loading || ['running','committing','awaiting_confirmation'].includes(state.status)}
          errorTone={state.errorCode === 'model_unavailable' ? 'danger' : 'default'} quotaExceeded={state.errorCode === 'rate_limit'} modelSelector={modelChoices.models.length > 0 && <select className={styles.modelSelect} aria-label="語言模型" title={selectedModel} value={selectedModel} disabled={modelLocked} onChange={event => changeModel(event.target.value)}>
            {modelChoices.models.map(model => <option key={model} value={model}>{model}{model === modelChoices.defaultModel ? ' (推薦)' : ''}</option>)}
          </select>}
          status={status} thinking={status === '思考中...'} enterToSend error={error || state.error} notice={notice} suggestions={suggestions}
          onSend={send}
          renderMessage={(text, role) => role === 'model' ? <MarkdownContent text={text} allowImages={false} /> : text}
          previewId={state.pending?.id} preview={state.pending && (state.pending.toolName === 'itinerary_request_email' ? <EmailPreview preview={state.pending} disabled={writing || props.loading} onApprove={() => void decide(true)} onReject={() => void decide(false)} /> : <ChangePreview preview={state.pending} showIds={showIds} disabled={writing || props.loading}
            onApprove={() => void decide(true)} onReject={() => void decide(false)} />)} />
      </aside>
    </div>, document.body)}
  </>;
}
