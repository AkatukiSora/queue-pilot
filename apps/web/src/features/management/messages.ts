import { ApiError } from '../../api/api-error.ts';
import type { RegistrationPolicy } from './management-api.ts';
import { ManagementApiError } from './management-error.ts';

/** 登録 policy の理由 (eligible=false のとき)。登録 form は出さない。 */
export function registrationReasonMessage(
  reason: RegistrationPolicy['reason'],
): string {
  switch (reason) {
    case 'registration_disabled':
      return 'この環境では、利用者による新規登録は有効になっていません。';
    case 'registration_closed':
      return '新規登録は現在受け付けていません。既存のテナントに参加するには、そのテナントの管理者に招待を依頼してください。';
    case 'unsupported_identity':
      return 'GitHub アカウントで確認できる状態でログインしていないため、登録できません。';
    case 'not_allowlisted':
      return 'この GitHub アカウントは登録を許可されていません。';
    case 'identity_disabled':
      return 'このアカウントは無効化されているため登録できません。';
    case 'tenant_limit':
      return '作成できるテナントの上限に達しています。';
    case 'tenant_total_limit':
      return 'システム全体のテナント数の上限に達しています。管理者に連絡してください。';
    case 'reauth_required':
      return 'GitHub の組織への所属を確認できません。GitHub で再接続し、組織へのアクセスを許可してください。';
    case 'organization_unavailable':
      return 'GitHub の組織への所属を確認できませんでした。時間をおいて再試行してください。';
    case null:
      return '';
  }
}

const COMMON: Record<number, string> = {
  401: 'ログインの有効期限が切れました。再ログインしてください。',
  403: 'この操作を行う権限がありません。',
  404: '対象が見つかりません。存在しないか、アクセスできない可能性があります。',
};

const CODE_MESSAGES: Record<string, string> = {
  slug_conflict:
    'この slug はすでに使われています (無効化されたものを含みます)。別の slug を指定してください。',
  reserved_slug: 'この slug は予約されています。別の slug を指定してください。',
  invalid_slug:
    'slug は小文字の英数字とハイフンのみで、1〜63 文字にしてください。',
  invalid_display_name: '表示名が正しくありません。',
  tenant_limit: '作成できるテナントの上限に達しています。',
  identity_disabled: 'このアカウントは無効化されています。',
  last_admin:
    '最後の有効な管理者は、降格も無効化もできません。先に別の管理者を追加してください。',
  confirmation_mismatch: '確認用に入力した slug が一致しません。',
  invalid_role: '指定された権限が正しくありません。',
  invalid_subject: 'GitHub アカウントの指定が正しくありません。',
  member_not_found: '指定された GitHub ユーザーが見つかりません。',
  github_reauth_required:
    'GitHub の連携情報を確認できませんでした。GitHub で再ログインしてください。',
  upstream_unavailable:
    'GitHub に接続できませんでした。時間をおいて再試行してください。',
  http_error:
    'サービスを一時的に利用できません。時間をおいて再試行してください。',
  database_authority_required:
    'この環境では Web からの設定変更は有効になっていません。',
  invalid_config: '設定に誤りがあります。下の項目を確認してください。',
  rate_limited: '操作が多すぎます。少し待ってから再試行してください。',
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  structural_frozen:
    '整理券が 1 枚でも発行されたイベントは、タイムゾーン・番号の採番範囲・開始/終了・スケジュール・機材の増減を変更できません。',
  printer_in_use:
    '印刷待ち・印刷中のジョブがあるプリンターは無効化できません。印刷が完了するのを待ってください。',
  active_tickets:
    '有効な整理券 (待機中など) が残っているため無効化できません。先に整理券を完了または取消してください。',
  active_print_jobs:
    '印刷待ち・印刷中のジョブが残っているため無効化できません。印刷が完了するのを待ってください。',
};

const FIELD_LABELS: Record<string, string> = {
  timeZone: 'タイムゾーン',
  numberScope: '採番範囲',
  startsAt: '開始',
  endsAt: '終了',
  schedule: 'スケジュール',
  equipmentIds: '機材 ID',
};

export function fieldLabel(field: string) {
  return Object.hasOwn(FIELD_LABELS, field) ? FIELD_LABELS[field] : field;
}

export function isRevisionConflict(error: unknown) {
  return error instanceof ApiError && error.code === 'revision_conflict';
}

/** 管理 API の失敗を利用者向けの日本語にする。認可の判断はサーバーの status が正本。 */
export function managementErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '操作中にエラーが発生しました。画面を再読み込みしてから再試行してください。';
  }
  if (error.code === 'network_error') {
    return '通信に失敗しました。ネットワークを確認して再試行してください。';
  }
  if (error.code === 'revision_conflict') {
    return '他の操作で内容が更新されています。最新の状態を読み込み直してから、もう一度操作してください。入力中の内容は自動では上書きされません。';
  }
  if (error.code === 'change_constraint') {
    const detail = error instanceof ManagementApiError ? error.detail : {};
    const base =
      CONSTRAINT_MESSAGES[detail.constraint ?? ''] ??
      'この変更は現在の状態では実行できません。';
    const fields = detail.fields ?? [];
    return fields.length === 0
      ? base
      : `${base} (対象: ${fields.map(fieldLabel).join('、')})`;
  }
  if (error.status === 429) {
    const wait =
      error instanceof ManagementApiError ? error.retryAfterSeconds : undefined;
    return wait === undefined
      ? '操作が多すぎます。時間をおいて再試行してください。'
      : `操作が多すぎます。${wait} 秒ほど待ってから再試行してください。`;
  }
  if (error.code === 'github_rate_limited') {
    const wait =
      error instanceof ManagementApiError ? error.retryAfterSeconds : undefined;
    return wait === undefined
      ? 'GitHub の利用制限に達しました。時間をおいて再試行してください。'
      : `GitHub の利用制限に達しました。${wait} 秒ほど待ってから再試行してください。`;
  }
  if (
    error.status !== undefined &&
    error.status >= 500 &&
    !Object.hasOwn(CODE_MESSAGES, error.code)
  ) {
    return 'サービスを一時的に利用できません。時間をおいて再試行してください。';
  }
  return (
    (Object.hasOwn(CODE_MESSAGES, error.code)
      ? CODE_MESSAGES[error.code]
      : undefined) ??
    (error.status === undefined ? undefined : COMMON[error.status]) ??
    '操作に失敗しました。最新の状態を確認してください。'
  );
}
