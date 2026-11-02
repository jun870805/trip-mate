import type { ProviderFailure } from '../../ai/contracts.ts';
import { redactDiagnosticText } from '../../ai/core/diagnostics.ts';
import { createEmailSender, formatEmailTime } from './emailjs.ts';
import type { EmailConfig } from './emailjs.ts';

export interface AIErrorReport {
  failure: ProviderFailure;
  lastMessage: string;
  tripName: string;
  tripId: string;
  model: string;
  projectId: string;
  pageUrl: string;
}
/** Explicit button action only; recipient stays fixed in the EmailJS template. */
export function createAIErrorReporter(config: EmailConfig, fetcher: typeof fetch = fetch) {
  const sender = createEmailSender(config, fetcher);
  const attempted = new Set<string>();
  let sending = false;
  return { async send(report: AIErrorReport, signal: AbortSignal) {
    signal.throwIfAborted();
    if (sending || attempted.has(report.failure.id)) throw new Error('此錯誤已回報或正在回報。');
    const snapshot = structuredClone(report);
    const safe = (value: string, limit = 2000) => redactDiagnosticText(value, limit);
    const time = formatEmailTime(new Date());
    const operation = snapshot.failure.operation === 'streamGenerateContent' ? 'streamGenerateContent' : 'generateContent';
    const endpoint = `https://firebasevertexai.googleapis.com/v1beta/projects/${encodeURIComponent(snapshot.projectId)}/models/${encodeURIComponent(snapshot.model)}:${operation}`;
    const message = [
      `旅程：${safe(snapshot.tripName, 200)}`, `旅程 ID：${safe(snapshot.tripId, 80)}`, `時間：${time}`,
      `回報編號：${safe(snapshot.failure.id, 80)}`, `頁面：${safe(snapshot.pageUrl, 500)}`,
      '', '使用者最後一句話：', safe(snapshot.lastMessage, 6000) || '未提供', '', 'API 資訊：',
      '服務：Firebase AI Logic', `方法：POST`, `網址：${safe(endpoint, 700)}`, `模型：${safe(snapshot.model, 200)}`,
      `錯誤代碼：${safe(snapshot.failure.code, 80)}`, `錯誤訊息：${safe(snapshot.failure.message)}`,
    ].join('\n');
    attempted.add(snapshot.failure.id); sending = true;
    try {
      await sender.send({ title: safe(snapshot.tripName, 200), name: '錯誤回報', requester_name: '錯誤回報',
        trip_name: safe(snapshot.tripName, 200), time, subject: `[AI 錯誤回報] ${safe(snapshot.tripName, 200).replace(/[\r\n]+/g, ' ')}`,
        message, reply_to: '', request_id: snapshot.failure.id }, signal);
    } finally { sending = false; }
  } };
}
