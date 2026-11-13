import type { BetterAuthPlugin } from 'better-auth';
import { createAccessControl } from 'better-auth/plugins/access';

const managementStatements = {
  tenant: ['read', 'write'],
  config: ['read', 'write'],
  event: ['read', 'write'],
  member: ['read', 'write'],
  printer: ['read', 'write'],
  agent: ['read', 'write'],
  audit: ['read'],
  export: ['read'],
  ticket: ['read', 'write'],
} as const;

export const managementAccessControl =
  createAccessControl(managementStatements);

// Static actions do not replace tenant membership checks or database RLS.
export const managementAdminRole = managementAccessControl.newRole({
  tenant: ['read', 'write'],
  config: ['read', 'write'],
  event: ['read', 'write'],
  member: ['read', 'write'],
  printer: ['read', 'write'],
  agent: ['read', 'write'],
  audit: ['read'],
  export: ['read'],
  ticket: ['read', 'write'],
});

export const managementStaffRole = managementAccessControl.newRole({
  ticket: ['read', 'write'],
});

type ManagementAuthPluginOptions = {
  endpoints?: NonNullable<BetterAuthPlugin['endpoints']>;
  rateLimit?: BetterAuthPlugin['rateLimit'];
};

export function createManagementAuthPlugin(
  options: ManagementAuthPluginOptions = {},
): BetterAuthPlugin {
  return {
    id: 'queue-pilot-management',
    ...(options.endpoints === undefined
      ? {}
      : { endpoints: options.endpoints }),
    ...(options.rateLimit === undefined
      ? {}
      : { rateLimit: options.rateLimit }),
  };
}
