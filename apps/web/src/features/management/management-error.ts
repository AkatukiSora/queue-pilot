import { ApiError } from '../../api/api-error.ts';

/** 管理 API が失敗応答に付ける追加情報 (変更制約・設定の検証結果)。 */
export type ManagementErrorDetail = {
  constraint?: string;
  fields?: string[];
  issues?: { path: string; message: string }[];
};

const allowedConstraints = new Set([
  'structural_frozen',
  'printer_in_use',
  'active_tickets',
  'active_print_jobs',
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function retryAfterSeconds(response: Response): number | undefined {
  const seconds = (value: string | null): number | undefined => {
    if (value === null || value.trim() === '') return undefined;
    if (/^\d+$/.test(value)) {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
    }
    const date = Date.parse(value);
    const remaining = Math.ceil((date - Date.now()) / 1_000);
    return Number.isFinite(date) && remaining > 0 ? remaining : undefined;
  };
  return (
    seconds(response.headers.get('Retry-After')) ??
    seconds(response.headers.get('X-Retry-After'))
  );
}

function managementErrorDetail(
  payload: Record<string, unknown>,
): ManagementErrorDetail {
  const detail: ManagementErrorDetail = {};
  if (
    typeof payload.constraint === 'string' &&
    allowedConstraints.has(payload.constraint)
  ) {
    detail.constraint = payload.constraint;
  }
  if (
    Array.isArray(payload.fields) &&
    payload.fields.length <= 16 &&
    payload.fields.every(
      (field) =>
        typeof field === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(field),
    )
  ) {
    detail.fields = payload.fields;
  }
  if (
    Array.isArray(payload.issues) &&
    payload.issues.length <= 50 &&
    payload.issues.every((issue) => {
      const entry = record(issue);
      return (
        entry !== undefined &&
        typeof entry.path === 'string' &&
        entry.path.length <= 200 &&
        typeof entry.message === 'string' &&
        entry.message.length <= 500
      );
    })
  ) {
    detail.issues = payload.issues as { path: string; message: string }[];
  }
  return detail;
}

/** 共通の ApiError に、管理 API 固有の詳細と Retry-After (429, 秒) を足したもの。 */
export class ManagementApiError extends ApiError {
  constructor(
    code: string,
    message: string,
    status: number,
    readonly detail: ManagementErrorDetail,
    readonly retryAfterSeconds?: number,
  ) {
    super(code, message, status);
    this.name = 'ManagementApiError';
  }
}

/** HTTP status と不明な response body を境界で一度だけ検証する。 */
export function assertManagementOk(response: Response, error: unknown): void {
  if (response.status === 401) {
    throw new ApiError('unauthorized', 'Authentication is required.', 401);
  }
  if (response.status === 403) {
    throw new ApiError('forbidden', 'Access is denied.', 403);
  }
  if (response.status === 404) {
    throw new ApiError('not_found', 'The resource was not found.', 404);
  }
  if (response.ok && error === undefined) return;

  const outer = record(error);
  const payload =
    outer === undefined ? undefined : (record(outer.error) ?? outer);
  const rawCode =
    typeof payload?.code === 'string' ? payload.code : 'http_error';
  const code =
    response.status === 429
      ? 'rate_limited'
      : rawCode === 'ACCOUNT_NOT_FOUND' ||
          rawCode === 'FAILED_TO_GET_ACCESS_TOKEN'
        ? 'github_reauth_required'
        : rawCode;
  throw new ManagementApiError(
    code,
    'The management request failed.',
    response.status,
    payload === undefined ? {} : managementErrorDetail(payload),
    retryAfterSeconds(response),
  );
}
