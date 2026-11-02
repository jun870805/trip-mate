import { useEffect, useMemo, useRef, useState } from 'react';
import { createAIErrorReporter } from './error-report';
import type { AIErrorReport } from './error-report';
import { readEmailConfig } from './emailjs';
import styles from './TripAIEntry.module.css';

export default function ErrorReportButton({ report, guideEmail }: { report: AIErrorReport; guideEmail?: string }) {
  const reporter = useMemo(() => {
    const config = readEmailConfig({ VITE_EMAILJS_ENABLED: import.meta.env.VITE_EMAILJS_ENABLED,
      VITE_EMAILJS_SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID,
      VITE_EMAILJS_TEMPLATE_ID: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
      VITE_EMAILJS_PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY });
    return config && guideEmail ? createAIErrorReporter(config) : null;
  }, [guideEmail]);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const active = useRef<AbortController | null>(null), attempted = useRef(false);
  useEffect(() => () => { active.current?.abort(); }, []);
  async function send() {
    if (!reporter || attempted.current) return;
    attempted.current = true;
    const controller = new AbortController(); active.current = controller;
    setStatus('sending');
    try {
      await reporter.send(report, controller.signal);
      if (!controller.signal.aborted) {
        setStatus('sent');
        window.alert('回報成功\n謝謝您的回報，我們將儘速修正錯誤');
      }
    } catch {
      if (!controller.signal.aborted) setStatus('error');
    }
  }
  return <>
    <button type="button" className={styles.reportButton} disabled={!reporter || status !== 'idle'} onClick={() => void send()}
      title={!reporter ? '尚未設定錯誤回報郵件服務' : undefined}>{status === 'sending' ? '回報中…' : status === 'sent' ? '已回報' : '回報錯誤'}</button>
    {status === 'error' && <span role="status"> 回報未確認成功，請勿重複寄送。</span>}
    {!reporter && <span>（郵件回報尚未啟用）</span>}
  </>;
}
