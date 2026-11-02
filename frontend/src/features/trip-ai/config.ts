import { z } from 'zod';
import type { FirebaseProviderConfig } from '../../ai/providers/firebase-runtime.ts';

const publicConfig = z.strictObject({
  apiKey: z.string().trim().min(1), projectId: z.string().trim().min(1), appId: z.string().trim().min(1),
  authDomain: z.string().optional(), storageBucket: z.string().optional(), messagingSenderId: z.string().optional(),
  measurementId: z.string().optional(), databaseURL: z.string().optional(),
});
export function readFirebaseConfig(env: Record<string, string | undefined>): FirebaseProviderConfig | null {
  if (env.VITE_AI_ENABLED !== 'true') return null;
  try {
    const firebase = publicConfig.parse(JSON.parse(env.VITE_AI_FIREBASE_CONFIG || ''));
    const model = env.VITE_AI_MODEL?.trim(), appCheckSiteKey = env.VITE_AI_APP_CHECK_SITE_KEY?.trim();
    if (!model || !appCheckSiteKey) throw new Error();
    return { firebase, model, appCheckSiteKey };
  } catch { throw new Error('AI 設定不完整；請檢查公開 Firebase config、模型名稱與 App Check site key。'); }
}
