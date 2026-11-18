import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onSessionRejected, resetCsrfToken } from '../api/client.ts';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; expiresAt: number }
  | { status: 'unauthenticated' }
  | { status: 'expired' }
  | { status: 'unavailable' };

export type SessionApi = {
  state: SessionState;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  reload: () => void;
};

const MAX_TIMER_MS = 2 ** 31 - 1;
const SESSION_REFRESH_MS = 300_000;

/** Better Auth の get-session 応答から有効期限 (epoch ms) を取り出す。 */
function parseExpiresAt(body: unknown): number | null {
  if (typeof body !== 'object' || body === null || !('session' in body)) {
    return null;
  }
  const { session } = body;
  if (typeof session !== 'object' || session === null) return null;
  if (!('expiresAt' in session)) return null;
  const expiresAt =
    typeof session.expiresAt === 'string' ||
    typeof session.expiresAt === 'number'
      ? Date.parse(String(session.expiresAt))
      : Number.NaN;
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

async function fetchSession(): Promise<number | null> {
  const response = await fetch('/api/auth/get-session', {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Session lookup failed.');
  return parseExpiresAt(await response.json());
}

const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession must be used inside SessionProvider.');
  }
  return session;
}

/**
 * Cookie session の状態を保持する。session token は HttpOnly cookie にだけあり、
 * ブラウザ storage には何も保存しない。有効期限はサーバー応答の expiresAt をメモリで保持し、
 * 5 分ごととタブ表示時に更新する。
 */
export function SessionProvider({
  children,
  providerId = 'github',
  now = Date.now,
  navigate = (url) => window.location.assign(url),
}: {
  children: ReactNode;
  providerId?: string;
  now?: () => number;
  navigate?: (url: string) => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);
  const stateRef = useRef(state);
  const refreshInFlight = useRef(false);
  stateRef.current = state;

  const endSession = useCallback(
    (next: 'expired' | 'unauthenticated') => {
      resetCsrfToken();
      queryClient.clear();
      setState({ status: next });
    },
    [queryClient],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadCount は再取得のトリガー。
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchSession().then(
      (expiresAt) => {
        if (cancelled) return;
        if (expiresAt === null || expiresAt <= now()) {
          setState({ status: 'unauthenticated' });
        } else {
          setState({ status: 'authenticated', expiresAt });
        }
      },
      () => {
        if (!cancelled) setState({ status: 'unavailable' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [now, reloadCount]);

  const authenticatedExpiresAt =
    state.status === 'authenticated' ? state.expiresAt : null;
  useEffect(() => {
    if (authenticatedExpiresAt === null) return;
    let cancelled = false;
    const refresh = () => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      void fetchSession()
        .then(
          (expiresAt) => {
            if (cancelled) return;
            if (expiresAt === null || expiresAt <= now()) {
              endSession('expired');
              return;
            }
            setState({ status: 'authenticated', expiresAt });
          },
          () => {
            // Keep the current session state; the next interval or visible-tab event retries.
          },
        )
        .finally(() => {
          refreshInFlight.current = false;
        });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const expiryTimer = window.setTimeout(
      refresh,
      Math.min(Math.max(authenticatedExpiresAt - now(), 0), MAX_TIMER_MS),
    );
    const interval = window.setInterval(refresh, SESSION_REFRESH_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(expiryTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [authenticatedExpiresAt, now, endSession]);

  // サーバーが 401 を返した (失効/無効化) 場合も同じ再ログイン導線へ。
  useEffect(
    () =>
      onSessionRejected(() => {
        if (stateRef.current.status === 'authenticated') endSession('expired');
      }),
    [endSession],
  );

  const login = useCallback(async () => {
    // Better Auth の genericOAuth provider は core の sign-in/social を使う。
    // 失敗時は同じ画面へ戻し、標準の `?error=` を表示できるようにする。
    // 前回の失敗 (error / error_description) を成功後の戻り先に引き継がない。
    const returnTo = new URLSearchParams(window.location.search);
    returnTo.delete('error');
    returnTo.delete('error_description');
    const query = returnTo.size === 0 ? '' : `?${returnTo}`;
    const response = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerId,
        callbackURL: `${window.location.pathname}${query}`,
        errorCallbackURL: `${window.location.pathname}${query}`,
      }),
    });
    const body: unknown = response.ok ? await response.json() : null;
    const url =
      typeof body === 'object' && body !== null && 'url' in body
        ? body.url
        : undefined;
    if (typeof url !== 'string') throw new Error('Login could not be started.');
    navigate(url);
  }, [providerId, navigate]);

  const logout = useCallback(async () => {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok && response.status !== 401) {
      throw new Error('Logout failed.');
    }
    endSession('unauthenticated');
  }, [endSession]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const value = useMemo(
    () => ({ state, login, logout, reload }),
    [state, login, logout, reload],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
