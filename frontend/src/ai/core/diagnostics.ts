import type { ProviderFailureDetails } from '../contracts.ts';

/** Diagnostics are plain text, bounded, and never include request headers or SDK objects. */
export function redactDiagnosticText(value: string, limit = 2000): string {
  const clean = value.slice(0, 100000)
    .replace(/\b(?:authorization|x-firebase-appcheck|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|app[_ -]?check[_ -]?token|FIREBASE_APPCHECK_DEBUG_TOKEN|VITE_AI_APP_CHECK_DEBUG_TOKEN|client[_-]?secret|password|debug[_-]?token|token)["']?\s*[:=]\s*["']?(?:Bearer\s+)?[^\s,;"'}]+/gi, '[credential removed]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [removed]')
    .replace(/\bAIza[A-Za-z0-9_-]{15,}\b/g, '[API key removed]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token removed]')
    .replace(/https?:\/\/[^\s<>"']+/gi, value => {
      try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString(); }
      catch { return '[URL removed]'; }
    })
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return clean.length > limit ? `${clean.slice(0, limit - 7)}…[截斷]` : clean;
}

export function providerFailureDetails(error: unknown): ProviderFailureDetails {
  const value = error as { code?: unknown; status?: unknown; message?: unknown; customErrorData?: { status?: unknown }; error?: { code?: unknown; message?: unknown } } | null;
  const status = value?.customErrorData?.status ?? value?.status ?? value?.error?.code;
  const code = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? String(status) : typeof value?.code === 'string' ? redactDiagnosticText(value.code, 80) : 'unknown';
  const message = value?.error?.message ?? value?.message;
  return { code, message: typeof message === 'string' && message.trim() ? redactDiagnosticText(message) : 'API 未提供錯誤訊息。' };
}
