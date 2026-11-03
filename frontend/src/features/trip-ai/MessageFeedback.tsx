import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { ReplyFeedbackReport } from './reply-feedback';
import styles from './TripAIEntry.module.css';

export function MessageFeedback({ report, guideEmail }: { report: Omit<ReplyFeedbackReport, 'id'>; guideEmail?: string }) {
  const [choice, setChoice] = useState<'good' | 'bad' | null>(null), [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [id] = useState(() => crypto.randomUUID());
  const attempted = useRef(false), active = useRef<AbortController | null>(null);
  const env = { VITE_EMAILJS_ENABLED: import.meta.env.VITE_EMAILJS_ENABLED,
    VITE_EMAILJS_SERVICE_ID: import.meta.env.VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
    VITE_EMAILJS_PUBLIC_KEY: import.meta.env.VITE_EMAILJS_PUBLIC_KEY };
  const available = env.VITE_EMAILJS_ENABLED === 'true' && !!guideEmail &&
    !!env.VITE_EMAILJS_SERVICE_ID?.trim() && !!env.VITE_EMAILJS_TEMPLATE_ID?.trim() && !!env.VITE_EMAILJS_PUBLIC_KEY?.trim();
  useEffect(() => () => { active.current?.abort(); }, []);
  async function sendFeedback() {
    if (!available || attempted.current) return;
    attempted.current = true;
    const snapshot = { ...report, id }, controller = new AbortController(); active.current = controller;
    setStatus('sending');
    try {
      const [{ createReplyFeedbackReporter }, { readEmailConfig }] = await Promise.all([import('./reply-feedback'), import('./emailjs')]);
      controller.signal.throwIfAborted();
      const config = readEmailConfig(env);
      if (!config) throw new Error('郵件回報尚未啟用。');
      await createReplyFeedbackReporter(config).send(snapshot, controller.signal);
      if (!controller.signal.aborted) { setStatus('sent'); window.alert('感謝您的反饋！'); }
    } catch { if (!controller.signal.aborted) setStatus('error'); }
  }
  function toggleBad() {
    if (!available) return;
    setChoice(current => current === 'bad' ? null : 'bad');
    if (choice !== 'bad') void sendFeedback();
  }
  return <>
    <button type="button" className={styles.feedbackButton} aria-label="回應良好" title="回應良好" aria-pressed={choice === 'good'}
      onClick={() => setChoice(current => current === 'good' ? null : 'good')}><Icon name="thumb-up" size={14} /></button>
    <button type="button" className={styles.feedbackButton} aria-label="回應不佳" title={available ? '回應不佳' : '回應不佳（郵件回報尚未啟用）'}
      aria-pressed={choice === 'bad'} disabled={!available} onClick={toggleBad}><Icon name="thumb-down" size={14} /></button>
    {status === 'sending' && <span role="status" className={styles.feedbackStatus}>回饋寄送中…</span>}
    {status === 'error' && <span role="status" className={styles.feedbackStatus}>回饋未確認寄送成功，請勿重複寄送。</span>}
  </>;
}
