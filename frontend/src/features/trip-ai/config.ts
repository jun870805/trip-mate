import { z } from 'zod';
import { readModelOptions } from './model-options.ts';
export { readModelOptions } from './model-options.ts';
import type { FirebaseProviderConfig } from '../../ai/providers/firebase-runtime.ts';

const publicConfig = z.strictObject({
  apiKey: z.string().trim().min(1), projectId: z.string().trim().min(1), appId: z.string().trim().min(1),
  authDomain: z.string().optional(), storageBucket: z.string().optional(), messagingSenderId: z.string().optional(),
  measurementId: z.string().optional(), databaseURL: z.string().optional(),
});
export function readFirebaseConfig(env: Record<string, string | undefined>, selectedModel?: string): FirebaseProviderConfig | null {
  if (env.VITE_AI_ENABLED !== 'true') return null;
  try {
    const firebase = publicConfig.parse(JSON.parse(env.VITE_AI_FIREBASE_CONFIG || ''));
    const choices=readModelOptions(env);
    const model=selectedModel ?? choices.defaultModel, appCheckSiteKey = env.VITE_AI_APP_CHECK_SITE_KEY?.trim();
    if (!choices.models.includes(model)) throw new Error();
    if (!model || !appCheckSiteKey) throw new Error();
    return { firebase, model, appCheckSiteKey };
  } catch { throw new Error('AI 設定不完整；請檢查公開 Firebase config、預設模型、模型清單與 App Check site key。'); }
}
