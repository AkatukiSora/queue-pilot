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
