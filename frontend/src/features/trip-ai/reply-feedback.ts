import { redactDiagnosticText } from '../../ai/core/diagnostics.ts';
import { createEmailSender, formatEmailTime } from './emailjs.ts';
import type { EmailConfig } from './emailjs.ts';

export interface ReplyFeedbackReport {
  id: string; question: string; answer: string; tripName: string; tripId: string; model: string; pageUrl: string;
}
export function createReplyFeedbackReporter(config: EmailConfig, fetcher: typeof fetch = fetch) {
  const sender = createEmailSender(config, fetcher), attempted = new Set<string>();
  let sending = false;
  return { async send(report: ReplyFeedbackReport, signal: AbortSignal) {
    signal.throwIfAborted();
    if (sending || attempted.has(report.id)) throw new Error('此回覆已回報或正在回報。');
    const snapshot = structuredClone(report), safe = redactDiagnosticText;
    const time = formatEmailTime(new Date());
    const message = [`旅程：${safe(snapshot.tripName, 200)}`, `旅程 ID：${safe(snapshot.tripId, 80)}`,
      `模型：${safe(snapshot.model, 200)}`, `時間：${time}`, `頁面：${safe(snapshot.pageUrl, 500)}`,
      `回報編號：${safe(snapshot.id, 80)}`, '', '使用者問題：', safe(snapshot.question, 3000) || '未提供',
      '', '回應不佳的 AI 回覆：', safe(snapshot.answer, 6000)].join('\n');
    attempted.add(snapshot.id); sending = true;
    try {
      await sender.send({ title: 'AI回覆不佳回報', subject: 'AI回覆不佳回報', name: '回覆不佳回報', requester_name: '回覆不佳回報',
        trip_name: safe(snapshot.tripName, 200), time, message, reply_to: '', request_id: snapshot.id }, signal);
    } finally { sending = false; }
  } };
}
