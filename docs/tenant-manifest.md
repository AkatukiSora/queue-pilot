# Tenant manifest template

The tenant manifest is a single JSON document that defines tenants, their members, and their events. `scripts/tenant-config.ts` validates it and applies it to the database. This page is the reference for writing one. Runnable fictional samples are in `deploy/examples/`.

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

| Field                             | Rule                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                   | Must be `1`.                                                                                                                                                          |
| `tenants[].id`, `events[].id`     | UUIDs, unique across the manifest. Once applied, never change them.                                                                                                   |
| `slug`                            | Lowercase letters, digits, and hyphens, at most 63 characters. Unique per tenant for events and across tenants for tenants. An applied tenant slug cannot be renamed. |
| `members[].issuer`                | Identity provider URL. GitHub is `https://github.com`.                                                                                                                |
| `members[].subject`               | The provider's immutable account identifier. For GitHub, use the numeric account ID, not the login name, display name, or email.                                      |
| `members[].role`                  | `admin` can manage tickets and agent credentials. `staff` can operate tickets only.                                                                                   |
| `members[].disabled`              | `true` keeps the row but blocks access. Removing or disabling a member revokes that member's sessions.                                                                |
| `startsAt`, `endsAt`              | ISO 8601 date-times with an offset.                                                                                                                                   |
| `numberScope`                     | `daily` restarts ticket numbers each date. `event` numbers across the whole event.                                                                                    |
| `equipment[].id`, `printers[].id` | Lowercase letters, digits, and hyphens. Unique within the event.                                                                                                      |
| `schedule[]`                      | One entry per date. `firstStart` and `lastStart` are `HH:MM`. The interval, experience, and turnover values are minutes.                                              |
| `defaultPrinterId`                | Must match one entry in `printers`.                                                                                                                                   |

Unknown keys are rejected. The built-in default tenant and event (the fixed UUIDs ending in `...0001` and `...0002`) keep their legacy equipment IDs and labels. See `apps/api/src/domain/tenant-manifest.ts` for the complete validation rules.

## Check and apply

Validate without a database:

```sh
node scripts/tenant-config.ts validate --file path/to/manifest.json
```

Preview and apply with an owner or migration connection, never the API runtime login. See `docs/runbook.md` for the exact environment and the preconditions.

```sh
node scripts/tenant-config.ts plan --file path/to/manifest.json
node scripts/tenant-config.ts apply --file path/to/manifest.json
```

The manifest is expected to change as events are added or retired. Edit it in the private repository or secret store, run `validate` and `plan`, review the reported creates, updates, and retirements, and then apply.
