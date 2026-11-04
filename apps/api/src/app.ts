import type {
  AgentCredentialAdministration,
  AuthenticationAdapter,
  AuthorizationRepository,
  RequestContextStorage,
} from './application/security-ports.ts';
import type { Clock, TokenGenerator, ScopedUnitOfWork } from './application/ports.ts';
import type { AppConfig } from './config.ts';
import { createRequestContextStorage } from './infrastructure/request-context.ts';
import { createHttpApp } from './presentation/http/routes.ts';

export type AppDependencies = {
  config: AppConfig;
  unitOfWork: ScopedUnitOfWork;
  clock: Clock;
  tokens: TokenGenerator;
  checkReadiness: () => Promise<boolean>;
  requestContext?: RequestContextStorage;
  authentication?: AuthenticationAdapter;
  authorization?: AuthorizationRepository;
  agentCredentials?: AgentCredentialAdministration;
  staticRoot?: string;
};

export function createApp(dependencies: AppDependencies) {
  const requestContext =
    dependencies.requestContext ?? createRequestContextStorage();
  return createHttpApp({
    unitOfWork: dependencies.unitOfWork,
    requestContext,
    authMode: dependencies.config.authMode,
    clock: dependencies.clock,
    tokens: dependencies.tokens,
    adminToken: dependencies.config.adminToken,
    agentToken: dependencies.config.agentToken,
    eventEndAt: dependencies.config.eventEndAt,
    numberScope: dependencies.config.numberScope,
    slotSchedule: dependencies.config.slotSchedule,
    authentication: dependencies.authentication,
    authorization: dependencies.authorization,
    agentCredentials: dependencies.agentCredentials,
    publicBaseURL: dependencies.config.sharedAuth?.baseURL,
    checkReadiness: dependencies.checkReadiness,
    ...(dependencies.staticRoot === undefined
      ? {}
      : { staticRoot: dependencies.staticRoot }),
  });
}
