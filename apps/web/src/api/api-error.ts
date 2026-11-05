export type ApiFailure = { error: { code: string; message: string } };

/**
 * API の失敗応答。status は 401 (未認証/期限切れ)、403 (権限不足または
 * CSRF/Origin 拒否)、404 (他 tenant/event を含む存在しない対象) を区別する。
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function assertApiOk(
  response: Response,
  error: ApiFailure | undefined,
): void {
  if (response.status === 401) {
    throw new ApiError(
      'unauthorized',
      error?.error.message ?? 'Authentication is required.',
      401,
    );
  }
  if (error !== undefined) {
    throw new ApiError(error.error.code, error.error.message, response.status);
  }
}
