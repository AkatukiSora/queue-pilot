import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError } from '../../api/api-error.ts';
import { apiClient } from '../../api/client.ts';
import type { paths } from '../../api/schema.ts';
import { MEMBER_EVENTS_QUERY_KEY } from '../scope/scope-api.ts';
import { type EventConfig, parseEventConfig } from './event-config.ts';
import { assertManagementOk } from './management-error.ts';

const PREFIX = '/api/auth/queue-pilot';
type Json<
  P extends keyof paths,
  M extends 'get' | 'post',
  S extends number,
> = paths[P][M] extends { responses: Record<S, { content: infer C }> }
  ? C extends { 'application/json': infer B }
    ? B
    : never
  : never;

export type RegistrationPolicy = Json<
  `${typeof PREFIX}/registration-policy`,
  'get',
  200
>;
export type ManagedTenantSummary = Json<
  `${typeof PREFIX}/tenants`,
  'get',
  200
>['tenants'][number];
export type ManagedTenantDetail = Json<
  `${typeof PREFIX}/t/{tenantSlug}`,
  'get',
  200
>;
export type ManagedMembers = Json<
  `${typeof PREFIX}/t/{tenantSlug}/members`,
  'get',
  200
>;
export type ManagedMember = ManagedMembers['members'][number];
export type ResolvedMember = Json<
  `${typeof PREFIX}/t/{tenantSlug}/members/resolve`,
  'post',
  200
>;
export type AuditEntry = Json<
  `${typeof PREFIX}/t/{tenantSlug}/audit`,
  'get',
  200
>['entries'][number];
export type ChangeConstraints = Json<
  `${typeof PREFIX}/t/{tenantSlug}/events/{eventSlug}`,
  'get',
  200
>['changeConstraints'];

/** parseEventConfig 済みの event。config は不透明な API 値を境界で型付けしたもの。 */
export type ManagedEvent = {
  id: string;
  slug: string;
  revision: string;
  config: EventConfig;
  changeConstraints: ChangeConstraints;
};

export type TenantScope = { tenantSlug: string };
export type EventScope = TenantScope & { eventSlug: string };

const key = (...parts: string[]) => ['management', ...parts] as const;

/** 取得失敗の本文が空 (data も error も無い) ときの共通失敗。 */
function missing(response: Response, name: string): never {
  throw new ApiError(
    'ambiguous_response',
    `${name} response was unreadable.`,
    response.status,
  );
}

export function useRegistrationPolicy() {
  return useQuery({
    queryKey: key('registration-policy'),
    // 許可状態は他画面の操作 (登録・設定変更) で変わるため古い値を再利用しない。
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/registration-policy`,
        { signal },
      );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Registration policy');
    },
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (body: { slug: string; displayName: string }) => {
      const { data, error, response } = await apiClient.POST(
        `${PREFIX}/tenants/create`,
        { body },
      );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Tenant registration');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key() }),
  });
}

export function useTenants() {
  return useQuery({
    queryKey: key('tenants'),
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/tenants`,
        { signal },
      );
      assertManagementOk(response, error);
      return (data ?? missing(response, 'Tenants')).tenants;
    },
  });
}

// 設定を編集する画面の query は、フォーカス復帰などで裏で再取得して入力中の
// 値を黙って差し替えないよう、利用者が明示的に再読み込みするまで固定する。
const pinned = {
  staleTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
} as const;

export function useTenant({ tenantSlug }: TenantScope) {
  return useQuery({
    queryKey: key('tenant', tenantSlug),
    ...pinned,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/t/{tenantSlug}`,
        { params: { path: { tenantSlug } }, signal },
      );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Tenant');
    },
  });
}

export function useTenantMutation(scope: TenantScope) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (
      command:
        | { type: 'update'; expectedRevision: number; displayName: string }
        | { type: 'disable'; expectedRevision: number; confirmSlug: string },
    ) => {
      const params = { path: { tenantSlug: scope.tenantSlug } };
      const { data, error, response } =
        command.type === 'update'
          ? await apiClient.POST(`${PREFIX}/t/{tenantSlug}/update`, {
              params,
              body: {
                expectedRevision: command.expectedRevision,
                displayName: command.displayName,
              },
            })
          : await apiClient.POST(`${PREFIX}/t/{tenantSlug}/disable`, {
              params,
              body: {
                expectedRevision: command.expectedRevision,
                confirmSlug: command.confirmSlug,
              },
            });
      assertManagementOk(response, error);
      return data ?? missing(response, 'Tenant update');
    },
    onSuccess: (_data, command) =>
      command.type === 'disable'
        ? Promise.all([
            queryClient.invalidateQueries({
              queryKey: key(),
              refetchType: 'none',
            }),
            queryClient.invalidateQueries({
              queryKey: MEMBER_EVENTS_QUERY_KEY,
              refetchType: 'none',
            }),
          ])
        : queryClient.invalidateQueries({ queryKey: key() }),
  });
}

export function useMembers({ tenantSlug }: TenantScope) {
  return useQuery({
    queryKey: key('members', tenantSlug),
    ...pinned,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/t/{tenantSlug}/members`,
        { params: { path: { tenantSlug } }, signal },
      );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Members');
    },
  });
}

export function useResolveMember({ tenantSlug }: TenantScope) {
  return useMutation({
    retry: false,
    mutationFn: async (githubLogin: string) => {
      const { data, error, response } = await apiClient.POST(
        `${PREFIX}/t/{tenantSlug}/members/resolve`,
        { params: { path: { tenantSlug } }, body: { githubLogin } },
      );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Member lookup');
    },
  });
}

export type MemberCommand =
  | {
      type: 'upsert';
      expectedRevision: number;
      subject: string;
      role: 'admin' | 'staff';
    }
  | { type: 'disable'; expectedRevision: number; subject: string };

export function useMemberMutation({ tenantSlug }: TenantScope) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (command: MemberCommand) => {
      const params = { path: { tenantSlug } };
      const { data, error, response } =
        command.type === 'upsert'
          ? await apiClient.POST(`${PREFIX}/t/{tenantSlug}/members/upsert`, {
              params,
              body: {
                expectedRevision: command.expectedRevision,
                subject: command.subject,
                role: command.role,
              },
            })
          : await apiClient.POST(`${PREFIX}/t/{tenantSlug}/members/disable`, {
              params,
              body: {
                expectedRevision: command.expectedRevision,
                subject: command.subject,
              },
            });
      assertManagementOk(response, error);
      return data ?? missing(response, 'Member update');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key() }),
  });
}

export function useEvents({ tenantSlug }: TenantScope) {
  return useQuery({
    queryKey: key('events', tenantSlug),
    ...pinned,
    queryFn: async ({ signal }) => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/t/{tenantSlug}/events`,
        { params: { path: { tenantSlug } }, signal },
      );
      assertManagementOk(response, error);
      return (data ?? missing(response, 'Events')).events.map(
        (event): ManagedEvent => ({
          ...event,
          config: parseEventConfig(event.config),
        }),
      );
    },
  });
}

export function useEvent({ tenantSlug, eventSlug }: EventScope) {
  return useQuery({
    queryKey: key('event', tenantSlug, eventSlug),
    ...pinned,
    queryFn: async ({ signal }): Promise<ManagedEvent> => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/t/{tenantSlug}/events/{eventSlug}`,
        { params: { path: { tenantSlug, eventSlug } }, signal },
      );
      assertManagementOk(response, error);
      const event = data ?? missing(response, 'Event');
      return { ...event, config: parseEventConfig(event.config) };
    },
  });
}

export type EventCommand =
  | { type: 'create'; slug: string; config: EventConfig }
  | {
      type: 'update';
      eventSlug: string;
      expectedRevision: string;
      config: EventConfig;
    }
  | {
      type: 'disable';
      eventSlug: string;
      expectedRevision: string;
      confirmSlug: string;
    };

export function useEventMutation({ tenantSlug }: TenantScope) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (command: EventCommand) => {
      const path = { tenantSlug };
      if (command.type === 'create') {
        const { data, error, response } = await apiClient.POST(
          `${PREFIX}/t/{tenantSlug}/events/create`,
          {
            params: { path },
            body: { slug: command.slug, config: command.config },
          },
        );
        assertManagementOk(response, error);
        return data ?? missing(response, 'Event creation');
      }
      const params = { path: { ...path, eventSlug: command.eventSlug } };
      const { data, error, response } =
        command.type === 'update'
          ? await apiClient.POST(
              `${PREFIX}/t/{tenantSlug}/events/{eventSlug}/update`,
              {
                params,
                body: {
                  expectedRevision: command.expectedRevision,
                  config: command.config,
                },
              },
            )
          : await apiClient.POST(
              `${PREFIX}/t/{tenantSlug}/events/{eventSlug}/disable`,
              {
                params,
                body: {
                  expectedRevision: command.expectedRevision,
                  confirmSlug: command.confirmSlug,
                },
              },
            );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Event update');
    },
    onSuccess: (_data, command) =>
      command.type === 'disable'
        ? Promise.all([
            queryClient.invalidateQueries({
              queryKey: key(),
              refetchType: 'none',
            }),
            queryClient.invalidateQueries({
              queryKey: MEMBER_EVENTS_QUERY_KEY,
              refetchType: 'none',
            }),
          ])
        : queryClient.invalidateQueries({ queryKey: key() }),
  });
}

export function useAudit({ tenantSlug }: TenantScope) {
  return useInfiniteQuery({
    queryKey: key('audit', tenantSlug),
    ...pinned,
    queryFn: async ({ signal, pageParam }) => {
      const { data, error, response } = await apiClient.GET(
        `${PREFIX}/t/{tenantSlug}/audit`,
        {
          params: {
            path: { tenantSlug },
            query: { limit: 50, cursor: pageParam },
          },
          signal,
        },
      );
      assertManagementOk(response, error);
      return data ?? missing(response, 'Audit');
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** 設定 export (version 1 JSON)。認証情報・ticket・job は含まれない。 */
export async function fetchTenantExport(tenantSlug: string) {
  const { data, error, response } = await apiClient.GET(
    `${PREFIX}/t/{tenantSlug}/export`,
    { params: { path: { tenantSlug } } },
  );
  assertManagementOk(response, error);
  return data ?? missing(response, 'Export');
}
