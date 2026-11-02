import { useEffect, useRef, useState } from 'react';
import styles from './ChatPanel.module.css';

/** Copies only the visible reply source, never raw tools, attachments or provider content. */
export function CopyMessageButton({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const alive = useRef(true), copying = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; clearTimeout(timer.current); };
  }, []);
  async function copy() {
    if (copying.current) return;
    copying.current = true;
    clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (alive.current) {
        setStatus('copied');
        timer.current = setTimeout(() => setStatus('idle'), 2000);
      }
    } catch { if (alive.current) setStatus('error'); }
    finally { copying.current = false; }
  }
  return <div className={styles.replyActions}>
    <button type="button" className={styles.copyButton} aria-label="複製回覆" title={status === 'copied' ? '已複製' : '複製回覆'} onClick={() => void copy()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {status === 'copied' ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></>}
      </svg>
    </button>
    <span aria-live="polite" className={status === 'error' ? styles.copyError : styles.srOnly}>{status === 'copied' ? '已複製回覆' : status === 'error' ? '無法複製，請手動選取文字。' : ''}</span>
  </div>;
}
