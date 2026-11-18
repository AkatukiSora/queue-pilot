import { ApiError } from '../../api/api-error.ts';

/** 管理 API が失敗応答に付ける追加情報 (変更制約・設定の検証結果)。 */
export type ManagementErrorDetail = {
  constraint?: string;
  fields?: string[];
  issues?: { path: string; message: string }[];
};

type ManagementFailure = {
  error: { code: string; message: string } & ManagementErrorDetail;
};

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

/** assertApiOk と同じ 401 の扱いに、管理 API 固有の詳細を保ったまま失敗を投げる。 */
export function assertManagementOk(
  response: Response,
  error: ManagementFailure | undefined,
): void {
  if (response.status === 401) {
    throw new ApiError(
      'unauthorized',
      error?.error.message ?? 'Authentication is required.',
      401,
    );
  }
  if (error === undefined) return;
  const { code, message, constraint, fields, issues } = error.error;
  const retryAfter = Number(response.headers.get('Retry-After'));
  throw new ManagementApiError(
    code,
    message,
    response.status,
    { constraint, fields, issues },
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}
