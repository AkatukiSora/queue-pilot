-- Create "configuration_audit" table
CREATE TABLE "public"."configuration_audit" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NULL,
  "actor_app_user_id" uuid NULL,
  "actor_kind" text NOT NULL DEFAULT 'operator',
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "revision_before" bigint NULL,
  "revision_after" bigint NULL,
  "before_state" jsonb NULL,
  "after_state" jsonb NULL,
  "origin" text NOT NULL,
  "snapshot_hash" character varying(64) NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "configuration_audit_actor_app_user_id_fkey" FOREIGN KEY ("actor_app_user_id") REFERENCES "public"."app_users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "configuration_audit_tenant_event_fkey" FOREIGN KEY ("tenant_id", "event_id") REFERENCES "public"."events" ("tenant_id", "id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "configuration_audit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "configuration_audit_action_check" CHECK (action = ANY (ARRAY['initialize-web'::text, 'adopt-web'::text, 'import-export'::text])),
  CONSTRAINT "configuration_audit_actor_kind_check" CHECK (actor_kind = ANY (ARRAY['operator'::text, 'user'::text])),
  CONSTRAINT "configuration_audit_resource_type_check" CHECK (resource_type = 'tenant'::text),
  CONSTRAINT "configuration_audit_snapshot_hash_check" CHECK ((snapshot_hash IS NULL) OR ((snapshot_hash)::text ~ '^[a-f0-9]{64}$'::text))
);
-- Create index "configuration_audit_tenant_occurred_idx" to table: "configuration_audit"
CREATE INDEX "configuration_audit_tenant_occurred_idx" ON "public"."configuration_audit" ("tenant_id", "occurred_at");

ALTER TABLE "public"."configuration_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."configuration_audit" FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY configuration_audit_owner_access ON public.configuration_audit TO %I USING (true) WITH CHECK (true)',
    current_user
  );
END
$$;
REVOKE ALL ON "public"."configuration_audit" FROM PUBLIC;
