# Tenant manifest template

The tenant manifest is a single JSON document that defines tenants, their members, and their events. `scripts/tenant-config.ts` validates it and applies it to the database. This page is the reference for writing one. Runnable fictional samples are in `deploy/examples/`.

## Authentication modes

| Mode                      | Manifest requirements                                                                                                                                                                                                                                                                                  | Runtime settings                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_MODE=oidc/shared`   | Define the tenants and events the service will expose. No fixed tenant or event UUID is required. Each event may use its own equipment, IANA time zone, and minute-based schedule.                                                                                                                     | The API resolves time zone, equipment, and schedule from the database event authorized for each request. It does not select a first event as a fallback. `APP_MANIFEST_PATH` is required. |
| `AUTH_MODE=legacy-single` | When a manifest is used, include tenant `00000000-0000-4000-8000-000000000001` and event `00000000-0000-4000-8000-000000000002`. The event must retain the legacy equipment IDs and labels, `Asia/Tokyo`, 30-minute intervals, 25-minute experiences, 5-minute turnover, and starts on `:00` or `:30`. | Preserves the legacy single-event API. Without a manifest, the existing `EVENT_END_AT` and `SLOT_SCHEDULE_JSON` configuration remains supported.                                          |

## Where the manifest lives

Keep the real manifest in your deployment's private secret store or private configuration repository. It names the people who administer the service. Never commit a real manifest, and use fictional identities in anything public.

The shipped Kubernetes example mounts the manifest into the API and the apply Job as a read-only file. The secret-store item key is `TENANT_MANIFEST_JSON`.

## Template

Replace every `<...>` marker. `validate` rejects markers in IDs, slugs, and date fields, but it accepts them in free-text fields such as titles, so check those by hand.

```json
{
  "schemaVersion": 1,
  "tenants": [
    {
      "id": "<TENANT_UUID>",
      "slug": "<tenant-slug>",
      "displayName": "<Tenant display name>",
      "members": [
        {
          "issuer": "https://github.com",
          "subject": "<ADMIN_GITHUB_NUMERIC_ID>",
          "role": "admin",
          "disabled": false
        }
      ],
      "events": [
        {
          "id": "<EVENT_UUID>",
          "slug": "<event-slug>",
          "title": "<Event title>",
          "timeZone": "Asia/Tokyo",
          "startsAt": "<2099-01-01T10:00:00+09:00>",
          "endsAt": "<2099-01-01T14:00:00+09:00>",
          "numberScope": "daily",
          "equipment": [
            { "id": "<equipment-id>", "label": "<Equipment label>" }
          ],
          "schedule": [
            {
              "date": "<2099-01-01>",
              "firstStart": "10:00",
              "lastStart": "13:30",
              "intervalMinutes": 30,
              "experienceMinutes": 25,
              "turnoverMinutes": 5
            }
          ],
          "copy": {
            "receiptTitle": "<Receipt title>",
            "arrivalGuidance": "<Guidance printed on the ticket>"
          },
          "defaultPrinterId": "<printer-id>",
          "printers": [{ "id": "<printer-id>", "label": "<Printer label>" }]
        }
      ]
    }
  ]
}
```

## Fields

| Field                             | Rule                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                   | Must be `1`.                                                                                                                                                                  |
| `tenants[].id`, `events[].id`     | UUIDs, unique across the manifest. Once applied, never change them. An event cannot move to another tenant.                                                                   |
| `slug`                            | Lowercase letters, digits, and hyphens, at most 63 characters. Unique per tenant for events and across tenants for tenants. Applied tenant and event slugs cannot be renamed. |
| `members[].issuer`                | Identity provider URL. GitHub is `https://github.com`.                                                                                                                        |
| `members[].subject`               | The provider's immutable account identifier. For GitHub, use the numeric account ID, not the login name, display name, or email.                                              |
| `members[].role`                  | `admin` can manage tickets and agent credentials. `staff` can operate tickets only.                                                                                           |
| `members[].disabled`              | `true` keeps the row but blocks access. Removing or disabling a member revokes that member's sessions.                                                                        |
| `startsAt`, `endsAt`              | ISO 8601 date-times with an offset.                                                                                                                                           |
| `numberScope`                     | `daily` restarts ticket numbers each date. `event` numbers across the whole event.                                                                                            |
| `equipment[].id`, `printers[].id` | Lowercase letters, digits, and hyphens. Unique within the event.                                                                                                              |
| `schedule[]`                      | One entry per date. `firstStart` and `lastStart` are `HH:MM`. The interval, experience, and turnover values are minutes.                                                      |
| `defaultPrinterId`                | Must match one entry in `printers`.                                                                                                                                           |

Unknown keys are rejected. Use new UUIDs when creating a tenant or event; do not copy the legacy fixed IDs and change only their slugs. After a scope has been applied, its IDs, slugs, and tenant membership are immutable. To use a different slug, create a new scope with new IDs and keep the old scope in the manifest or retire it.

`validate` checks manifest structure and schedule rules without reading the database. It does not verify whether a scope already exists, whether a slug is available, or whether existing ticket data permits a change.

## Legacy ticket baseline

When a manifest updates a legacy-expanded event that already has issued tickets, `plan` and `apply` require the authoritative legacy values `EVENT_END_AT`, `SLOT_SCHEDULE_JSON`, and `TICKET_NUMBER_SCOPE`. All three must be explicitly set. The configuration loader does not infer a missing value from a manifest; an absent or partial baseline fails closed when it is needed to protect issued tickets.

## Check and apply

Validate without a database:

```sh
node scripts/tenant-config.ts validate --file path/to/manifest.json
```

Preview and apply with an owner or migration connection, never the API runtime login. `plan` and `apply` inspect database state; `validate` does not. See `docs/runbook.md` for the exact environment and the preconditions.

```sh
node scripts/tenant-config.ts plan --file path/to/manifest.json
node scripts/tenant-config.ts apply --file path/to/manifest.json
```

The manifest is expected to change as events are added or retired. Edit it in the private repository or secret store, run `validate` and `plan`, review the reported creates, updates, and retirements, and then apply.

Retiring and deleting are different operations. Omitting a scope from the manifest retires its database row; it does not delete the row or its ticket history. A retired scope no longer serves its old QR links or agent operations. Keep an old scope in the manifest when its tickets must remain available. In this implementation stage, omitting the unused legacy seed retires it but does not remove it; the disabled row may continue to reserve its slug. Seed deletion and slug reuse are not part of this change.
