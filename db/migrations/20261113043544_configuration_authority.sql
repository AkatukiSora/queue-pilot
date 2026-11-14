-- Create "configuration_authority" table
CREATE TABLE "public"."configuration_authority" (
  "id" smallint NOT NULL DEFAULT 1,
  "mode" text NOT NULL DEFAULT 'manifest',
  "revision" bigint NOT NULL DEFAULT 1,
  "adopted_at" timestamptz NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "configuration_authority_mode_check" CHECK (mode = ANY (ARRAY['manifest'::text, 'database'::text])),
  CONSTRAINT "configuration_authority_revision_check" CHECK (revision > 0),
  CONSTRAINT "configuration_authority_singleton_check" CHECK (id = 1)
);

INSERT INTO "public"."configuration_authority" ("id", "mode", "revision")
VALUES (1, 'manifest', 1);

ALTER TABLE "public"."configuration_authority" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."configuration_authority" FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY configuration_authority_owner_access ON public.configuration_authority TO %I USING (true) WITH CHECK (true)',
    current_user
  );
END
$$;
CREATE POLICY configuration_authority_runtime_read
  ON "public"."configuration_authority"
  FOR SELECT TO queue_pilot_runtime
  USING (true);
REVOKE ALL ON "public"."configuration_authority" FROM PUBLIC;
GRANT SELECT ON "public"."configuration_authority" TO queue_pilot_runtime;
