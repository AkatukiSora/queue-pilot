-- Modify "configuration_audit" table
ALTER TABLE "public"."configuration_audit" DROP CONSTRAINT "configuration_audit_action_check", ADD CONSTRAINT "configuration_audit_action_check" CHECK (action = ANY (ARRAY['initialize-web'::text, 'adopt-web'::text, 'import-export'::text, 'self-service-create'::text]));
-- Modify "tenants" table
ALTER TABLE "public"."tenants" ADD COLUMN "revision" bigint NOT NULL DEFAULT 1;
-- Create "tenant_creation_records" table
CREATE TABLE "public"."tenant_creation_records" (
  "tenant_id" uuid NOT NULL,
  "creator_user_id" uuid NULL,
  "origin" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenant_id"),
  CONSTRAINT "tenant_creation_records_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "public"."app_users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "tenant_creation_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "tenant_creation_records_creator_origin_check" CHECK (((origin = 'self-service'::text) AND (creator_user_id IS NOT NULL)) OR ((origin = 'imported'::text) AND (creator_user_id IS NULL))),
  CONSTRAINT "tenant_creation_records_origin_check" CHECK (origin = ANY (ARRAY['self-service'::text, 'imported'::text]))
);
-- Create index "tenant_creation_records_creator_idx" to table: "tenant_creation_records"
CREATE INDEX "tenant_creation_records_creator_idx" ON "public"."tenant_creation_records" ("creator_user_id");

-- Preserve generic provenance for every tenant that already exists at upgrade time.
INSERT INTO public.tenant_creation_records (tenant_id, creator_user_id, origin)
SELECT tenant.id, NULL, 'imported'
FROM public.tenants AS tenant;

ALTER TABLE public.tenant_creation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_creation_records FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  EXECUTE format(
    'CREATE POLICY tenant_creation_records_owner_access ON public.tenant_creation_records TO %I USING (true) WITH CHECK (true)',
    current_user
  );
END
$$;
REVOKE ALL ON public.tenant_creation_records FROM PUBLIC;

CREATE FUNCTION public.get_self_service_registration_counts()
RETURNS TABLE (identity_state text, per_user_count bigint, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  identity_issuer text := NULLIF(current_setting('app.identity_issuer', true), '');
  identity_subject text := NULLIF(current_setting('app.identity_subject', true), '');
  app_user_id uuid;
  app_user_disabled_at timestamptz;
BEGIN
  IF identity_issuer IS NULL OR identity_subject IS NULL THEN
    RETURN QUERY SELECT 'missing'::text, 0::bigint, (SELECT count(*) FROM public.tenants);
    RETURN;
  END IF;

  SELECT app_user.id, app_user.disabled_at
  INTO app_user_id, app_user_disabled_at
  FROM public.app_users AS app_user
  WHERE app_user.issuer = identity_issuer
    AND app_user.subject = identity_subject;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing'::text, 0::bigint, (SELECT count(*) FROM public.tenants);
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN app_user_disabled_at IS NULL THEN 'active' ELSE 'disabled' END,
    (SELECT count(*) FROM public.tenant_creation_records AS record
     WHERE record.creator_user_id = app_user_id AND record.origin = 'self-service'),
    (SELECT count(*) FROM public.tenants);
END
$function$;
REVOKE ALL ON FUNCTION public.get_self_service_registration_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_self_service_registration_counts() TO queue_pilot_runtime;

CREATE FUNCTION public.create_self_service_tenant(
  requested_slug text,
  requested_display_name text,
  maximum_per_user bigint,
  maximum_total bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  identity_issuer text := NULLIF(current_setting('app.identity_issuer', true), '');
  identity_subject text := NULLIF(current_setting('app.identity_subject', true), '');
  authority_mode text;
  app_user_id uuid;
  app_user_disabled_at timestamptz;
  user_tenant_count bigint;
  all_tenant_count bigint;
  tenant_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF identity_issuer IS DISTINCT FROM 'https://github.com'
     OR identity_subject IS NULL
     OR identity_subject !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_identity';
  END IF;

  IF requested_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR pg_catalog.char_length(requested_slug) > 63 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_slug';
  END IF;

  IF requested_slug = ANY (ARRAY[
    'api', 'auth', 'admin', 'login', 'logout', 'signup', 'new', 'manage',
    'settings', 'healthz', 'readyz', 'ticket', 't', 'e'
  ]::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'reserved_slug';
  END IF;

  IF requested_display_name IS NULL
     OR pg_catalog.char_length(requested_display_name) = 0
     OR pg_catalog.char_length(requested_display_name) > 120
     OR pg_catalog.btrim(requested_display_name) = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_display_name';
  END IF;

  IF maximum_per_user <= 0 OR (maximum_total IS NOT NULL AND maximum_total <= 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_quota';
  END IF;

  SELECT authority.mode
  INTO authority_mode
  FROM public.configuration_authority AS authority
  WHERE authority.id = 1
  FOR UPDATE;

  IF NOT FOUND OR authority_mode <> 'database' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'database_authority_required';
  END IF;

  INSERT INTO public.app_users (id, issuer, subject)
  VALUES (pg_catalog.gen_random_uuid(), identity_issuer, identity_subject)
  ON CONFLICT (issuer, subject) DO NOTHING;

  SELECT app_user.id, app_user.disabled_at
  INTO app_user_id, app_user_disabled_at
  FROM public.app_users AS app_user
  WHERE app_user.issuer = identity_issuer
    AND app_user.subject = identity_subject
  FOR UPDATE;

  IF NOT FOUND OR app_user_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'identity_disabled';
  END IF;

  SELECT count(*)
  INTO user_tenant_count
  FROM public.tenant_creation_records AS record
  WHERE record.creator_user_id = app_user_id
    AND record.origin = 'self-service';

  IF user_tenant_count >= maximum_per_user THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'tenant_limit';
  END IF;

  SELECT count(*) INTO all_tenant_count FROM public.tenants;
  IF maximum_total IS NOT NULL AND all_tenant_count >= maximum_total THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'tenant_total_limit';
  END IF;

  INSERT INTO public.tenants (id, slug, display_name, revision)
  VALUES (tenant_id, requested_slug, requested_display_name, 1);

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
  VALUES (tenant_id, app_user_id, 'admin');

  INSERT INTO public.tenant_creation_records (tenant_id, creator_user_id, origin)
  VALUES (tenant_id, app_user_id, 'self-service');

  INSERT INTO public.configuration_audit (
    id, tenant_id, actor_app_user_id, actor_kind, action,
    resource_type, resource_id, revision_after, origin
  ) VALUES (
    pg_catalog.gen_random_uuid(), tenant_id, app_user_id, 'user',
    'self-service-create', 'tenant', tenant_id::text, 1, 'self-service'
  );

  RETURN tenant_id;
END
$function$;
REVOKE ALL ON FUNCTION public.create_self_service_tenant(text, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_self_service_tenant(text, text, bigint, bigint) TO queue_pilot_runtime;
