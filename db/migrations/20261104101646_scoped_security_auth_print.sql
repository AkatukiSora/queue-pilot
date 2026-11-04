-- Create "printers" table
CREATE TABLE "public"."printers" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "slug" character varying(63) NOT NULL,
  "label" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'tm-t88v-usb',
  "disabled_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "printers_tenant_event_id_key" UNIQUE ("tenant_id", "event_id", "id"),
  CONSTRAINT "printers_tenant_event_slug_key" UNIQUE ("tenant_id", "event_id", "slug"),
  CONSTRAINT "printers_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create "agents" table
CREATE TABLE "public"."agents" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "printer_id" uuid NOT NULL,
  "disabled_at" timestamptz NULL,
  "last_seen_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "agents_tenant_event_id_printer_key" UNIQUE ("tenant_id", "event_id", "id", "printer_id"),
  CONSTRAINT "agents_printer_fkey" FOREIGN KEY ("tenant_id", "event_id", "printer_id") REFERENCES "public"."printers" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create "agent_credentials" table
CREATE TABLE "public"."agent_credentials" (
  "id" uuid NOT NULL,
  "secret_hash" character varying(64) NOT NULL,
  "agent_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "printer_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "agent_credentials_secret_hash_key" UNIQUE ("secret_hash"),
  CONSTRAINT "agent_credentials_agent_scope_fkey" FOREIGN KEY ("tenant_id", "event_id", "agent_id", "printer_id") REFERENCES "public"."agents" ("tenant_id", "event_id", "id", "printer_id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "agent_credentials_expiry_after_creation" CHECK (expires_at > created_at),
  CONSTRAINT "agent_credentials_hash_format" CHECK ((secret_hash)::text ~ '^[a-f0-9]{64}$'::text)
);
-- Seed the single-event compatibility printer and agent for existing jobs.
INSERT INTO "public"."printers" ("id", "tenant_id", "event_id", "slug", "label", "kind")
VALUES (
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'legacy-printer',
  'Legacy printer',
  'tm-t88v-usb'
);
INSERT INTO "public"."agents" ("id", "tenant_id", "event_id", "printer_id")
VALUES (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004'
);
-- Drop index "tickets_slot_equipment_key" from table: "tickets"
DROP INDEX "public"."tickets_slot_equipment_key";
-- Modify "tickets" table
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_default_scope_expand", DROP CONSTRAINT "tickets_equipment_valid", DROP CONSTRAINT "tickets_previous_equipment_valid", DROP CONSTRAINT "tickets_counter_key_number_key", DROP CONSTRAINT "tickets_idempotency_key_key", DROP CONSTRAINT "tickets_previous_slot_alignment", ADD CONSTRAINT "tickets_previous_slot_alignment" CHECK ((previous_slot_starts_at IS NULL) OR (EXTRACT(second FROM previous_slot_starts_at) = (0)::numeric)), DROP CONSTRAINT "tickets_slot_alignment", ADD CONSTRAINT "tickets_slot_alignment" CHECK ((slot_starts_at IS NULL) OR (EXTRACT(second FROM slot_starts_at) = (0)::numeric)), DROP CONSTRAINT "tickets_slot_change_consistent",  DROP CONSTRAINT "tickets_slot_pair_consistent",  ALTER COLUMN "tenant_id" DROP DEFAULT, ALTER COLUMN "event_id" DROP DEFAULT, ADD COLUMN "equipment_id" text NULL, ADD COLUMN "previous_equipment_id" text NULL, ADD CONSTRAINT "tickets_counter_key_number_key" UNIQUE ("tenant_id", "event_id", "counter_key", "number"), ADD CONSTRAINT "tickets_idempotency_key_key" UNIQUE ("tenant_id", "event_id", "idempotency_key"), ADD CONSTRAINT "tickets_tenant_event_id_key" UNIQUE ("tenant_id", "event_id", "id"), ADD CONSTRAINT "tickets_equipment_fkey" FOREIGN KEY ("tenant_id", "event_id", "equipment_id") REFERENCES "public"."event_equipment" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "tickets_previous_equipment_fkey" FOREIGN KEY ("tenant_id", "event_id", "previous_equipment_id") REFERENCES "public"."event_equipment" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "tickets_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "tickets_slot_equipment_key" to table: "tickets"
CREATE UNIQUE INDEX "tickets_slot_equipment_key" ON "public"."tickets" ("tenant_id", "event_id", "slot_starts_at", "equipment_id") WHERE (slot_released_at IS NULL);
UPDATE "public"."tickets"
SET "equipment_id" = CASE "equipment"
      WHEN 'Quest 3' THEN 'quest-3'
      WHEN 'Quest 3S' THEN 'quest-3s'
      WHEN 'Steam Frame' THEN 'steam-frame'
      WHEN 'Beyond2' THEN 'beyond2'
      ELSE NULL
    END,
    "previous_equipment_id" = CASE "previous_equipment"
      WHEN 'Quest 3' THEN 'quest-3'
      WHEN 'Quest 3S' THEN 'quest-3s'
      WHEN 'Steam Frame' THEN 'steam-frame'
      WHEN 'Beyond2' THEN 'beyond2'
      ELSE NULL
    END;
ALTER TABLE "public"."tickets"
  ADD CONSTRAINT "tickets_slot_pair_consistent"
    CHECK ((slot_starts_at IS NULL) = (equipment_id IS NULL)),
  ADD CONSTRAINT "tickets_slot_change_consistent"
    CHECK (
      (slot_changed_at IS NULL AND previous_slot_starts_at IS NULL AND previous_equipment_id IS NULL AND slot_change_comment IS NULL)
      OR (slot_changed_at IS NOT NULL AND slot_starts_at IS NOT NULL AND ((previous_slot_starts_at IS NULL AND previous_equipment_id IS NULL) OR (previous_slot_starts_at IS NOT NULL AND previous_equipment_id IS NOT NULL)))
    );
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public"."public_ticket_locator" AS locator
    JOIN "public"."tickets" AS ticket ON ticket.public_token = locator.token
    WHERE locator.ticket_id <> ticket.id
       OR locator.tenant_id <> ticket.tenant_id
       OR locator.event_id <> ticket.event_id
  ) THEN
    RAISE EXCEPTION 'Public ticket locator conflicts with issued tickets.';
  END IF;
END
$$;
INSERT INTO "public"."public_ticket_locator" ("token", "tenant_id", "event_id", "ticket_id")
SELECT "public_token", "tenant_id", "event_id", "id"
FROM "public"."tickets"
ON CONFLICT ("token") DO NOTHING;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "public"."tickets" AS ticket
    LEFT JOIN "public"."public_ticket_locator" AS locator
      ON locator.token = ticket.public_token
     AND locator.tenant_id = ticket.tenant_id
     AND locator.event_id = ticket.event_id
     AND locator.ticket_id = ticket.id
    WHERE locator.token IS NULL
  ) THEN
    RAISE EXCEPTION 'Public ticket locator backfill is incomplete.';
  END IF;
END
$$;
-- Drop index "print_jobs_queued_pick_idx" from table: "print_jobs"
DROP INDEX "public"."print_jobs_queued_pick_idx";
-- Drop index "print_jobs_ticket_created_idx" from table: "print_jobs"
DROP INDEX "public"."print_jobs_ticket_created_idx";
-- Modify "print_jobs" table
ALTER TABLE "public"."print_jobs" DROP CONSTRAINT "print_jobs_default_scope_expand", DROP CONSTRAINT "print_jobs_reprint_of_fkey", DROP CONSTRAINT "print_jobs_ticket_id_fkey", DROP CONSTRAINT "print_jobs_lease_consistent",  ADD CONSTRAINT "print_jobs_payload_version_check" CHECK ((payload_version = ANY (ARRAY[1, 2])) AND (((payload_version = 1) AND ((payload ->> 'schemaVersion'::text) IS NULL)) OR ((payload_version = 2) AND ((payload ->> 'schemaVersion'::text) = '2'::text)))), ALTER COLUMN "tenant_id" DROP DEFAULT, ALTER COLUMN "event_id" DROP DEFAULT, ADD COLUMN "printer_id" uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000004'::uuid, ADD COLUMN "payload_version" smallint NOT NULL DEFAULT 1, ADD COLUMN "claimed_by_agent_id" uuid NULL, ADD CONSTRAINT "print_jobs_tenant_event_id_key" UNIQUE ("tenant_id", "event_id", "id"), ADD CONSTRAINT "print_jobs_reprint_of_fkey" FOREIGN KEY ("tenant_id", "event_id", "reprint_of") REFERENCES "public"."print_jobs" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "print_jobs_claimed_agent_fkey" FOREIGN KEY ("tenant_id", "event_id", "claimed_by_agent_id", "printer_id") REFERENCES "public"."agents" ("tenant_id", "event_id", "id", "printer_id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "print_jobs_printer_fkey" FOREIGN KEY ("tenant_id", "event_id", "printer_id") REFERENCES "public"."printers" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "print_jobs_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION, ADD CONSTRAINT "print_jobs_ticket_fkey" FOREIGN KEY ("tenant_id", "event_id", "ticket_id") REFERENCES "public"."tickets" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "print_jobs_queued_pick_idx" to table: "print_jobs"
CREATE INDEX "print_jobs_queued_pick_idx" ON "public"."print_jobs" ("tenant_id", "event_id", "printer_id", "payload_version", "created_at", "id") WHERE (status = 'queued'::text);
-- Create index "print_jobs_ticket_created_idx" to table: "print_jobs"
CREATE INDEX "print_jobs_ticket_created_idx" ON "public"."print_jobs" ("tenant_id", "event_id", "ticket_id", "created_at", "id");
UPDATE "public"."print_jobs"
SET "claimed_by_agent_id" = CASE
  WHEN "status" = 'printing' THEN '00000000-0000-4000-8000-000000000003'::uuid
  ELSE NULL
END;
ALTER TABLE "public"."print_jobs"
  ADD CONSTRAINT "print_jobs_lease_consistent"
    CHECK (
      (status = 'printing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND claimed_by_agent_id IS NOT NULL)
      OR (status <> 'printing' AND lease_token IS NULL AND lease_expires_at IS NULL AND claimed_by_agent_id IS NULL)
    ),
  ALTER COLUMN "printer_id" DROP DEFAULT;
-- Modify "public_ticket_locator" table
ALTER TABLE "public"."public_ticket_locator" DROP CONSTRAINT "public_ticket_locator_ticket_id_fkey", ADD CONSTRAINT "public_ticket_locator_ticket_id_fkey" FOREIGN KEY ("tenant_id", "event_id", "ticket_id") REFERENCES "public"."tickets" ("tenant_id", "event_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create "app_users" table
CREATE TABLE "public"."app_users" (
  "id" uuid NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "disabled_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "app_users_issuer_subject_key" UNIQUE ("issuer", "subject")
);
-- Create "tenant_memberships" table
CREATE TABLE "public"."tenant_memberships" (
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "disabled_at" timestamptz NULL,
  PRIMARY KEY ("tenant_id", "user_id"),
  CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."app_users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "tenant_memberships_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text]))
);
-- Modify "ticket_counters" table
ALTER TABLE "public"."ticket_counters" DROP CONSTRAINT "ticket_counters_default_scope_expand", DROP CONSTRAINT "ticket_counters_pkey", ALTER COLUMN "tenant_id" DROP DEFAULT, ALTER COLUMN "event_id" DROP DEFAULT, ADD PRIMARY KEY ("tenant_id", "event_id", "counter_key"), ADD CONSTRAINT "ticket_counters_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Runtime uses a non-login group role. The deployment login must be a member of it.
DO $$
DECLARE
  existing_role record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin
    INTO existing_role
    FROM pg_roles
    WHERE rolname = 'queue_pilot_runtime';
  IF FOUND THEN
    IF existing_role.rolsuper OR existing_role.rolbypassrls OR existing_role.rolcanlogin THEN
      RAISE EXCEPTION 'queue_pilot_runtime must be NOLOGIN, NOSUPERUSER, and NOBYPASSRLS.';
    END IF;
  ELSE
    CREATE ROLE queue_pilot_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO queue_pilot_runtime;
GRANT SELECT ON "public"."tenants", "public"."events", "public"."event_equipment",
  "public"."app_users", "public"."tenant_memberships", "public"."printers",
  "public"."agents", "public"."agent_credentials" TO queue_pilot_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."tickets", "public"."ticket_counters",
  "public"."print_jobs" TO queue_pilot_runtime;
GRANT SELECT, INSERT ON "public"."public_ticket_locator" TO queue_pilot_runtime;
DO $$
DECLARE
  table_name text;
  protected_tables text[] := ARRAY[
    'tenants', 'events', 'event_equipment', 'app_users', 'tenant_memberships',
    'printers', 'agents', 'agent_credentials', 'tickets', 'ticket_counters',
    'print_jobs', 'public_ticket_locator'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I TO %I USING (true) WITH CHECK (true)',
      table_name || '_table_owner_access', table_name, current_user
    );
  END LOOP;
END
$$;
CREATE POLICY tenants_runtime_scope ON "public"."tenants"
  FOR ALL TO queue_pilot_runtime
  USING (
    id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR slug = NULLIF(current_setting('app.tenant_slug', true), '')
    OR id = ANY(string_to_array(NULLIF(current_setting('app.tenant_ids', true), ''), ',')::uuid[])
  )
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY events_runtime_scope ON "public"."events"
  FOR ALL TO queue_pilot_runtime
  USING (
    (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND id = NULLIF(current_setting('app.event_id', true), '')::uuid)
    OR (tenant_id = (SELECT id FROM "public"."tenants"
                     WHERE slug = NULLIF(current_setting('app.tenant_slug', true), ''))
        AND slug = NULLIF(current_setting('app.event_slug', true), ''))
    OR tenant_id = ANY(string_to_array(NULLIF(current_setting('app.tenant_ids', true), ''), ',')::uuid[])
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND id = NULLIF(current_setting('app.event_id', true), '')::uuid
  );
CREATE POLICY event_equipment_runtime_scope ON "public"."event_equipment"
  FOR ALL TO queue_pilot_runtime
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);
CREATE POLICY app_users_runtime_scope ON "public"."app_users"
  FOR SELECT TO queue_pilot_runtime
  USING (
    id = NULLIF(current_setting('app.user_id', true), '')::uuid
    OR (issuer = NULLIF(current_setting('app.identity_issuer', true), '')
        AND subject = NULLIF(current_setting('app.identity_subject', true), ''))
  );
CREATE POLICY tenant_memberships_runtime_scope ON "public"."tenant_memberships"
  FOR SELECT TO queue_pilot_runtime
  USING (
    (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
    OR (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND tenant_id = (SELECT id FROM "public"."tenants"
                         WHERE slug = NULLIF(current_setting('app.tenant_slug', true), '')))
    OR user_id = NULLIF(current_setting('app.membership_list_user_id', true), '')::uuid
  );
CREATE POLICY printers_runtime_scope ON "public"."printers"
  FOR ALL TO queue_pilot_runtime
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);
CREATE POLICY agents_runtime_scope ON "public"."agents"
  FOR ALL TO queue_pilot_runtime
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid
     AND (NULLIF(current_setting('app.agent_id', true), '') IS NULL
          OR id = NULLIF(current_setting('app.agent_id', true), '')::uuid))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);
CREATE POLICY agent_credentials_runtime_scope ON "public"."agent_credentials"
  FOR ALL TO queue_pilot_runtime
  USING (
    secret_hash = NULLIF(current_setting('app.agent_secret_hash', true), '')
    OR (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid)
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "public"."tenant_memberships" AS membership
      WHERE membership.tenant_id = agent_credentials.tenant_id
        AND membership.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
        AND membership.role = 'admin'
        AND membership.disabled_at IS NULL
    )
  );
CREATE POLICY tickets_runtime_scope ON "public"."tickets"
  FOR ALL TO queue_pilot_runtime
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);
CREATE POLICY ticket_counters_runtime_scope ON "public"."ticket_counters"
  FOR ALL TO queue_pilot_runtime
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);
CREATE POLICY print_jobs_runtime_scope ON "public"."print_jobs"
  FOR ALL TO queue_pilot_runtime
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid
     AND (NULLIF(current_setting('app.printer_id', true), '') IS NULL
          OR printer_id = (SELECT printer.id FROM "public"."printers" AS printer
                           WHERE printer.tenant_id = print_jobs.tenant_id
                             AND printer.event_id = print_jobs.event_id
                             AND printer.slug = NULLIF(current_setting('app.printer_id', true), ''))))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);
CREATE POLICY public_ticket_locator_runtime_scope ON "public"."public_ticket_locator"
  FOR ALL TO queue_pilot_runtime
  USING (
    (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
     AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid)
    OR token = NULLIF(current_setting('app.public_token', true), '')
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
          AND event_id = NULLIF(current_setting('app.event_id', true), '')::uuid);

CREATE FUNCTION public.create_agent_credential(
  p_agent_id uuid,
  p_credential_id uuid,
  p_printer_id uuid,
  p_secret_hash text,
  p_expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  v_event_id uuid := NULLIF(current_setting('app.event_id', true), '')::uuid;
  v_user_id uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_tenant_id IS NULL OR v_event_id IS NULL OR v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.app_users AS app_user ON app_user.id = membership.user_id
    WHERE membership.tenant_id = v_tenant_id
      AND membership.user_id = v_user_id
      AND membership.role = 'admin'
      AND membership.disabled_at IS NULL
      AND app_user.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'agent credential operation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expires_at <= v_now OR p_expires_at > v_now + interval '90 days' THEN
    RAISE EXCEPTION 'agent credential expiry is outside the permitted range' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    JOIN public.events AS event ON event.tenant_id = tenant.id
    JOIN public.printers AS printer ON printer.tenant_id = event.tenant_id AND printer.event_id = event.id
    WHERE tenant.id = v_tenant_id AND tenant.disabled_at IS NULL
      AND event.id = v_event_id AND event.disabled_at IS NULL
      AND printer.id = p_printer_id AND printer.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'printer is unavailable in the active event' USING ERRCODE = '23503';
  END IF;
  INSERT INTO public.agents (id, tenant_id, event_id, printer_id)
  VALUES (p_agent_id, v_tenant_id, v_event_id, p_printer_id);
  INSERT INTO public.agent_credentials (
    id, secret_hash, agent_id, tenant_id, event_id, printer_id, created_at, expires_at
  ) VALUES (
    p_credential_id, p_secret_hash, p_agent_id, v_tenant_id, v_event_id,
    p_printer_id, v_now, p_expires_at
  );
END
$$;
REVOKE ALL ON FUNCTION public.create_agent_credential(uuid, uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agent_credential(uuid, uuid, uuid, text, timestamptz) TO queue_pilot_runtime;

CREATE FUNCTION public.rotate_agent_credential(
  p_agent_id uuid,
  p_credential_id uuid,
  p_secret_hash text,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  v_event_id uuid := NULLIF(current_setting('app.event_id', true), '')::uuid;
  v_user_id uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_printer_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_tenant_id IS NULL OR v_event_id IS NULL OR v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.app_users AS app_user ON app_user.id = membership.user_id
    WHERE membership.tenant_id = v_tenant_id
      AND membership.user_id = v_user_id
      AND membership.role = 'admin'
      AND membership.disabled_at IS NULL
      AND app_user.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'agent credential operation is not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_expires_at <= v_now OR p_expires_at > v_now + interval '90 days' THEN
    RAISE EXCEPTION 'agent credential expiry is outside the permitted range' USING ERRCODE = '22023';
  END IF;
  SELECT agent.printer_id INTO v_printer_id
  FROM public.agents AS agent
  JOIN public.printers AS printer
    ON printer.tenant_id = agent.tenant_id
   AND printer.event_id = agent.event_id
   AND printer.id = agent.printer_id
  WHERE agent.id = p_agent_id
    AND agent.tenant_id = v_tenant_id
    AND agent.event_id = v_event_id
    AND agent.disabled_at IS NULL
    AND printer.disabled_at IS NULL
  FOR UPDATE OF agent;
  IF v_printer_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.agent_credentials
  SET expires_at = LEAST(expires_at, v_now + interval '24 hours')
  WHERE agent_id = p_agent_id
    AND tenant_id = v_tenant_id
    AND event_id = v_event_id
    AND revoked_at IS NULL;
  INSERT INTO public.agent_credentials (
    id, secret_hash, agent_id, tenant_id, event_id, printer_id, created_at, expires_at
  ) VALUES (
    p_credential_id, p_secret_hash, p_agent_id, v_tenant_id, v_event_id,
    v_printer_id, v_now, p_expires_at
  );
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.rotate_agent_credential(uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_agent_credential(uuid, uuid, text, timestamptz) TO queue_pilot_runtime;

CREATE FUNCTION public.revoke_agent_credential(
  p_agent_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  v_event_id uuid := NULLIF(current_setting('app.event_id', true), '')::uuid;
  v_user_id uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  v_agent_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_tenant_id IS NULL OR v_event_id IS NULL OR v_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.app_users AS app_user ON app_user.id = membership.user_id
    WHERE membership.tenant_id = v_tenant_id
      AND membership.user_id = v_user_id
      AND membership.role = 'admin'
      AND membership.disabled_at IS NULL
      AND app_user.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'agent credential operation is not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.agents
  SET disabled_at = COALESCE(disabled_at, v_now)
  WHERE id = p_agent_id AND tenant_id = v_tenant_id AND event_id = v_event_id
  RETURNING id INTO v_agent_id;
  IF v_agent_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.agent_credentials
  SET revoked_at = COALESCE(revoked_at, v_now)
  WHERE agent_id = v_agent_id AND tenant_id = v_tenant_id AND event_id = v_event_id;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.revoke_agent_credential(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_agent_credential(uuid) TO queue_pilot_runtime;

CREATE FUNCTION public.touch_agent_last_seen()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  v_event_id uuid := NULLIF(current_setting('app.event_id', true), '')::uuid;
  v_agent_id uuid := NULLIF(current_setting('app.agent_id', true), '')::uuid;
  v_secret_hash text := NULLIF(current_setting('app.agent_secret_hash', true), '');
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_tenant_id IS NULL OR v_event_id IS NULL OR v_agent_id IS NULL OR v_secret_hash IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.agents AS agent
  SET last_seen_at = v_now
  WHERE agent.id = v_agent_id
    AND agent.tenant_id = v_tenant_id
    AND agent.event_id = v_event_id
    AND agent.disabled_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.agent_credentials AS credential
      JOIN public.printers AS printer
        ON printer.tenant_id = credential.tenant_id
       AND printer.event_id = credential.event_id
       AND printer.id = credential.printer_id
      JOIN public.events AS event
        ON event.tenant_id = credential.tenant_id
       AND event.id = credential.event_id
      JOIN public.tenants AS tenant ON tenant.id = credential.tenant_id
      WHERE credential.secret_hash = v_secret_hash
        AND credential.agent_id = agent.id
        AND credential.tenant_id = agent.tenant_id
        AND credential.event_id = agent.event_id
        AND credential.expires_at > v_now
        AND credential.revoked_at IS NULL
        AND printer.disabled_at IS NULL
        AND event.disabled_at IS NULL
        AND tenant.disabled_at IS NULL
    );
  RETURN FOUND;
END
$$;
REVOKE ALL ON FUNCTION public.touch_agent_last_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_agent_last_seen() TO queue_pilot_runtime;
