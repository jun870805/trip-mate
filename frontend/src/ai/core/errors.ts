/** Provider adapters normalize HTTP quota/rate failures without leaking SDK details. */
export class ProviderRateLimitError extends Error {
  constructor() {
    super('超過用量，請更換語言模型，或稍後再試。');
    this.name='ProviderRateLimitError';
  }
}

/** A 404 can indicate an unavailable model, access issue or missing service configuration. */
export class ProviderModelUnavailableError extends Error {
  constructor() {
    super('此模型目前無法使用，請更換語言模型或聯絡導遊。');
    this.name='ProviderModelUnavailableError';
  }
}
