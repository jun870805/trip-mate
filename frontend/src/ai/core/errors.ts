import type { ProviderFailureDetails } from '../contracts.ts';
import { redactDiagnosticText } from './diagnostics.ts';

export class ProviderRequestError extends Error {
  readonly details?: ProviderFailureDetails;
  constructor(message = 'AI 請求失敗，請重新確認後再試。', details?: ProviderFailureDetails) {
    super(message); this.name = 'ProviderRequestError';
    this.details = details ? { code: redactDiagnosticText(details.code, 80), message: redactDiagnosticText(details.message),
      ...(details.operation ? { operation: details.operation } : {}) } : undefined;
  }
}
/** Provider adapters normalize HTTP failures and carry only sanitized diagnostics. */
export class ProviderRateLimitError extends ProviderRequestError {
  constructor(details?: ProviderFailureDetails) {
    super('超過用量，請更換語言模型，或稍後再試。', details);
    this.name='ProviderRateLimitError';
  }
}

/** A 404 can indicate an unavailable model, access issue or missing service configuration. */
export class ProviderModelUnavailableError extends ProviderRequestError {
  constructor(details?: ProviderFailureDetails) {
    super('此模型目前無法使用，請更換語言模型或聯絡導遊。', details);
    this.name='ProviderModelUnavailableError';
  }
}
