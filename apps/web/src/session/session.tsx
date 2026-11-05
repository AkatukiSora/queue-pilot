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
 * ブラウザ storage には何も保存しない。有効期限 (サーバー固定 15 分、refresh なし)
 * はサーバー応答の expiresAt をメモリで保持し、到達時にローカルで expired にする。
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

  // ローカル期限: timer が間引かれる background tab のため visibility でも再確認する。
  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const { expiresAt } = state;
    const check = () => {
      if (now() >= expiresAt) endSession('expired');
    };
    const timer = window.setTimeout(
      check,
      Math.min(Math.max(expiresAt - now(), 0), MAX_TIMER_MS),
    );
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [state, now, endSession]);

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
    const response = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerId,
        callbackURL: `${window.location.pathname}${window.location.search}`,
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
