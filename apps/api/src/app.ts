import type { Clock, TokenGenerator, UnitOfWork } from './application/ports.ts';
import type { AppConfig } from './config.ts';
import { createHttpApp } from './presentation/http/routes.ts';

export type AppDependencies = {
  config: AppConfig;
  unitOfWork: UnitOfWork;
  clock: Clock;
  tokens: TokenGenerator;
  checkReadiness: () => Promise<boolean>;
  staticRoot?: string;
};

export function createApp(dependencies: AppDependencies) {
  return createHttpApp({
    unitOfWork: dependencies.unitOfWork,
    clock: dependencies.clock,
    tokens: dependencies.tokens,
    adminToken: dependencies.config.adminToken,
    agentToken: dependencies.config.agentToken,
    eventEndAt: dependencies.config.eventEndAt,
    numberScope: dependencies.config.numberScope,
    slotSchedule: dependencies.config.slotSchedule,
    checkReadiness: dependencies.checkReadiness,
    ...(dependencies.staticRoot === undefined
      ? {}
      : { staticRoot: dependencies.staticRoot }),
  });
}
