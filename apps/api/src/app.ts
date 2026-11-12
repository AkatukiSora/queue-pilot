import type {
  Clock,
  ScopedUnitOfWork,
  TokenGenerator,
} from './application/ports.ts';
import type {
  AgentCredentialAdministration,
  AuthenticationAdapter,
  AuthorizationRepository,
  RequestContextStorage,
} from './application/security-ports.ts';
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
  const common = {
    unitOfWork: dependencies.unitOfWork,
    requestContext,
    clock: dependencies.clock,
    tokens: dependencies.tokens,
    authentication: dependencies.authentication,
    authorization: dependencies.authorization,
    agentCredentials: dependencies.agentCredentials,
    checkReadiness: dependencies.checkReadiness,
    ...(dependencies.staticRoot === undefined
      ? {}
      : { staticRoot: dependencies.staticRoot }),
  };
  if (dependencies.config.authMode === 'legacy-single') {
    return createHttpApp({
      ...common,
      authMode: 'legacy-single',
      adminToken: dependencies.config.adminToken,
      agentToken: dependencies.config.agentToken,
      legacyEventSettings: dependencies.config.legacyEventSettings,
    });
  }
  return createHttpApp({
    ...common,
    authMode: 'oidc/shared',
    publicBaseURL: dependencies.config.sharedAuth.baseURL,
  });
}
