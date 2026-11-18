export interface paths {
  '/api/healthz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/readyz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getReadiness'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/openapi.json': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOpenApiDocument'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/public/tickets/{token}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getPublicTicket'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyissueTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/reservations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['LegacygetAdminReservations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['LegacygetAdminTicket'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/release': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyreleaseTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/reschedule': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyrescheduleTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/restore': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyrestoreTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/undo-guidance': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyundoGuidanceTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/serve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyserveTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacycancelTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/admin/tickets/{id}/reprint': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyreprintTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/agent/print-jobs/claim': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyclaimPrintJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/agent/print-jobs/{id}/result': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['LegacyreportPrintResult'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/registration-policy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getTenantRegistrationPolicy'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/tenants/create': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createTenantRegistration'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/tenants': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List the tenants of the signed-in identity, including tenants without events */
    get: operations['listManagedTenants'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read the tenant settings */
    get: operations['getManagedTenant'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/update': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rename the tenant */
    post: operations['updateManagedTenant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/disable': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Disable the tenant after explicit slug confirmation */
    post: operations['disableManagedTenant'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/members': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List the members of the tenant */
    get: operations['listManagedMembers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/members/resolve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Resolve a GitHub login to its numeric account ID */
    post: operations['resolveManagedMember'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/members/upsert': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Add a member or change the role of a member */
    post: operations['upsertManagedMember'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/members/disable': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Disable a member while keeping at least one active administrator */
    post: operations['disableManagedMember'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List the active events with their configuration and change constraints */
    get: operations['listManagedEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/events/create': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create an event; the server issues its UUID */
    post: operations['createManagedEvent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/events/{eventSlug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read an event configuration and its change constraints */
    get: operations['getManagedEvent'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/events/{eventSlug}/update': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Update an event configuration under the change constraints */
    post: operations['updateManagedEvent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/events/{eventSlug}/disable': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Disable an event after explicit slug confirmation */
    post: operations['disableManagedEvent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/audit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Read the configuration audit log, newest first */
    get: operations['readManagedAudit'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/queue-pilot/t/{tenantSlug}/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Export the tenant configuration as version 1 JSON */
    get: operations['exportManagedTenant'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/csrf': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getCsrfToken'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listMemberEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAgents'];
    put?: never;
    post: operations['createAgent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents/{id}/revoke': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['revokeAgent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/agents/{id}/rotate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rotateAgent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['issueTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/reservations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminReservations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getAdminTicket'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/release': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['releaseTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/reschedule': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rescheduleTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/restore': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['restoreTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/undo-guidance': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['undoGuidanceTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/serve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['serveTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['cancelTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/t/{tenantSlug}/e/{eventSlug}/tickets/{id}/reprint': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['reprintTicket'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/agent/print-jobs/claim': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['claimPrintJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v3/agent/print-jobs/{id}/result': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['reportPrintResult'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: never;
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Process is running */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @enum {string} */
            status: 'ok';
          };
        };
      };
    };
  };
  getReadiness: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Database is ready */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @enum {string} */
            status: 'ready';
          };
        };
      };
      /** @description Service is not ready */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  getOpenApiDocument: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OpenAPI 3.1 document */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            [key: string]: unknown;
          };
        };
      };
    };
  };
  getPublicTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        token: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Public ticket status */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json':
            | {
                timeZone: string;
                number: number;
                latestChange: {
                  from:
                    | {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        equipment: string;
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      }
                    | {
                        /** @enum {string} */
                        kind: 'legacy';
                      };
                  to: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                  /** Format: date-time */
                  changedAt: string;
                  comment: string | null;
                } | null;
                /** Format: date-time */
                slotReleasedAt: string | null;
                /** @enum {string} */
                status: 'waiting' | 'served' | 'cancelled';
                reservation: {
                  /** @enum {string} */
                  kind: 'slot';
                  /** Format: date-time */
                  slotStartsAt: string;
                  equipment: string;
                  /** Format: date-time */
                  experienceEndsAt: string;
                  /** Format: date-time */
                  endsAt: string;
                };
              }
            | {
                timeZone: string;
                number: number;
                latestChange: {
                  from:
                    | {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        equipment: string;
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      }
                    | {
                        /** @enum {string} */
                        kind: 'legacy';
                      };
                  to: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                  /** Format: date-time */
                  changedAt: string;
                  comment: string | null;
                } | null;
                slotReleasedAt: null;
                /** @enum {string} */
                status: 'waiting' | 'called' | 'served' | 'cancelled';
                reservation: {
                  /** @enum {string} */
                  kind: 'legacy';
                };
              };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Public ticket has expired */
      410: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyissueTicket: {
    parameters: {
      query?: never;
      header: {
        'idempotency-key': string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** Format: date-time */
          slotStartsAt: string;
          /** @enum {string} */
          equipment: 'Quest 3' | 'Quest 3S' | 'Steam Frame' | 'Beyond2';
        };
      };
    };
    responses: {
      /** @description Idempotent replay */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Ticket issued */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Idempotency key was reused with a different request */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacygetAdminReservations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Configured reservation slots */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            slots: {
              /** Format: date-time */
              startsAt: string;
              /** @enum {string} */
              equipment: 'Quest 3' | 'Quest 3S' | 'Steam Frame' | 'Beyond2';
              /** Format: date-time */
              experienceEndsAt: string;
              /** Format: date-time */
              endsAt: string;
              bookable: boolean;
              ticket:
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            /** @enum {string} */
                            equipment:
                              | 'Quest 3'
                              | 'Quest 3S'
                              | 'Steam Frame'
                              | 'Beyond2';
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        /** @enum {string} */
                        equipment:
                          | 'Quest 3'
                          | 'Quest 3S'
                          | 'Steam Frame'
                          | 'Beyond2';
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    /** Format: date-time */
                    slotReleasedAt: string | null;
                    /** @enum {string} */
                    status: 'waiting' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                  }
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            /** @enum {string} */
                            equipment:
                              | 'Quest 3'
                              | 'Quest 3S'
                              | 'Steam Frame'
                              | 'Beyond2';
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        /** @enum {string} */
                        equipment:
                          | 'Quest 3'
                          | 'Quest 3S'
                          | 'Steam Frame'
                          | 'Beyond2';
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    slotReleasedAt: null;
                    /** @enum {string} */
                    status: 'waiting' | 'called' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'legacy';
                    };
                  }
                | null;
            }[];
            legacyTickets: (
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                }
            )[];
            unconfiguredTickets: (
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                }
            )[];
            releasedTickets: (
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                }
            )[];
            printNeedsAttention: {
              ticket:
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            /** @enum {string} */
                            equipment:
                              | 'Quest 3'
                              | 'Quest 3S'
                              | 'Steam Frame'
                              | 'Beyond2';
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        /** @enum {string} */
                        equipment:
                          | 'Quest 3'
                          | 'Quest 3S'
                          | 'Steam Frame'
                          | 'Beyond2';
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    /** Format: date-time */
                    slotReleasedAt: string | null;
                    /** @enum {string} */
                    status: 'waiting' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                  }
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            /** @enum {string} */
                            equipment:
                              | 'Quest 3'
                              | 'Quest 3S'
                              | 'Steam Frame'
                              | 'Beyond2';
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        /** @enum {string} */
                        equipment:
                          | 'Quest 3'
                          | 'Quest 3S'
                          | 'Steam Frame'
                          | 'Beyond2';
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    slotReleasedAt: null;
                    /** @enum {string} */
                    status: 'waiting' | 'called' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'legacy';
                    };
                  };
              job: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                ticketId: string;
                /** @enum {string} */
                status:
                  | 'queued'
                  | 'printing'
                  | 'printed'
                  | 'failed'
                  | 'unknown';
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                updatedAt: string;
                attempt: number;
                /** Format: uuid */
                reprintOf: string | null;
                detail: string | null;
                /** @enum {string|null} */
                outputKind: 'physical' | 'preview' | null;
              };
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacygetAdminTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Ticket and print history */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            printJobs: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'queued' | 'printing' | 'printed' | 'failed' | 'unknown';
              /** Format: date-time */
              createdAt: string;
              /** Format: date-time */
              updatedAt: string;
              attempt: number;
              /** Format: uuid */
              reprintOf: string | null;
              detail: string | null;
              /** @enum {string|null} */
              outputKind: 'physical' | 'preview' | null;
            }[];
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyreleaseTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': Record<string, never>;
      };
    };
    responses: {
      /** @description Reservation slot released */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyrescheduleTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          /** Format: date-time */
          slotStartsAt: string;
          /** @enum {string} */
          equipment: 'Quest 3' | 'Quest 3S' | 'Steam Frame' | 'Beyond2';
          /** @description Optional public message, trimmed and limited to 200 Unicode code points. */
          comment?: string;
        };
      };
    };
    responses: {
      /** @description Reservation changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            reprintRequired: boolean;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyrestoreTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json':
          | Record<string, never>
          | {
              /** Format: date-time */
              slotStartsAt: string;
              /** @enum {string} */
              equipment: 'Quest 3' | 'Quest 3S' | 'Steam Frame' | 'Beyond2';
              /** @description Optional public message, trimmed and limited to 200 Unicode code points. */
              comment?: string;
            };
      };
    };
    responses: {
      /** @description Ticket restored */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            reprintRequired: boolean;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyundoGuidanceTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json':
          | Record<string, never>
          | {
              /** Format: date-time */
              slotStartsAt: string;
              /** @enum {string} */
              equipment: 'Quest 3' | 'Quest 3S' | 'Steam Frame' | 'Beyond2';
              /** @description Optional public message, trimmed and limited to 200 Unicode code points. */
              comment?: string;
            };
      };
    };
    responses: {
      /** @description Ticket restored */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            reprintRequired: boolean;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyserveTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Ticket state changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacycancelTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          /** @enum {string} */
          reason: 'visitor' | 'staff' | 'no_show';
        };
      };
    };
    responses: {
      /** @description Ticket cancelled */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    /** @enum {string} */
                    equipment:
                      | 'Quest 3'
                      | 'Quest 3S'
                      | 'Steam Frame'
                      | 'Beyond2';
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          /** @enum {string} */
                          equipment:
                            | 'Quest 3'
                            | 'Quest 3S'
                            | 'Steam Frame'
                            | 'Beyond2';
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      /** @enum {string} */
                      equipment:
                        | 'Quest 3'
                        | 'Quest 3S'
                        | 'Steam Frame'
                        | 'Beyond2';
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyreprintTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Reprint job created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            job: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'queued' | 'printing' | 'printed' | 'failed' | 'unknown';
              /** Format: date-time */
              createdAt: string;
              /** Format: date-time */
              updatedAt: string;
              attempt: number;
              /** Format: uuid */
              reprintOf: string | null;
              detail: string | null;
              /** @enum {string|null} */
              outputKind: 'physical' | 'preview' | null;
            };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyclaimPrintJob: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description A print job was claimed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            job: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'printing';
              attempt: number;
              leaseToken: string;
              payload:
                | {
                    ticketNumber: number;
                    partySize: number;
                    publicToken: string;
                    /** Format: date-time */
                    issuedAt: string;
                  }
                | {
                    /** @enum {string} */
                    kind: 'slot';
                    ticketNumber: number;
                    /** Format: date-time */
                    slotStartsAt: string;
                    publicToken: string;
                    /** Format: date-time */
                    issuedAt: string;
                  }
                | {
                    /** @enum {number} */
                    schemaVersion: 2;
                    ticketNumber: number;
                    reservation:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          startsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    /** Format: date-time */
                    issuedAt: string;
                    timeZone: string;
                    /** Format: uri */
                    publicURL: string;
                    copy: {
                      receiptTitle: string;
                      arrivalGuidance: string;
                    };
                  };
            };
          };
        };
      };
      /** @description No queued print jobs */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  LegacyreportPrintResult: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          leaseToken: string;
          /** @enum {string} */
          outcome: 'printed' | 'failed' | 'unknown';
          detail?: string;
          /** @enum {string} */
          outputKind?: 'physical' | 'preview';
        };
      };
    };
    responses: {
      /** @description Print result recorded */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            job: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'queued' | 'printing' | 'printed' | 'failed' | 'unknown';
              /** Format: date-time */
              createdAt: string;
              /** Format: date-time */
              updatedAt: string;
              attempt: number;
              /** Format: uuid */
              reprintOf: string | null;
              detail: string | null;
              /** @enum {string|null} */
              outputKind: 'physical' | 'preview' | null;
            };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  getTenantRegistrationPolicy: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Self-service tenant registration policy for the signed-in identity */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            enabled: boolean;
            /** @enum {string} */
            policy: 'closed' | 'allowlist' | 'public';
            eligible: boolean;
            /** @enum {string|null} */
            reason:
              | 'registration_disabled'
              | 'registration_closed'
              | 'unsupported_identity'
              | 'not_allowlisted'
              | 'identity_disabled'
              | 'tenant_limit'
              | 'tenant_total_limit'
              | 'reauth_required'
              | 'organization_unavailable'
              | null;
            maxPerUser: number;
            remainingForUser: number;
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Registration service is unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  createTenantRegistration: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          slug: string;
          displayName: string;
        };
      };
    };
    responses: {
      /** @description Tenant and initial admin membership created atomically */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            tenant: {
              /** Format: uuid */
              id: string;
              slug: string;
              displayName: string;
              revision: number;
            };
            /** @enum {string} */
            role: 'admin';
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Insufficient permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Registration rate limit exceeded */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Registration service is unavailable */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  listManagedTenants: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Tenants with an active membership */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            tenants: {
              /** Format: uuid */
              id: string;
              slug: string;
              displayName: string;
              /** @enum {string} */
              role: 'admin' | 'staff';
              revision: number;
              events: {
                /** Format: uuid */
                id: string;
                slug: string;
                title: string | null;
              }[];
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  getManagedTenant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Tenant settings and change constraints */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            slug: string;
            displayName: string;
            revision: number;
            changeConstraints: {
              activeTicketCount: number;
              activeJobCount: number;
              canDisable: boolean;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  updateManagedTenant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          expectedRevision: number;
          displayName: string;
        };
      };
    };
    responses: {
      /** @description Updated tenant revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            revision: number;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  disableManagedTenant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          expectedRevision: number;
          confirmSlug: string;
        };
      };
    };
    responses: {
      /** @description Updated tenant revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            revision: number;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  listManagedMembers: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Members and the tenant revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            revision: number;
            members: {
              issuer: string;
              subject: string;
              /** @enum {string} */
              role: 'admin' | 'staff';
              disabled: boolean;
              self: boolean;
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  resolveManagedMember: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          githubLogin: string;
        };
      };
    };
    responses: {
      /** @description Resolved GitHub account */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @description Numeric GitHub account ID. */
            subject: string;
            login: string;
            displayName: string;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Rate limit exceeded */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  upsertManagedMember: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          expectedRevision: number;
          /** @description Numeric GitHub account ID. */
          subject: string;
          /** @enum {string} */
          role: 'admin' | 'staff';
        };
      };
    };
    responses: {
      /** @description Updated tenant revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            revision: number;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  disableManagedMember: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          expectedRevision: number;
          /** @description Numeric GitHub account ID. */
          subject: string;
        };
      };
    };
    responses: {
      /** @description Updated tenant revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            revision: number;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  listManagedEvents: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Events of the tenant */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            events: {
              /** Format: uuid */
              id: string;
              slug: string;
              config: {
                [key: string]: unknown;
              };
              revision: string;
              changeConstraints: {
                ticketCount: number;
                structuralFrozen: boolean;
                frozenFields: string[];
                activeTicketCount: number;
                activeJobCount: number;
                canDisable: boolean;
                printersInUse: string[];
              };
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  createManagedEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          slug: string;
          config: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      /** @description Created event identity and revision */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            slug: string;
            revision: string;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  getManagedEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Event configuration, revision, and change constraints */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            slug: string;
            config: {
              [key: string]: unknown;
            };
            revision: string;
            changeConstraints: {
              ticketCount: number;
              structuralFrozen: boolean;
              frozenFields: string[];
              activeTicketCount: number;
              activeJobCount: number;
              canDisable: boolean;
              printersInUse: string[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  updateManagedEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          expectedRevision: string;
          config: {
            [key: string]: unknown;
          };
        };
      };
    };
    responses: {
      /** @description Updated event revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            slug: string;
            revision: string;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  disableManagedEvent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          expectedRevision: string;
          confirmSlug: string;
        };
      };
    };
    responses: {
      /** @description Event revision */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            slug: string;
            revision: string;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Revision conflict or change constraint */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description GitHub is unavailable, or web configuration changes are not enabled */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  readManagedAudit: {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
      };
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description A page of audit entries */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            entries: {
              /** Format: uuid */
              id: string;
              occurredAt: string;
              action: string;
              /** @enum {string} */
              resourceType: 'tenant' | 'member' | 'event';
              resourceId: string;
              /** Format: uuid */
              eventId: string | null;
              /** @enum {string} */
              actorKind: 'operator' | 'user';
              /** Format: uuid */
              actorUserId: string | null;
              origin: string;
              revisionBefore: number | null;
              revisionAfter: number | null;
              before: {
                [key: string]: unknown;
              } | null;
              after: {
                [key: string]: unknown;
              } | null;
            }[];
            nextCursor: string | null;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  exportManagedTenant: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Configuration export without credentials, tickets, or jobs */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @enum {number} */
            configurationExportVersion: 1;
            tenant: {
              /** Format: uuid */
              id: string;
              slug: string;
              displayName: string;
              disabled: boolean;
            };
            members: {
              issuer: string;
              subject: string;
              /** @enum {string} */
              role: 'admin' | 'staff';
              disabled: boolean;
            }[];
            events: {
              /** Format: uuid */
              id: string;
              slug: string;
              config: {
                [key: string]: unknown;
              };
              configRevision: string;
              disabled: boolean;
              equipment: {
                id: string;
                label: string;
                sortOrder: number;
                disabled: boolean;
              }[];
              printers: {
                /** Format: uuid */
                id: string;
                slug: string;
                label: string;
                kind: string;
                disabled: boolean;
              }[];
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description The member is not an administrator of the tenant */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
      /** @description Resource not found or not visible to the signed-in identity */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
              constraint?: string;
              fields?: string[];
              issues?: {
                path: string;
                message: string;
              }[];
            };
          };
        };
      };
    };
  };
  getCsrfToken: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description CSRF token */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            token: string;
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  listMemberEvents: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Events available to the member */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            events: {
              /** Format: uuid */
              tenantId: string;
              tenantSlug: string;
              tenantName: string;
              /** @enum {string} */
              role: 'admin' | 'staff';
              /** Format: uuid */
              eventId: string;
              eventSlug: string;
              eventTitle: string;
              timeZone: string;
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  listAgents: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Registered agents */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            agents: {
              /** Format: uuid */
              id: string;
              printerId: string;
              /** Format: date-time */
              expiresAt: string;
              /** Format: date-time */
              revokedAt: string | null;
              /** Format: date-time */
              lastSeenAt: string | null;
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Insufficient permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  createAgent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          printerId: string;
          /** Format: date-time */
          expiresAt?: string;
        };
      };
    };
    responses: {
      /** @description Agent token created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            token: string;
            /** Format: date-time */
            expiresAt: string;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Insufficient permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  revokeAgent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': Record<string, never>;
      };
    };
    responses: {
      /** @description Agent revoked */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** @enum {boolean} */
            revoked: true;
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Insufficient permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  rotateAgent: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': Record<string, never>;
      };
    };
    responses: {
      /** @description Agent token rotated */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            /** Format: uuid */
            id: string;
            token: string;
            /** Format: date-time */
            expiresAt: string;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Insufficient permission */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  issueTicket: {
    parameters: {
      query?: never;
      header: {
        'idempotency-key': string;
      };
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          /** Format: date-time */
          slotStartsAt: string;
          equipment: string;
        };
      };
    };
    responses: {
      /** @description Idempotent replay */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Ticket issued */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Idempotency key was reused with a different request */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  getAdminReservations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Configured reservation slots */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            timeZone: string;
            slots: {
              /** Format: date-time */
              startsAt: string;
              equipment: string;
              /** Format: date-time */
              experienceEndsAt: string;
              /** Format: date-time */
              endsAt: string;
              bookable: boolean;
              ticket:
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            equipment: string;
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        equipment: string;
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    /** Format: date-time */
                    slotReleasedAt: string | null;
                    /** @enum {string} */
                    status: 'waiting' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                  }
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            equipment: string;
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        equipment: string;
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    slotReleasedAt: null;
                    /** @enum {string} */
                    status: 'waiting' | 'called' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'legacy';
                    };
                  }
                | null;
            }[];
            legacyTickets: (
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                }
            )[];
            unconfiguredTickets: (
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                }
            )[];
            releasedTickets: (
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                }
            )[];
            printNeedsAttention: {
              ticket:
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            equipment: string;
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        equipment: string;
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    /** Format: date-time */
                    slotReleasedAt: string | null;
                    /** @enum {string} */
                    status: 'waiting' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                  }
                | {
                    /** Format: uuid */
                    id: string;
                    counterKey: string;
                    number: number;
                    /** @enum {string|null} */
                    cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                    /** Format: date-time */
                    issuedAt: string;
                    /** Format: date-time */
                    updatedAt: string;
                    latestChange: {
                      from:
                        | {
                            /** @enum {string} */
                            kind: 'slot';
                            /** Format: date-time */
                            slotStartsAt: string;
                            equipment: string;
                            /** Format: date-time */
                            experienceEndsAt: string;
                            /** Format: date-time */
                            endsAt: string;
                          }
                        | {
                            /** @enum {string} */
                            kind: 'legacy';
                          };
                      to: {
                        /** @enum {string} */
                        kind: 'slot';
                        /** Format: date-time */
                        slotStartsAt: string;
                        equipment: string;
                        /** Format: date-time */
                        experienceEndsAt: string;
                        /** Format: date-time */
                        endsAt: string;
                      };
                      /** Format: date-time */
                      changedAt: string;
                      comment: string | null;
                    } | null;
                    slotReleasedAt: null;
                    /** @enum {string} */
                    status: 'waiting' | 'called' | 'served' | 'cancelled';
                    reservation: {
                      /** @enum {string} */
                      kind: 'legacy';
                    };
                  };
              job: {
                /** Format: uuid */
                id: string;
                /** Format: uuid */
                ticketId: string;
                /** @enum {string} */
                status:
                  | 'queued'
                  | 'printing'
                  | 'printed'
                  | 'failed'
                  | 'unknown';
                /** Format: date-time */
                createdAt: string;
                /** Format: date-time */
                updatedAt: string;
                attempt: number;
                /** Format: uuid */
                reprintOf: string | null;
                detail: string | null;
                /** @enum {string|null} */
                outputKind: 'physical' | 'preview' | null;
              };
            }[];
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  getAdminTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Ticket and print history */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            printJobs: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'queued' | 'printing' | 'printed' | 'failed' | 'unknown';
              /** Format: date-time */
              createdAt: string;
              /** Format: date-time */
              updatedAt: string;
              attempt: number;
              /** Format: uuid */
              reprintOf: string | null;
              detail: string | null;
              /** @enum {string|null} */
              outputKind: 'physical' | 'preview' | null;
            }[];
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  releaseTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': Record<string, never>;
      };
    };
    responses: {
      /** @description Reservation slot released */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  rescheduleTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          /** Format: date-time */
          slotStartsAt: string;
          equipment: string;
          /** @description Optional public message, trimmed and limited to 200 Unicode code points. */
          comment?: string;
        };
      };
    };
    responses: {
      /** @description Reservation changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            reprintRequired: boolean;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  restoreTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json':
          | Record<string, never>
          | {
              /** Format: date-time */
              slotStartsAt: string;
              equipment: string;
              /** @description Optional public message, trimmed and limited to 200 Unicode code points. */
              comment?: string;
            };
      };
    };
    responses: {
      /** @description Ticket restored */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            reprintRequired: boolean;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  undoGuidanceTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json':
          | Record<string, never>
          | {
              /** Format: date-time */
              slotStartsAt: string;
              equipment: string;
              /** @description Optional public message, trimmed and limited to 200 Unicode code points. */
              comment?: string;
            };
      };
    };
    responses: {
      /** @description Ticket restored */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
            reprintRequired: boolean;
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  serveTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Ticket state changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  cancelTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          /** @enum {string} */
          reason: 'visitor' | 'staff' | 'no_show';
        };
      };
    };
    responses: {
      /** @description Ticket cancelled */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            ticket:
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  /** Format: date-time */
                  slotReleasedAt: string | null;
                  /** @enum {string} */
                  status: 'waiting' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'slot';
                    /** Format: date-time */
                    slotStartsAt: string;
                    equipment: string;
                    /** Format: date-time */
                    experienceEndsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                  };
                }
              | {
                  /** Format: uuid */
                  id: string;
                  counterKey: string;
                  number: number;
                  /** @enum {string|null} */
                  cancelReason: 'visitor' | 'staff' | 'no_show' | null;
                  /** Format: date-time */
                  issuedAt: string;
                  /** Format: date-time */
                  updatedAt: string;
                  latestChange: {
                    from:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          slotStartsAt: string;
                          equipment: string;
                          /** Format: date-time */
                          experienceEndsAt: string;
                          /** Format: date-time */
                          endsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    to: {
                      /** @enum {string} */
                      kind: 'slot';
                      /** Format: date-time */
                      slotStartsAt: string;
                      equipment: string;
                      /** Format: date-time */
                      experienceEndsAt: string;
                      /** Format: date-time */
                      endsAt: string;
                    };
                    /** Format: date-time */
                    changedAt: string;
                    comment: string | null;
                  } | null;
                  slotReleasedAt: null;
                  /** @enum {string} */
                  status: 'waiting' | 'called' | 'served' | 'cancelled';
                  reservation: {
                    /** @enum {string} */
                    kind: 'legacy';
                  };
                };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  reprintTicket: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        tenantSlug: string;
        eventSlug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Reprint job created */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            job: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'queued' | 'printing' | 'printed' | 'failed' | 'unknown';
              /** Format: date-time */
              createdAt: string;
              /** Format: date-time */
              updatedAt: string;
              attempt: number;
              /** Format: uuid */
              reprintOf: string | null;
              detail: string | null;
              /** @enum {string|null} */
              outputKind: 'physical' | 'preview' | null;
            };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  claimPrintJob: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          acceptedPayloadVersions: (1 | 2)[];
        };
      };
    };
    responses: {
      /** @description A print job was claimed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            job: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'printing';
              attempt: number;
              leaseToken: string;
              payload:
                | {
                    ticketNumber: number;
                    partySize: number;
                    publicToken: string;
                    /** Format: date-time */
                    issuedAt: string;
                  }
                | {
                    /** @enum {string} */
                    kind: 'slot';
                    ticketNumber: number;
                    /** Format: date-time */
                    slotStartsAt: string;
                    publicToken: string;
                    /** Format: date-time */
                    issuedAt: string;
                  }
                | {
                    /** @enum {number} */
                    schemaVersion: 2;
                    ticketNumber: number;
                    reservation:
                      | {
                          /** @enum {string} */
                          kind: 'slot';
                          /** Format: date-time */
                          startsAt: string;
                        }
                      | {
                          /** @enum {string} */
                          kind: 'legacy';
                        };
                    /** Format: date-time */
                    issuedAt: string;
                    timeZone: string;
                    /** Format: uri */
                    publicURL: string;
                    copy: {
                      receiptTitle: string;
                      arrivalGuidance: string;
                    };
                  };
            };
          };
        };
      };
      /** @description No queued print jobs */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Unexpected server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
  reportPrintResult: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': {
          leaseToken: string;
          /** @enum {string} */
          outcome: 'printed' | 'failed' | 'unknown';
          detail?: string;
          /** @enum {string} */
          outputKind?: 'physical' | 'preview';
        };
      };
    };
    responses: {
      /** @description Print result recorded */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            job: {
              /** Format: uuid */
              id: string;
              /** Format: uuid */
              ticketId: string;
              /** @enum {string} */
              status: 'queued' | 'printing' | 'printed' | 'failed' | 'unknown';
              /** Format: date-time */
              createdAt: string;
              /** Format: date-time */
              updatedAt: string;
              attempt: number;
              /** Format: uuid */
              reprintOf: string | null;
              detail: string | null;
              /** @enum {string|null} */
              outputKind: 'physical' | 'preview' | null;
            };
          };
        };
      };
      /** @description Invalid request */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Authentication failed */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Resource not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
      /** @description Conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': {
            error: {
              code: string;
              message: string;
            };
          };
        };
      };
    };
  };
}
