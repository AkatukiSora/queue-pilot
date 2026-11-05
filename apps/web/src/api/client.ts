import createClient from 'openapi-fetch';
import { ApiError } from './api-error.ts';
import type { paths } from './schema.ts';

const CSRF_PATH = '/api/v3/csrf';
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

let csrfToken: string | null = null;
let csrfInFlight: Promise<string> | null = null;
const rejectedListeners = new Set<() => void>();

/** サーバーが cookie session を認めなかった (401) ときに呼ばれる。 */
export function onSessionRejected(listener: () => void) {
  rejectedListeners.add(listener);
  return () => {
    rejectedListeners.delete(listener);
  };
}

/** ログアウト/期限切れ時に CSRF token を破棄する。メモリ上にだけ保持する。 */
export function resetCsrfToken() {
  csrfToken = null;
}

function notifySessionRejected() {
  for (const listener of rejectedListeners) listener();
}

function loadCsrfToken(): Promise<string> {
  csrfInFlight ??= (async () => {
    const response = await globalThis.fetch(
      new URL(CSRF_PATH, window.location.origin).href,
      { credentials: 'same-origin', cache: 'no-store' },
    );
    if (response.status === 401) {
      notifySessionRejected();
      throw new ApiError('unauthorized', 'Authentication is required.', 401);
    }
    const body: unknown = response.ok ? await response.json() : null;
    const token =
      typeof body === 'object' && body !== null && 'token' in body
        ? body.token
        : undefined;
    if (typeof token !== 'string' || token.length === 0) {
      throw new ApiError(
        'csrf_unavailable',
        'CSRF token could not be loaded.',
        response.status,
      );
    }
    csrfToken = token;
    return token;
  })().finally(() => {
    csrfInFlight = null;
  });
  return csrfInFlight;
}

function isScopedApi(request: Request) {
  return new URL(request.url).pathname.startsWith('/api/v3/');
}

function isCookieMutation(request: Request) {
  return (
    isScopedApi(request) &&
    !SAFE_METHODS.includes(request.method) &&
    !new URL(request.url).pathname.startsWith('/api/v3/agent/')
  );
}

async function isCsrfRejection(response: Response) {
  if (response.status !== 403) return false;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'object' &&
    body.error !== null &&
    'code' in body.error &&
    body.error.code === 'csrf_failed'
  );
}

/**
 * 共有 fetch 層。cookie mutation には X-CSRF-Token を付け (Origin はブラウザが
 * 同一 origin のリクエストに自動付与する)、CSRF 拒否は token を取り直して 1 回だけ
 * 再送する (拒否されたリクエストはサーバーで未処理)。401 は購読者へ通知する。
 */
async function apiFetch(request: Request): Promise<Response> {
  const mutation = isCookieMutation(request);
  const retry = mutation ? request.clone() : null;
  if (mutation) {
    request.headers.set('X-CSRF-Token', csrfToken ?? (await loadCsrfToken()));
  }

  let response = await globalThis.fetch(request);
  if (retry !== null && (await isCsrfRejection(response))) {
    csrfToken = null;
    retry.headers.set('X-CSRF-Token', await loadCsrfToken());
    response = await globalThis.fetch(retry);
  }
  if (response.status === 401 && isScopedApi(request)) notifySessionRejected();
  return response;
}

export const apiClient = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: 'same-origin',
  fetch: apiFetch,
});
