import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChatEntry } from './presentation.ts';
import styles from './ChatPanel.module.css';
import { CopyMessageButton } from './CopyMessageButton';

export interface ChatPanelProps {
  entries: ChatEntry[];
  disabled: boolean;
  status: string;
  thinking?: boolean;
  enterToSend?: boolean;
  error?: string;
  errorAction?: ReactNode;
  quotaExceeded?: boolean;
  errorTone?: 'default' | 'danger';
  modelSelector?: ReactNode;
  notice?: string;
  suggestions?: readonly string[];
  preview?: ReactNode;
  previewId?: string;
  renderMessage?(text: string, role: ChatEntry['role']): ReactNode;
  onSend(text: string, files: File[]): Promise<void>;
  onReset?(): void;
}
/** Portable controlled view: application owns the agent, permissions, modal and preview. */
export function ChatPanel({ entries, disabled, status, thinking = false, enterToSend = true, error, errorAction, quotaExceeded = false, errorTone = 'default', modelSelector, notice, suggestions = [], preview, previewId,
  renderMessage = text => text, onSend, onReset }: ChatPanelProps) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [inputError, setInputError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null), previewElement = useRef<HTMLDivElement>(null);
  const id = useId();
  const inFlight = useRef(false);
  const locked = disabled || sending;
  useEffect(() => {
    const region = scroll.current;
    if (region) region.scrollTop = previewId && previewElement.current ? previewElement.current.offsetTop : region.scrollHeight;
  }, [entries.length, previewId, status]);
  async function sendMessage(submitted: string, selected: File[], clearDraft: boolean) {
    if (locked || inFlight.current || (!submitted.trim() && !selected.length)) return;
    inFlight.current = true;
    setSending(true); setInputError('');
    if (clearDraft) { setText(''); setFiles([]); }
    try { await onSend(submitted.trim() || '請從上傳檔案整理行程，日期不明的項目先詢問。', selected); }
    catch (cause) {
      if (clearDraft) { setText(submitted); setFiles(selected); }
      setInputError(cause instanceof Error ? cause.message : '無法送出訊息，請稍後再試。');
    } finally { inFlight.current = false; setSending(false); }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage(text, files, true);
  }
  return <div className={styles.panel}>
    <div ref={scroll} className={styles.scroll}>
      {!entries.length && <div className={styles.empty}>
        <h3 className={styles.welcomeTitle}>您好！ 我是您的 AI 助手</h3>
        <p>{notice || '輸入提示詞即可開始使用，或是可以先試試以下功能～'}</p>
        {!disabled && suggestions.length > 0 && <div className={styles.suggestions} aria-label="常用問題">
          {suggestions.map(suggestion => <button type="button" key={suggestion} disabled={locked} onClick={() => void sendMessage(suggestion, [], false)}>{suggestion}</button>)}
        </div>}
      </div>}
      <div role="log" aria-label="聊天記錄" aria-live="polite" aria-relevant="additions" aria-busy={thinking} className={styles.messages}>
        {entries.map(entry => <div key={entry.id} className={`${styles.message} ${entry.role === 'user' ? styles.user : entry.role === 'status' ? styles.result : styles.model}`}>
          <span className={entry.role === 'status' ? styles.author : styles.srOnly}>{entry.role === 'user' ? '你' : entry.role === 'status' ? '操作結果' : 'AI 助手'}</span>
          <div className={styles.messageBody}>{renderMessage(entry.text, entry.role)}</div>
          {entry.files.length > 0 && <ul className={styles.sentFiles} aria-label="已送出的附件">{entry.files.map((name, index) => <li key={index}>{name}</li>)}</ul>}
          {entry.role === 'model' && entry.text.trim() && <CopyMessageButton text={entry.text} />}
        </div>)}
      </div>
      {preview && <div ref={previewElement} className={styles.preview}>{preview}</div>}
      {(error || inputError) && <p className={`${styles.error} ${quotaExceeded || errorTone === 'danger' ? styles.quotaError : ''}`} role="alert">{inputError || error}{!inputError && error && errorAction && <> {errorAction}</>}</p>}
    </div>
    <form className={styles.composer} onSubmit={submit}>
      {(status || onReset) && <div className={styles.statusRow}>
        {status && <p role="status" className={styles.status}>{thinking && <span className={styles.spinner} aria-hidden="true" />}{status}</p>}
        {onReset && <button type="button" className={styles.textButton} onClick={onReset} disabled={sending}>重新開始</button>}
      </div>}
      <label className={styles.srOnly} htmlFor={id}>訊息</label>
      <div className={styles.inputFrame}>
      <textarea id={id} ref={input} value={text} onChange={event => setText(event.target.value)}
        rows={3} maxLength={20000} disabled={locked} placeholder="問問 AI助手"
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (enterToSend || event.ctrlKey || event.metaKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} />
      </div>
      {files.length > 0 && <ul className={styles.selectedFiles} aria-label="待上傳附件">
        {files.map((file, index) => <li key={index}><span>{file.name}</span><button type="button" disabled={locked} aria-label={`移除附件 ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))}>移除</button></li>)}
      </ul>}
      <div className={styles.controls}>
        <div>
          <input ref={fileInput} type="file" multiple hidden accept=".txt,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp" disabled={locked} aria-label="選擇行程檔案"
            onChange={event => {
              const next = [...files, ...Array.from(event.target.files || [])];
              event.target.value = '';
              if (next.length > 3 || next.some(file => file.size === 0 || file.size > 4 * 1024 * 1024)) setInputError('每次最多 3 個檔案，每檔須為 1 byte～4 MiB。');
              else { setFiles(next); setInputError(''); }
            }} />
          <button type="button" className={styles.secondary} disabled={locked} onClick={() => fileInput.current?.click()}>上傳檔案</button>
        </div>
        <div className={styles.sendControls}>
          {modelSelector && <fieldset className={styles.modelControl} disabled={sending}>{modelSelector}</fieldset>}
          <button type="submit" className={styles.primary} disabled={locked || (!text.trim() && !files.length)}>送出</button>
        </div>
      </div>
    </form>
  </div>;
}
