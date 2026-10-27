import {
  guideSessionKey,
  readStoredGuideSession,
  saveStoredGuideSession,
  clearStoredGuideSession,
  restoreStoredGuideSession,
} from "../data/guide-session";
import { useEffect, useRef, useState } from "react";
import {
  authorizeGuide,
  assertGuideSession,
  GUIDE_SCOPES,
  readGuideConfig,
} from "../data/guide-auth";
import type { GuideSession, TokenResponse } from "../data/guide-auth";

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: () => void;
      }): { requestAccessToken(options: { prompt: string }): void };
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
export const guideStorageKey = guideSessionKey(import.meta.env.BASE_URL);
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
export const guideConfig = readGuideConfig(import.meta.env);
let loadingGoogle: Promise<GoogleIdentity> | null = null;
function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (!loadingGoogle) {
    loadingGoogle = new Promise<GoogleIdentity>((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => fail(), 15000);
      function fail() {
        window.clearTimeout(timer);
        script.remove();
        loadingGoogle = null;
        reject(new Error("Google 登入載入失敗，請重試。"));
      }
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timer);
        if (window.google?.accounts?.oauth2) resolve(window.google);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return loadingGoogle;
}
export function useGuideAuth() {
  const [session, setSessionState] = useState<GuideSession | null>(null);
  const sessionRef = useRef<GuideSession | null>(null);
  function setSession(value: GuideSession | null) {
    sessionRef.current = value;
    setSessionState(value);
  }
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const sdk = useRef<GoogleIdentity | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    async function restore() {
      const storage = browserStorage();
      const saved =
        storage &&
        readStoredGuideSession(storage, guideStorageKey, guideConfig);
      const attempt = ++generation.current;
      setSession(null);
      setError("");
      if (!saved) {
        setBusy(false);
        return;
      }
      setBusy(true);
      const current = () => mounted.current && generation.current === attempt;
      try {
        const verified = await restoreStoredGuideSession(
          saved,
          guideConfig,
          (url, init) =>
            fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
        );
        assertGuideSession(verified, guideConfig);
        const latest = readStoredGuideSession(
          storage,
          guideStorageKey,
          guideConfig,
        );
        if (
          current() &&
          latest?.token === saved.token &&
          latest.expiresAt === saved.expiresAt
        )
          setSession(verified);
      } catch {
        if (current()) {
          clearStoredGuideSession(storage, guideStorageKey, saved.token);
          setError("無法恢復登入，請重新登入。");
        }
      } finally {
        if (current()) setBusy(false);
      }
    }
    const changed = (event: StorageEvent) => {
      const storage = browserStorage();
      if (
        !storage ||
        (event.storageArea && event.storageArea !== storage) ||
        (event.key !== guideStorageKey && event.key !== null)
      )
        return;
      void restore();
    };
    void restore();
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => {
    if (guideConfig.error) return;
    let cancelled = false;
    loadGoogle()
      .then((identity) => {
        if (!cancelled) {
          sdk.current = identity;
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  useEffect(() => {
    if (!session) return;
    const expire = () => {
      if (
        sessionRef.current?.token !== session.token ||
        sessionRef.current.expiresAt !== session.expiresAt
      )
        return;
      const storage = browserStorage();
      if (storage)
        clearStoredGuideSession(storage, guideStorageKey, session.token);
      setSession(null);
      setError("導遊登入已過期，請重新登入。");
    };
    const checkExpiry = () => {
      if (Date.now() >= session.expiresAt) expire();
    };
    const timer = window.setTimeout(
      expire,
      Math.max(0, session.expiresAt - Date.now()),
    );
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [session]);
  function logout() {
    generation.current++;
    const storage = browserStorage();
    if (storage) clearStoredGuideSession(storage, guideStorageKey);
    setSession(null);
    setBusy(false);
    setError("");
  }
  function invalidate() {
    logout();
    setError("導遊登入已過期，請重新登入。");
  }
  function login() {
    if (busy) return;
    if (guideConfig.error) {
      setError(guideConfig.error);
      return;
    }
    if (!ready || !sdk.current) {
      setError("Google 登入重新載入中，完成後請再點一次登入。");
      setRevision((n) => n + 1);
      return;
    }
    setError("");
    setBusy(true);
    const attempt = ++generation.current;
    const current = () => mounted.current && generation.current === attempt;
    try {
      const client = sdk.current.accounts.oauth2.initTokenClient({
        client_id: guideConfig.clientId,
        scope: GUIDE_SCOPES,
        callback: (response) => {
          if (!current()) return;
          authorizeGuide(response, guideConfig)
            .then((value) => {
              if (current()) {
                setSession(value);
                const storage = browserStorage();
                if (
                  !storage ||
                  !saveStoredGuideSession(
                    storage,
                    guideStorageKey,
                    value,
                    guideConfig,
                  )
                )
                  setError("已登入，但瀏覽器無法保存登入狀態。");
              }
            })
            .catch((cause) => {
              if (current())
                setError(
                  cause instanceof Error ? cause.message : "Google 登入失敗。",
                );
            })
            .finally(() => {
              if (current()) setBusy(false);
            });
        },
        error_callback: () => {
          if (current()) {
            setBusy(false);
            setError("Google 登入視窗已關閉或無法開啟，請重試。");
          }
        },
      });
      client.requestAccessToken({ prompt: "select_account" });
    } catch {
      if (current()) {
        setBusy(false);
        setError("無法開啟 Google 登入，請重試。");
      }
    }
  }
  return {
    session,
    busy,
    ready,
    error,
    login,
    logout,
    invalidate,
    clearError: () => setError(""),
  };
}
