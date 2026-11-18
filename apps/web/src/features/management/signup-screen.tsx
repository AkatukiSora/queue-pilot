import { type FormEvent, useState } from 'react';
import { ApiError } from '../../api/api-error.ts';
import { Button } from '../../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card.tsx';
import { useSession } from '../../session/session.tsx';
import { useCreateTenant, useRegistrationPolicy } from './management-api.ts';
import { registrationReasonMessage } from './messages.ts';
import {
  ErrorNotice,
  Field,
  Loading,
  ManagementShell,
  TextInput,
} from './ui.tsx';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function SignupScreen() {
  const policy = useRegistrationPolicy();
  const { login } = useSession();
  const [loginFailed, setLoginFailed] = useState(false);
  // 作成後は policy が再取得されて eligible=false になるため、成功表示は
  // policy ではなく mutation の状態で出す。
  const create = useCreateTenant();

  if (create.isSuccess) {
    return (
      <ManagementShell title="テナントを登録">
        <CreatedCard tenant={create.data.tenant} />
      </ManagementShell>
    );
  }

  // policy API は、GitHub 組織の再認可が必要な場合などを 200 ではなく 503 +
  // code で返す。どちらも「登録できない理由」として同じ画面に出す。
  const failure = policy.error instanceof ApiError ? policy.error : null;
  const failureReason =
    failure?.code === 'reauth_required' ||
    failure?.code === 'organization_unavailable'
      ? failure.code
      : null;
  const reason =
    policy.data?.enabled === true && !policy.data.eligible
      ? policy.data.reason
      : failureReason;

  return (
    <ManagementShell title="テナントを登録">
      {policy.isPending && <Loading />}
      {policy.isError && failureReason === null && (
        <div className="grid gap-2" role="alert">
          <p>
            {failure?.status === 401
              ? 'この環境の認証方式、またはログイン状態では登録できません。GitHub でログインし直してください。'
              : '登録の可否を取得できませんでした。時間をおいて再試行してください。'}
          </p>
          <Button
            className="w-fit"
            variant="outline"
            onClick={() => void policy.refetch()}
          >
            再試行
          </Button>
        </div>
      )}
      {policy.data !== undefined && !policy.data.enabled && (
        <Card>
          <CardContent className="grid gap-2 p-6">
            <h2 className="text-lg font-bold">新規登録は受け付けていません</h2>
            <p className="text-sm">
              {registrationReasonMessage(
                policy.data.reason ?? 'registration_disabled',
              )}
            </p>
            <a className="underline" href="/manage">
              自分のテナントを開く
            </a>
          </CardContent>
        </Card>
      )}
      {reason !== null && (
        <Card>
          <CardContent className="grid gap-3 p-6">
            <h2 className="text-lg font-bold">登録できません</h2>
            <p className="text-sm">{registrationReasonMessage(reason)}</p>
            {reason === 'reauth_required' && (
              <>
                {loginFailed && (
                  <p role="alert" className="text-sm text-destructive">
                    GitHub への再接続を開始できませんでした。
                  </p>
                )}
                <Button
                  className="w-fit"
                  onClick={() => {
                    setLoginFailed(false);
                    login().catch(() => setLoginFailed(true));
                  }}
                >
                  GitHubで再接続
                </Button>
              </>
            )}
            <a className="underline" href="/manage">
              自分のテナントを開く
            </a>
          </CardContent>
        </Card>
      )}
      {policy.data?.enabled === true && policy.data.eligible && (
        <RegistrationForm
          remaining={policy.data.remainingForUser}
          create={create}
        />
      )}
    </ManagementShell>
  );
}

function CreatedCard({
  tenant,
}: {
  tenant: { slug: string; displayName: string };
}) {
  const base = `/t/${encodeURIComponent(tenant.slug)}/manage`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>テナントを作成しました</CardTitle>
        <CardDescription>
          「{tenant.displayName}」({tenant.slug})
          の管理者として登録されました。イベントはまだありません。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <a
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          href={`${base}/events/new`}
        >
          最初のイベントを作成
        </a>
        <a className="px-2 py-2.5 text-sm underline" href={base}>
          テナントの管理へ
        </a>
      </CardContent>
    </Card>
  );
}

function RegistrationForm({
  remaining,
  create,
}: {
  remaining: number;
  create: ReturnType<typeof useCreateTenant>;
}) {
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ slug, displayName });
  };
  const slugLooksInvalid = slug !== '' && !SLUG_PATTERN.test(slug);
  return (
    <Card>
      <CardHeader>
        <CardTitle>新しいテナント</CardTitle>
        <CardDescription>
          あと {remaining}{' '}
          件のテナントを作成できます。作成した人がそのテナントの管理者になります。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <Field
            label="slug (URL に使う識別子)"
            hint="小文字の英数字とハイフンのみ、1〜63 文字。作成後は変更できません。大文字や空白は自動では直しません。"
          >
            <TextInput
              name="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={slugLooksInvalid}
            />
          </Field>
          {slugLooksInvalid && (
            <p className="text-sm text-destructive">
              この slug
              は使えない形式です。小文字の英数字とハイフンだけにしてください。
            </p>
          )}
          <Field label="表示名">
            <TextInput
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </Field>
          <ErrorNotice error={create.error} />
          <Button
            type="submit"
            className="w-fit"
            disabled={create.isPending || slug === '' || displayName === ''}
          >
            {create.isPending ? '作成しています…' : 'テナントを作成'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
