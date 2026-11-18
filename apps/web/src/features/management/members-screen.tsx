import { type FormEvent, useState } from 'react';
import { Badge } from '../../components/ui/badge.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent } from '../../components/ui/card.tsx';
import { tenantManagePath } from './manage-home.tsx';
import {
  type ManagedMember,
  type ManagedMembers,
  useMemberMutation,
  useMembers,
  useResolveMember,
} from './management-api.ts';
import {
  ErrorNotice,
  Field,
  inputClass,
  Loading,
  ManagementShell,
  ScopeDenied,
  TextInput,
} from './ui.tsx';

type Role = ManagedMember['role'];
const ROLE_LABEL: Record<Role, string> = { admin: '管理者', staff: 'スタッフ' };

function RoleSelect({
  value,
  onChange,
  label,
}: {
  value: Role;
  onChange: (role: Role) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className={`${inputClass} w-auto`}
      value={value}
      onChange={(event) => onChange(event.target.value as Role)}
    >
      <option value="staff">{ROLE_LABEL.staff}</option>
      <option value="admin">{ROLE_LABEL.admin}</option>
    </select>
  );
}

export function MembersScreen({ tenantSlug }: { tenantSlug: string }) {
  const members = useMembers({ tenantSlug });
  const [reloads, setReloads] = useState(0);
  // 競合後は、利用者が「最新を読み込む」を押すまで入力中の内容を保つ。
  const reload = () =>
    void members.refetch().then(() => setReloads((count) => count + 1));
  return (
    <ManagementShell
      title="メンバー管理"
      crumbs={[
        { href: tenantManagePath(tenantSlug), label: tenantSlug },
        { href: `${tenantManagePath(tenantSlug)}/members`, label: 'メンバー' },
      ]}
    >
      {members.isPending && <Loading />}
      {members.isError && <ScopeDenied error={members.error} />}
      {members.data !== undefined && (
        <MemberPanels
          key={reloads}
          tenantSlug={tenantSlug}
          members={members.data}
          reload={reload}
        />
      )}
    </ManagementShell>
  );
}

function MemberPanels({
  tenantSlug,
  members,
  reload,
}: {
  tenantSlug: string;
  members: ManagedMembers;
  reload: () => void;
}) {
  const mutation = useMemberMutation({ tenantSlug });
  const activeAdmins = members.members.filter(
    (member) => member.role === 'admin' && !member.disabled,
  ).length;
  return (
    <>
      <ErrorNotice error={mutation.error} onReload={reload} />
      {mutation.isSuccess && <p role="status">変更しました。</p>}
      <Card>
        <CardContent className="grid gap-3 p-5">
          <h2 className="text-xl font-bold">現在のメンバー</h2>
          {activeAdmins <= 1 && (
            <p className="text-sm text-muted-foreground">
              有効な管理者は 1
              人だけです。最後の管理者の降格・無効化はサーバーが拒否します。先に別の管理者を追加してください。
            </p>
          )}
          <ul className="grid gap-2">
            {members.members.map((member) => (
              <MemberRow
                key={`${member.issuer}:${member.subject}`}
                member={member}
                pending={mutation.isPending}
                onUpsert={(role) =>
                  mutation.mutate({
                    type: 'upsert',
                    expectedRevision: members.revision,
                    subject: member.subject,
                    role,
                  })
                }
                onDisable={() =>
                  mutation.mutate({
                    type: 'disable',
                    expectedRevision: members.revision,
                    subject: member.subject,
                  })
                }
              />
            ))}
          </ul>
        </CardContent>
      </Card>
      <AddMember
        tenantSlug={tenantSlug}
        pending={mutation.isPending}
        onAdd={(subject, role) =>
          mutation.mutate({
            type: 'upsert',
            expectedRevision: members.revision,
            subject,
            role,
          })
        }
      />
    </>
  );
}

function MemberRow({
  member,
  pending,
  onUpsert,
  onDisable,
}: {
  member: ManagedMember;
  pending: boolean;
  onUpsert: (role: Role) => void;
  onDisable: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-md border p-3"
      data-testid={`member-${member.subject}`}
    >
      <span className="grid">
        <span>
          GitHub ID <code>{member.subject}</code>
          {member.self && <Badge className="ml-2">あなた</Badge>}
          {member.disabled && (
            <Badge className="ml-2" variant="outline">
              無効
            </Badge>
          )}
        </span>
      </span>
      <RoleSelect
        label={`GitHub ID ${member.subject} の権限`}
        value={role}
        onChange={setRole}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || (role === member.role && !member.disabled)}
        onClick={() => onUpsert(role)}
      >
        {member.disabled ? '有効にして保存' : '権限を保存'}
      </Button>
      {!member.disabled && (
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={onDisable}
        >
          無効化
        </Button>
      )}
    </li>
  );
}

function AddMember({
  tenantSlug,
  pending,
  onAdd,
}: {
  tenantSlug: string;
  pending: boolean;
  onAdd: (subject: string, role: Role) => void;
}) {
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const resolve = useResolveMember({ tenantSlug });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    resolve.mutate(login.trim());
  };
  return (
    <Card>
      <CardContent className="grid gap-3 p-5">
        <h2 className="text-xl font-bold">メンバーを追加</h2>
        <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
          <Field label="GitHub のユーザー名">
            <TextInput
              value={login}
              onChange={(event) => {
                setLogin(event.target.value);
                resolve.reset();
              }}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>
          <Button type="submit" variant="outline" disabled={resolve.isPending}>
            ユーザーを確認
          </Button>
        </form>
        <ErrorNotice error={resolve.error} />
        {resolve.data !== undefined && (
          <div className="grid gap-3 rounded-lg border p-4" role="status">
            <p>
              <strong>{resolve.data.displayName}</strong> (@{resolve.data.login}
              ) / GitHub ID <code>{resolve.data.subject}</code>
            </p>
            <p className="text-sm text-muted-foreground">
              このアカウントで間違いなければ、権限を選んで追加してください。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <RoleSelect
                label="追加する権限"
                value={role}
                onChange={setRole}
              />
              <Button
                disabled={pending}
                onClick={() => onAdd(resolve.data.subject, role)}
              >
                {ROLE_LABEL[role]}として追加
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
