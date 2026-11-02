import { getAI, getGenerativeModel, GoogleAIBackend, ThinkingLevel } from '@firebase/ai';
import { initializeApp, getApps } from '@firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from '@firebase/app-check';
import type { FirebaseOptions } from '@firebase/app';
import type { Provider } from '../contracts.ts';
import { createFirebaseProvider } from './firebase.ts';

export interface FirebaseProviderConfig {
  firebase: FirebaseOptions;
  /** Configured supported function-calling + PDF/image-capable model, never hardcoded. */
  model: string;
  appCheckSiteKey: string;
  appName?: string;
}
const initializedApps = new WeakMap<object, string>();

/** Lazy and explicit: no environment access, initialization, or network calls on import. */
export async function initializeFirebaseProvider(config: FirebaseProviderConfig): Promise<Provider> {
  if (!config.firebase.apiKey?.trim() || !config.firebase.projectId?.trim() || !config.firebase.appId?.trim() ||
    !config.model.trim() || !config.appCheckSiteKey.trim()) throw new Error('AI 設定不完整。');
  const name = config.appName || 'portable-ai';
  const existing = getApps().find(app => app.name === name);
  if (existing && ['apiKey', 'projectId', 'appId'].some(key => existing.options[key as keyof FirebaseOptions] !== config.firebase[key as keyof FirebaseOptions]))
    throw new Error('相同 Firebase App 名稱已使用其他設定。');
  const app = existing || initializeApp(config.firebase, name);
  const siteKey = initializedApps.get(app);
  if (siteKey && siteKey !== config.appCheckSiteKey) throw new Error('App Check 設定已變更。');
  if (!siteKey) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    initializedApps.set(app, config.appCheckSiteKey);
  }
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: config.model,
    generationConfig: {
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return createFirebaseProvider(model);
}
