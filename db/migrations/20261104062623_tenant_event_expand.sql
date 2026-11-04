-- Modify "print_jobs" table
ALTER TABLE "public"."print_jobs" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001', ADD COLUMN "event_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
-- Modify "ticket_counters" table
ALTER TABLE "public"."ticket_counters" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001', ADD COLUMN "event_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
-- Create "tenants" table
CREATE TABLE "public"."tenants" (
  "id" uuid NOT NULL,
  "slug" character varying(63) NOT NULL,
  "display_name" text NOT NULL,
  "disabled_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "tenants_slug_key" UNIQUE ("slug")
);
-- Create "events" table
CREATE TABLE "public"."events" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "slug" character varying(63) NOT NULL,
  "config" jsonb NOT NULL,
  "config_revision" text NOT NULL,
  "disabled_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "events_tenant_id_id_key" UNIQUE ("tenant_id", "id"),
  CONSTRAINT "events_tenant_id_slug_key" UNIQUE ("tenant_id", "slug"),
  CONSTRAINT "events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create "event_equipment" table
CREATE TABLE "public"."event_equipment" (
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "id" text NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL,
  "disabled_at" timestamptz NULL,
  PRIMARY KEY ("tenant_id", "event_id", "id"),
  CONSTRAINT "event_equipment_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "event_equipment_sort_order_nonnegative" CHECK (sort_order >= 0)
);
-- Modify "tickets" table
ALTER TABLE "public"."tickets" ADD COLUMN "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001', ADD COLUMN "event_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000002';
-- Create "public_ticket_locator" table
CREATE TABLE "public"."public_ticket_locator" (
  "token" character varying(22) NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  PRIMARY KEY ("token"),
  CONSTRAINT "public_ticket_locator_tenant_event_ticket_key" UNIQUE ("tenant_id", "event_id", "ticket_id"),
  CONSTRAINT "public_ticket_locator_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "public_ticket_locator_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Seed the fixed compatibility tenant/event before old application instances continue writing.
INSERT INTO "public"."tenants" ("id", "slug", "display_name")
VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'Default tenant');
INSERT INTO "public"."events" ("id", "tenant_id", "slug", "config", "config_revision")
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'default',
  '{"schemaVersion":1,"legacyExpand":true}'::jsonb,
  'legacy-expand-v1'
);
INSERT INTO "public"."event_equipment" ("tenant_id", "event_id", "id", "label", "sort_order")
VALUES
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'quest-3', 'Quest 3', 0),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'quest-3s', 'Quest 3S', 1),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'steam-frame', 'Steam Frame', 2),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'beyond2', 'Beyond2', 3);
UPDATE "public"."tickets"
SET "tenant_id" = '00000000-0000-4000-8000-000000000001',
    "event_id" = '00000000-0000-4000-8000-000000000002';
UPDATE "public"."ticket_counters"
SET "tenant_id" = '00000000-0000-4000-8000-000000000001',
    "event_id" = '00000000-0000-4000-8000-000000000002';
UPDATE "public"."print_jobs"
SET "tenant_id" = '00000000-0000-4000-8000-000000000001',
    "event_id" = '00000000-0000-4000-8000-000000000002';
INSERT INTO "public"."public_ticket_locator" ("token", "tenant_id", "event_id", "ticket_id")
SELECT "public_token", "tenant_id", "event_id", "id"
FROM "public"."tickets";
