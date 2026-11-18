-- Modify "configuration_audit" table
ALTER TABLE "public"."configuration_audit" DROP CONSTRAINT "configuration_audit_action_check", ADD CONSTRAINT "configuration_audit_action_check" CHECK (action = ANY (ARRAY['initialize-web'::text, 'adopt-web'::text, 'import-export'::text, 'self-service-create'::text, 'tenant-update'::text, 'tenant-disable'::text, 'member-upsert'::text, 'member-disable'::text, 'event-create'::text, 'event-update'::text, 'event-disable'::text])), DROP CONSTRAINT "configuration_audit_resource_type_check", ADD CONSTRAINT "configuration_audit_resource_type_check" CHECK (resource_type = ANY (ARRAY['tenant'::text, 'member'::text, 'event'::text]));

-- Internal helpers. They are not granted to the runtime role; only the
-- SECURITY DEFINER management functions below call them.
--
-- Lock order for every writer is tenant row, then event row. Management
-- functions take the tenant row (FOR UPDATE for tenant/member changes, FOR SHARE
-- for event changes) and then the event row FOR UPDATE. Ticket writers take both
-- rows FOR SHARE through public.lock_event_for_ticket_write().

CREATE FUNCTION public.qp_authorize_tenant(
  p_tenant_slug text,
  p_lock text,
  p_require_admin boolean,
  OUT o_tenant_id uuid,
  OUT o_actor_id uuid,
  OUT o_role text
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  identity_issuer text := NULLIF(current_setting('app.identity_issuer', true), '');
  identity_subject text := NULLIF(current_setting('app.identity_subject', true), '');
BEGIN
  IF identity_issuer IS NULL OR identity_subject IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;

  SELECT app_user.id
  INTO o_actor_id
  FROM public.app_users AS app_user
  WHERE app_user.issuer = identity_issuer
    AND app_user.subject = identity_subject
    AND app_user.disabled_at IS NULL;
  IF o_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;

  SELECT tenant.id
  INTO o_tenant_id
  FROM public.tenants AS tenant
  WHERE tenant.slug = p_tenant_slug
    AND tenant.disabled_at IS NULL;
  IF o_tenant_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;

  -- Web changes exist only under database authority; a manifest deployment
  -- keeps its manifest as the single source of configuration.
  IF p_lock <> 'none' AND NOT EXISTS (
    SELECT 1 FROM public.configuration_authority AS authority
    WHERE authority.id = 1 AND authority.mode = 'database'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'database_authority_required';
  END IF;

  IF p_lock = 'update' THEN
    PERFORM 1 FROM public.tenants AS tenant
    WHERE tenant.id = o_tenant_id AND tenant.disabled_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
    END IF;
  ELSIF p_lock = 'share' THEN
    PERFORM 1 FROM public.tenants AS tenant
    WHERE tenant.id = o_tenant_id AND tenant.disabled_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
    END IF;
  END IF;

  SELECT membership.role
  INTO o_role
  FROM public.tenant_memberships AS membership
  WHERE membership.tenant_id = o_tenant_id
    AND membership.user_id = o_actor_id
    AND membership.disabled_at IS NULL;
  IF o_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;
  IF p_require_admin AND o_role <> 'admin' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'forbidden';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.qp_authorize_tenant(text, text, boolean) FROM PUBLIC;

CREATE FUNCTION public.qp_write_audit(
  p_tenant_id uuid,
  p_event_id uuid,
  p_actor_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_revision_before bigint,
  p_revision_after bigint,
  p_before jsonb,
  p_after jsonb
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public
AS $function$
  INSERT INTO public.configuration_audit (
    id, tenant_id, event_id, actor_app_user_id, actor_kind, action,
    resource_type, resource_id, occurred_at, revision_before, revision_after,
    before_state, after_state, origin
  ) VALUES (
    pg_catalog.gen_random_uuid(), p_tenant_id, p_event_id, p_actor_id, 'user',
    p_action, p_resource_type, p_resource_id, pg_catalog.clock_timestamp(),
    p_revision_before, p_revision_after, p_before, p_after, 'management-api'
  );
$function$;
REVOKE ALL ON FUNCTION public.qp_write_audit(uuid, uuid, uuid, text, text, text, bigint, bigint, jsonb, jsonb) FROM PUBLIC;

CREATE FUNCTION public.qp_revoke_github_sessions(p_subject text)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public
AS $function$
  DELETE FROM public."session" AS auth_session
  USING public."account" AS auth_account
  WHERE auth_session."userId" = auth_account."userId"
    AND auth_account."providerId" = 'github'
    AND auth_account."accountId" = p_subject;
$function$;
REVOKE ALL ON FUNCTION public.qp_revoke_github_sessions(text) FROM PUBLIC;

CREATE FUNCTION public.qp_other_active_admins(p_tenant_id uuid, p_user_id uuid)
RETURNS bigint
LANGUAGE sql
SET search_path = pg_catalog, public
AS $function$
  SELECT count(*)
  FROM public.tenant_memberships AS membership
  JOIN public.app_users AS app_user ON app_user.id = membership.user_id
  WHERE membership.tenant_id = p_tenant_id
    AND membership.user_id <> p_user_id
    AND membership.role = 'admin'
    AND membership.disabled_at IS NULL
    AND app_user.disabled_at IS NULL;
$function$;
REVOKE ALL ON FUNCTION public.qp_other_active_admins(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION public.qp_event_view(p_tenant_id uuid, p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  event_row record;
  ticket_count bigint;
  active_ticket_count bigint;
  active_job_count bigint;
  printers_in_use jsonb;
BEGIN
  SELECT event.id, event.slug, event.config, event.config_revision
  INTO event_row
  FROM public.events AS event
  WHERE event.tenant_id = p_tenant_id AND event.id = p_event_id;

  SELECT count(*), count(*) FILTER (WHERE ticket.status IN ('waiting', 'called'))
  INTO ticket_count, active_ticket_count
  FROM public.tickets AS ticket
  WHERE ticket.tenant_id = p_tenant_id AND ticket.event_id = p_event_id;

  SELECT count(*)
  INTO active_job_count
  FROM public.print_jobs AS job
  WHERE job.tenant_id = p_tenant_id AND job.event_id = p_event_id
    AND job.status IN ('queued', 'printing');

  SELECT COALESCE(pg_catalog.jsonb_agg(printer.slug ORDER BY printer.slug), '[]'::jsonb)
  INTO printers_in_use
  FROM public.printers AS printer
  WHERE printer.tenant_id = p_tenant_id AND printer.event_id = p_event_id
    AND EXISTS (
      SELECT 1 FROM public.print_jobs AS job
      WHERE job.tenant_id = printer.tenant_id AND job.event_id = printer.event_id
        AND job.printer_id = printer.id AND job.status IN ('queued', 'printing')
    );

  RETURN pg_catalog.jsonb_build_object(
    'id', event_row.id,
    'slug', event_row.slug,
    'config', event_row.config,
    'revision', event_row.config_revision,
    'changeConstraints', pg_catalog.jsonb_build_object(
      'ticketCount', ticket_count,
      'structuralFrozen', ticket_count > 0,
      'frozenFields', CASE WHEN ticket_count > 0
        THEN '["timeZone","numberScope","startsAt","endsAt","schedule","equipmentIds"]'::jsonb
        ELSE '[]'::jsonb END,
      'activeTicketCount', active_ticket_count,
      'activeJobCount', active_job_count,
      'canDisable', active_ticket_count = 0 AND active_job_count = 0,
      'printersInUse', printers_in_use
    )
  );
END
$function$;
REVOKE ALL ON FUNCTION public.qp_event_view(uuid, uuid) FROM PUBLIC;

CREATE FUNCTION public.qp_sync_event_rows(p_tenant_id uuid, p_event_id uuid, p_config jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  blocked_printer text;
BEGIN
  SELECT printer.slug
  INTO blocked_printer
  FROM public.printers AS printer
  WHERE printer.tenant_id = p_tenant_id AND printer.event_id = p_event_id
    AND printer.disabled_at IS NULL
    AND NOT (printer.slug = ANY (ARRAY(
      SELECT item.value ->> 'id' FROM pg_catalog.jsonb_array_elements(p_config -> 'printers') AS item
    )))
    AND EXISTS (
      SELECT 1 FROM public.print_jobs AS job
      WHERE job.tenant_id = printer.tenant_id AND job.event_id = printer.event_id
        AND job.printer_id = printer.id AND job.status IN ('queued', 'printing')
    )
  ORDER BY printer.slug
  LIMIT 1;
  IF blocked_printer IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'change_constraint',
      DETAIL = 'printer_in_use:' || blocked_printer;
  END IF;

  INSERT INTO public.event_equipment (tenant_id, event_id, id, label, sort_order, disabled_at)
  SELECT p_tenant_id, p_event_id, item.value ->> 'id', item.value ->> 'label',
         (item.ordinality - 1)::integer, NULL
  FROM pg_catalog.jsonb_array_elements(p_config -> 'equipment') WITH ORDINALITY AS item(value, ordinality)
  ON CONFLICT (tenant_id, event_id, id) DO UPDATE
  SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, disabled_at = NULL;
  UPDATE public.event_equipment AS equipment
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE equipment.tenant_id = p_tenant_id AND equipment.event_id = p_event_id
    AND equipment.disabled_at IS NULL
    AND NOT (equipment.id = ANY (ARRAY(
      SELECT item.value ->> 'id' FROM pg_catalog.jsonb_array_elements(p_config -> 'equipment') AS item
    )));

  INSERT INTO public.printers (id, tenant_id, event_id, slug, label, disabled_at)
  SELECT pg_catalog.gen_random_uuid(), p_tenant_id, p_event_id,
         item.value ->> 'id', item.value ->> 'label', NULL
  FROM pg_catalog.jsonb_array_elements(p_config -> 'printers') AS item
  ON CONFLICT (tenant_id, event_id, slug) DO UPDATE
  SET label = EXCLUDED.label, disabled_at = NULL;
  UPDATE public.printers AS printer
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE printer.tenant_id = p_tenant_id AND printer.event_id = p_event_id
    AND printer.disabled_at IS NULL
    AND NOT (printer.slug = ANY (ARRAY(
      SELECT item.value ->> 'id' FROM pg_catalog.jsonb_array_elements(p_config -> 'printers') AS item
    )));
END
$function$;
REVOKE ALL ON FUNCTION public.qp_sync_event_rows(uuid, uuid, jsonb) FROM PUBLIC;

CREATE FUNCTION public.qp_disable_event_rows(p_tenant_id uuid, p_event_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, public
AS $function$
  UPDATE public.agent_credentials AS credential
  SET revoked_at = pg_catalog.clock_timestamp()
  WHERE credential.tenant_id = p_tenant_id AND credential.event_id = p_event_id
    AND credential.revoked_at IS NULL;
  UPDATE public.agents AS agent
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE agent.tenant_id = p_tenant_id AND agent.event_id = p_event_id
    AND agent.disabled_at IS NULL;
  UPDATE public.printers AS printer
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE printer.tenant_id = p_tenant_id AND printer.event_id = p_event_id
    AND printer.disabled_at IS NULL;
  UPDATE public.event_equipment AS equipment
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE equipment.tenant_id = p_tenant_id AND equipment.event_id = p_event_id
    AND equipment.disabled_at IS NULL;
  UPDATE public.events AS event
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE event.tenant_id = p_tenant_id AND event.id = p_event_id
    AND event.disabled_at IS NULL;
$function$;
REVOKE ALL ON FUNCTION public.qp_disable_event_rows(uuid, uuid) FROM PUBLIC;

-- Ticket writers take the same row locks as configuration writers. The runtime
-- role has no UPDATE privilege on tenants/events, so it cannot lock them itself.
CREATE FUNCTION public.lock_event_for_ticket_write()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope_tenant_id uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  scope_event_id uuid := NULLIF(current_setting('app.event_id', true), '')::uuid;
  scope_user_id uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  tenant_disabled_at timestamptz;
  event_disabled_at timestamptz;
BEGIN
  IF scope_tenant_id IS NULL OR scope_event_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant.disabled_at
  INTO tenant_disabled_at
  FROM public.tenants AS tenant
  WHERE tenant.id = scope_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT event.disabled_at
  INTO event_disabled_at
  FROM public.events AS event
  WHERE event.tenant_id = scope_tenant_id AND event.id = scope_event_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF tenant_disabled_at IS NOT NULL OR event_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'event_unavailable';
  END IF;

  IF scope_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships AS membership
    JOIN public.app_users AS app_user ON app_user.id = membership.user_id
    WHERE membership.tenant_id = scope_tenant_id
      AND membership.user_id = scope_user_id
      AND membership.disabled_at IS NULL
      AND app_user.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'event_unavailable';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.lock_event_for_ticket_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_event_for_ticket_write() TO queue_pilot_runtime;

-- Management reads and writes. Every function derives the actor from the
-- transaction-local identity settings, re-reads the current membership, and
-- raises P0001 with a stable MESSAGE code on failure.

CREATE FUNCTION public.list_managed_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  identity_issuer text := NULLIF(current_setting('app.identity_issuer', true), '');
  identity_subject text := NULLIF(current_setting('app.identity_subject', true), '');
  actor_id uuid;
BEGIN
  SELECT app_user.id
  INTO actor_id
  FROM public.app_users AS app_user
  WHERE app_user.issuer = identity_issuer
    AND app_user.subject = identity_subject
    AND app_user.disabled_at IS NULL;
  IF actor_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('tenants', '[]'::jsonb);
  END IF;

  RETURN pg_catalog.jsonb_build_object('tenants', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', tenant.id,
      'slug', tenant.slug,
      'displayName', tenant.display_name,
      'role', membership.role,
      'revision', tenant.revision,
      'events', COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', event.id,
          'slug', event.slug,
          'title', event.config ->> 'title'
        ) ORDER BY event.slug)
        FROM public.events AS event
        WHERE event.tenant_id = tenant.id AND event.disabled_at IS NULL
      ), '[]'::jsonb)
    ) ORDER BY tenant.slug)
    FROM public.tenant_memberships AS membership
    JOIN public.tenants AS tenant ON tenant.id = membership.tenant_id
    WHERE membership.user_id = actor_id
      AND membership.disabled_at IS NULL
      AND tenant.disabled_at IS NULL
  ), '[]'::jsonb));
END
$function$;
REVOKE ALL ON FUNCTION public.list_managed_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_managed_tenants() TO queue_pilot_runtime;

CREATE FUNCTION public.require_managed_tenant_admin(p_tenant_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
END
$function$;
REVOKE ALL ON FUNCTION public.require_managed_tenant_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_managed_tenant_admin(text) TO queue_pilot_runtime;

CREATE FUNCTION public.get_managed_tenant(p_tenant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  tenant_row record;
  active_ticket_count bigint;
  active_job_count bigint;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
  SELECT tenant.id, tenant.slug, tenant.display_name, tenant.revision
  INTO tenant_row
  FROM public.tenants AS tenant
  WHERE tenant.id = scope.o_tenant_id;
  SELECT count(*) INTO active_ticket_count
  FROM public.tickets AS ticket
  WHERE ticket.tenant_id = scope.o_tenant_id AND ticket.status IN ('waiting', 'called');
  SELECT count(*) INTO active_job_count
  FROM public.print_jobs AS job
  WHERE job.tenant_id = scope.o_tenant_id AND job.status IN ('queued', 'printing');
  RETURN pg_catalog.jsonb_build_object(
    'id', tenant_row.id,
    'slug', tenant_row.slug,
    'displayName', tenant_row.display_name,
    'revision', tenant_row.revision,
    'changeConstraints', pg_catalog.jsonb_build_object(
      'activeTicketCount', active_ticket_count,
      'activeJobCount', active_job_count,
      'canDisable', active_ticket_count = 0 AND active_job_count = 0
    )
  );
END
$function$;
REVOKE ALL ON FUNCTION public.get_managed_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_managed_tenant(text) TO queue_pilot_runtime;

CREATE FUNCTION public.update_managed_tenant(
  p_tenant_slug text,
  p_expected_revision bigint,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  current_revision bigint;
  current_name text;
  next_revision bigint;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'update', true);
  IF p_display_name IS NULL
     OR pg_catalog.char_length(p_display_name) = 0
     OR pg_catalog.char_length(p_display_name) > 120
     OR pg_catalog.btrim(p_display_name) = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_display_name';
  END IF;
  SELECT tenant.revision, tenant.display_name
  INTO current_revision, current_name
  FROM public.tenants AS tenant
  WHERE tenant.id = scope.o_tenant_id;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revision_conflict';
  END IF;
  IF current_name = p_display_name THEN
    RETURN pg_catalog.jsonb_build_object('revision', current_revision);
  END IF;
  UPDATE public.tenants AS tenant
  SET display_name = p_display_name, revision = tenant.revision + 1
  WHERE tenant.id = scope.o_tenant_id
  RETURNING tenant.revision INTO next_revision;
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, NULL, scope.o_actor_id, 'tenant-update', 'tenant',
    scope.o_tenant_id::text, current_revision, next_revision,
    pg_catalog.jsonb_build_object('displayName', current_name),
    pg_catalog.jsonb_build_object('displayName', p_display_name)
  );
  RETURN pg_catalog.jsonb_build_object('revision', next_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.update_managed_tenant(text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_managed_tenant(text, bigint, text) TO queue_pilot_runtime;

CREATE FUNCTION public.disable_managed_tenant(
  p_tenant_slug text,
  p_expected_revision bigint,
  p_confirm_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  current_revision bigint;
  next_revision bigint;
  event_row record;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'update', true);
  IF p_confirm_slug IS DISTINCT FROM p_tenant_slug THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'confirmation_mismatch';
  END IF;
  SELECT tenant.revision INTO current_revision
  FROM public.tenants AS tenant WHERE tenant.id = scope.o_tenant_id;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revision_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tickets AS ticket
    WHERE ticket.tenant_id = scope.o_tenant_id AND ticket.status IN ('waiting', 'called')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'change_constraint', DETAIL = 'active_tickets';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.print_jobs AS job
    WHERE job.tenant_id = scope.o_tenant_id AND job.status IN ('queued', 'printing')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'change_constraint', DETAIL = 'active_print_jobs';
  END IF;
  FOR event_row IN
    SELECT event.id FROM public.events AS event
    WHERE event.tenant_id = scope.o_tenant_id AND event.disabled_at IS NULL
    ORDER BY event.id
    FOR UPDATE
  LOOP
    PERFORM public.qp_disable_event_rows(scope.o_tenant_id, event_row.id);
  END LOOP;
  UPDATE public.tenants AS tenant
  SET disabled_at = pg_catalog.clock_timestamp(), revision = tenant.revision + 1
  WHERE tenant.id = scope.o_tenant_id
  RETURNING tenant.revision INTO next_revision;
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, NULL, scope.o_actor_id, 'tenant-disable', 'tenant',
    scope.o_tenant_id::text, current_revision, next_revision,
    pg_catalog.jsonb_build_object('disabled', false),
    pg_catalog.jsonb_build_object('disabled', true)
  );
  RETURN pg_catalog.jsonb_build_object('revision', next_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.disable_managed_tenant(text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_managed_tenant(text, bigint, text) TO queue_pilot_runtime;

CREATE FUNCTION public.list_managed_members(p_tenant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  tenant_revision bigint;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
  SELECT tenant.revision INTO tenant_revision
  FROM public.tenants AS tenant WHERE tenant.id = scope.o_tenant_id;
  RETURN pg_catalog.jsonb_build_object(
    'revision', tenant_revision,
    'members', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'issuer', app_user.issuer,
        'subject', app_user.subject,
        'role', membership.role,
        'disabled', membership.disabled_at IS NOT NULL OR app_user.disabled_at IS NOT NULL,
        'self', app_user.id = scope.o_actor_id
      ) ORDER BY app_user.issuer, app_user.subject)
      FROM public.tenant_memberships AS membership
      JOIN public.app_users AS app_user ON app_user.id = membership.user_id
      WHERE membership.tenant_id = scope.o_tenant_id
    ), '[]'::jsonb)
  );
END
$function$;
REVOKE ALL ON FUNCTION public.list_managed_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_managed_members(text) TO queue_pilot_runtime;

CREATE FUNCTION public.upsert_managed_member(
  p_tenant_slug text,
  p_expected_revision bigint,
  p_subject text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  current_revision bigint;
  next_revision bigint;
  target_user_id uuid;
  target_user_disabled_at timestamptz;
  existing_role text;
  existing_disabled_at timestamptz;
  existing_found boolean;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_role';
  END IF;
  IF p_subject IS NULL OR p_subject !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_subject';
  END IF;
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'update', true);
  SELECT tenant.revision INTO current_revision
  FROM public.tenants AS tenant WHERE tenant.id = scope.o_tenant_id;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revision_conflict';
  END IF;

  INSERT INTO public.app_users (id, issuer, subject)
  VALUES (pg_catalog.gen_random_uuid(), 'https://github.com', p_subject)
  ON CONFLICT (issuer, subject) DO NOTHING;
  SELECT app_user.id, app_user.disabled_at
  INTO target_user_id, target_user_disabled_at
  FROM public.app_users AS app_user
  WHERE app_user.issuer = 'https://github.com' AND app_user.subject = p_subject
  FOR UPDATE;
  IF target_user_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'identity_disabled';
  END IF;

  SELECT membership.role, membership.disabled_at, true
  INTO existing_role, existing_disabled_at, existing_found
  FROM public.tenant_memberships AS membership
  WHERE membership.tenant_id = scope.o_tenant_id AND membership.user_id = target_user_id
  FOR UPDATE;

  IF existing_found IS TRUE THEN
    IF existing_role = p_role AND existing_disabled_at IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('revision', current_revision);
    END IF;
    IF existing_role = 'admin' AND existing_disabled_at IS NULL AND p_role <> 'admin'
       AND public.qp_other_active_admins(scope.o_tenant_id, target_user_id) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'last_admin';
    END IF;
    UPDATE public.tenant_memberships AS membership
    SET role = p_role, disabled_at = NULL
    WHERE membership.tenant_id = scope.o_tenant_id AND membership.user_id = target_user_id;
    IF existing_disabled_at IS NULL THEN
      PERFORM public.qp_revoke_github_sessions(p_subject);
    END IF;
  ELSE
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
    VALUES (scope.o_tenant_id, target_user_id, p_role);
  END IF;

  UPDATE public.tenants AS tenant
  SET revision = tenant.revision + 1
  WHERE tenant.id = scope.o_tenant_id
  RETURNING tenant.revision INTO next_revision;
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, NULL, scope.o_actor_id, 'member-upsert', 'member',
    target_user_id::text, current_revision, next_revision,
    CASE WHEN existing_found IS TRUE THEN pg_catalog.jsonb_build_object(
      'subject', p_subject, 'role', existing_role, 'disabled', existing_disabled_at IS NOT NULL
    ) ELSE NULL END,
    pg_catalog.jsonb_build_object('subject', p_subject, 'role', p_role, 'disabled', false)
  );
  RETURN pg_catalog.jsonb_build_object('revision', next_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.upsert_managed_member(text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_managed_member(text, bigint, text, text) TO queue_pilot_runtime;

CREATE FUNCTION public.disable_managed_member(
  p_tenant_slug text,
  p_expected_revision bigint,
  p_subject text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  current_revision bigint;
  next_revision bigint;
  target_user_id uuid;
  target_role text;
BEGIN
  IF p_subject IS NULL OR p_subject !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_subject';
  END IF;
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'update', true);
  SELECT tenant.revision INTO current_revision
  FROM public.tenants AS tenant WHERE tenant.id = scope.o_tenant_id;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revision_conflict';
  END IF;

  SELECT membership.user_id, membership.role
  INTO target_user_id, target_role
  FROM public.tenant_memberships AS membership
  JOIN public.app_users AS app_user ON app_user.id = membership.user_id
  WHERE membership.tenant_id = scope.o_tenant_id
    AND app_user.issuer = 'https://github.com'
    AND app_user.subject = p_subject
    AND membership.disabled_at IS NULL
  FOR UPDATE OF membership;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;
  IF target_role = 'admin'
     AND public.qp_other_active_admins(scope.o_tenant_id, target_user_id) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'last_admin';
  END IF;

  UPDATE public.tenant_memberships AS membership
  SET disabled_at = pg_catalog.clock_timestamp()
  WHERE membership.tenant_id = scope.o_tenant_id AND membership.user_id = target_user_id;
  PERFORM public.qp_revoke_github_sessions(p_subject);
  UPDATE public.tenants AS tenant
  SET revision = tenant.revision + 1
  WHERE tenant.id = scope.o_tenant_id
  RETURNING tenant.revision INTO next_revision;
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, NULL, scope.o_actor_id, 'member-disable', 'member',
    target_user_id::text, current_revision, next_revision,
    pg_catalog.jsonb_build_object('subject', p_subject, 'role', target_role, 'disabled', false),
    pg_catalog.jsonb_build_object('subject', p_subject, 'role', target_role, 'disabled', true)
  );
  RETURN pg_catalog.jsonb_build_object('revision', next_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.disable_managed_member(text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_managed_member(text, bigint, text) TO queue_pilot_runtime;

CREATE FUNCTION public.list_managed_events(p_tenant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
  RETURN pg_catalog.jsonb_build_object('events', COALESCE((
    SELECT pg_catalog.jsonb_agg(public.qp_event_view(event.tenant_id, event.id) ORDER BY event.slug)
    FROM public.events AS event
    WHERE event.tenant_id = scope.o_tenant_id AND event.disabled_at IS NULL
  ), '[]'::jsonb));
END
$function$;
REVOKE ALL ON FUNCTION public.list_managed_events(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_managed_events(text) TO queue_pilot_runtime;

CREATE FUNCTION public.get_managed_event(p_tenant_slug text, p_event_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  event_id uuid;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
  SELECT event.id INTO event_id
  FROM public.events AS event
  WHERE event.tenant_id = scope.o_tenant_id AND event.slug = p_event_slug
    AND event.disabled_at IS NULL;
  IF event_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;
  RETURN public.qp_event_view(scope.o_tenant_id, event_id);
END
$function$;
REVOKE ALL ON FUNCTION public.get_managed_event(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_managed_event(text, text) TO queue_pilot_runtime;

CREATE FUNCTION public.create_managed_event(
  p_tenant_slug text,
  p_event_slug text,
  p_config jsonb,
  p_config_revision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  new_event_id uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF p_event_slug IS NULL
     OR p_event_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR pg_catalog.char_length(p_event_slug) > 63 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_slug';
  END IF;
  IF p_config IS NULL OR p_config_revision IS NULL OR p_config_revision !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_config';
  END IF;
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'share', true);
  INSERT INTO public.events (id, tenant_id, slug, config, config_revision)
  VALUES (new_event_id, scope.o_tenant_id, p_event_slug, p_config, p_config_revision);
  PERFORM public.qp_sync_event_rows(scope.o_tenant_id, new_event_id, p_config);
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, new_event_id, scope.o_actor_id, 'event-create', 'event',
    new_event_id::text, NULL, NULL, NULL,
    pg_catalog.jsonb_build_object('slug', p_event_slug, 'config', p_config, 'configRevision', p_config_revision)
  );
  RETURN pg_catalog.jsonb_build_object('id', new_event_id, 'slug', p_event_slug, 'revision', p_config_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.create_managed_event(text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_managed_event(text, text, jsonb, text) TO queue_pilot_runtime;

CREATE FUNCTION public.update_managed_event(
  p_tenant_slug text,
  p_event_slug text,
  p_expected_revision text,
  p_config jsonb,
  p_config_revision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  event_row record;
  ticket_count bigint;
  changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF p_config IS NULL OR p_config_revision IS NULL OR p_config_revision !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'invalid_config';
  END IF;
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'share', true);
  SELECT event.id, event.config, event.config_revision
  INTO event_row
  FROM public.events AS event
  WHERE event.tenant_id = scope.o_tenant_id AND event.slug = p_event_slug
    AND event.disabled_at IS NULL
  FOR UPDATE;
  IF event_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;
  IF event_row.config_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revision_conflict';
  END IF;
  IF event_row.config_revision = p_config_revision THEN
    RETURN pg_catalog.jsonb_build_object('id', event_row.id, 'slug', p_event_slug, 'revision', event_row.config_revision);
  END IF;

  SELECT count(*) INTO ticket_count
  FROM public.tickets AS ticket
  WHERE ticket.tenant_id = scope.o_tenant_id AND ticket.event_id = event_row.id;
  IF ticket_count > 0 THEN
    IF event_row.config -> 'timeZone' IS DISTINCT FROM p_config -> 'timeZone' THEN
      changed_fields := pg_catalog.array_append(changed_fields, 'timeZone');
    END IF;
    IF event_row.config -> 'numberScope' IS DISTINCT FROM p_config -> 'numberScope' THEN
      changed_fields := pg_catalog.array_append(changed_fields, 'numberScope');
    END IF;
    IF (event_row.config ->> 'startsAt')::timestamptz IS DISTINCT FROM (p_config ->> 'startsAt')::timestamptz THEN
      changed_fields := pg_catalog.array_append(changed_fields, 'startsAt');
    END IF;
    IF (event_row.config ->> 'endsAt')::timestamptz IS DISTINCT FROM (p_config ->> 'endsAt')::timestamptz THEN
      changed_fields := pg_catalog.array_append(changed_fields, 'endsAt');
    END IF;
    IF event_row.config -> 'schedule' IS DISTINCT FROM p_config -> 'schedule' THEN
      changed_fields := pg_catalog.array_append(changed_fields, 'schedule');
    END IF;
    IF ARRAY(
         SELECT item.value ->> 'id'
         FROM pg_catalog.jsonb_array_elements(COALESCE(event_row.config -> 'equipment', '[]'::jsonb)) AS item
         ORDER BY item.value ->> 'id'
       ) IS DISTINCT FROM ARRAY(
         SELECT item.value ->> 'id'
         FROM pg_catalog.jsonb_array_elements(COALESCE(p_config -> 'equipment', '[]'::jsonb)) AS item
         ORDER BY item.value ->> 'id'
       ) THEN
      changed_fields := pg_catalog.array_append(changed_fields, 'equipmentIds');
    END IF;
    IF pg_catalog.cardinality(changed_fields) > 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'change_constraint',
        DETAIL = 'structural_frozen:' || pg_catalog.array_to_string(changed_fields, ',');
    END IF;
  END IF;

  PERFORM public.qp_sync_event_rows(scope.o_tenant_id, event_row.id, p_config);
  UPDATE public.events AS event
  SET config = p_config, config_revision = p_config_revision
  WHERE event.tenant_id = scope.o_tenant_id AND event.id = event_row.id;
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, event_row.id, scope.o_actor_id, 'event-update', 'event',
    event_row.id::text, NULL, NULL,
    pg_catalog.jsonb_build_object('config', event_row.config, 'configRevision', event_row.config_revision),
    pg_catalog.jsonb_build_object('config', p_config, 'configRevision', p_config_revision)
  );
  RETURN pg_catalog.jsonb_build_object('id', event_row.id, 'slug', p_event_slug, 'revision', p_config_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.update_managed_event(text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_managed_event(text, text, text, jsonb, text) TO queue_pilot_runtime;

CREATE FUNCTION public.disable_managed_event(
  p_tenant_slug text,
  p_event_slug text,
  p_expected_revision text,
  p_confirm_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  event_row record;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'share', true);
  SELECT event.id, event.config_revision
  INTO event_row
  FROM public.events AS event
  WHERE event.tenant_id = scope.o_tenant_id AND event.slug = p_event_slug
    AND event.disabled_at IS NULL
  FOR UPDATE;
  IF event_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;
  IF p_confirm_slug IS DISTINCT FROM p_event_slug THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'confirmation_mismatch';
  END IF;
  IF event_row.config_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revision_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tickets AS ticket
    WHERE ticket.tenant_id = scope.o_tenant_id AND ticket.event_id = event_row.id
      AND ticket.status IN ('waiting', 'called')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'change_constraint', DETAIL = 'active_tickets';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.print_jobs AS job
    WHERE job.tenant_id = scope.o_tenant_id AND job.event_id = event_row.id
      AND job.status IN ('queued', 'printing')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'change_constraint', DETAIL = 'active_print_jobs';
  END IF;
  PERFORM public.qp_disable_event_rows(scope.o_tenant_id, event_row.id);
  PERFORM public.qp_write_audit(
    scope.o_tenant_id, event_row.id, scope.o_actor_id, 'event-disable', 'event',
    event_row.id::text, NULL, NULL,
    pg_catalog.jsonb_build_object('slug', p_event_slug, 'disabled', false),
    pg_catalog.jsonb_build_object('slug', p_event_slug, 'disabled', true)
  );
  RETURN pg_catalog.jsonb_build_object('id', event_row.id, 'slug', p_event_slug, 'revision', event_row.config_revision);
END
$function$;
REVOKE ALL ON FUNCTION public.disable_managed_event(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disable_managed_event(text, text, text, text) TO queue_pilot_runtime;

CREATE FUNCTION public.read_managed_audit(
  p_tenant_slug text,
  p_limit integer,
  p_before_occurred_at text,
  p_before_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
  page_size integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
  before_at timestamptz := p_before_occurred_at::timestamptz;
  entries jsonb;
  fetched integer;
  last_entry jsonb;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
  SELECT COALESCE(pg_catalog.jsonb_agg(row_json ORDER BY occurred_at DESC, id DESC), '[]'::jsonb)
  INTO entries
  FROM (
    SELECT audit.occurred_at, audit.id,
      pg_catalog.jsonb_build_object(
        'id', audit.id,
        'occurredAt', pg_catalog.to_char(audit.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'action', audit.action,
        'resourceType', audit.resource_type,
        'resourceId', audit.resource_id,
        'eventId', audit.event_id,
        'actorKind', audit.actor_kind,
        'actorUserId', audit.actor_app_user_id,
        'origin', audit.origin,
        'revisionBefore', audit.revision_before,
        'revisionAfter', audit.revision_after,
        'before', audit.before_state,
        'after', audit.after_state
      ) AS row_json
    FROM public.configuration_audit AS audit
    WHERE audit.tenant_id = scope.o_tenant_id
      AND (before_at IS NULL OR (audit.occurred_at, audit.id) < (before_at, p_before_id))
    ORDER BY audit.occurred_at DESC, audit.id DESC
    LIMIT page_size + 1
  ) AS page;
  fetched := pg_catalog.jsonb_array_length(entries);
  IF fetched > page_size THEN
    entries := entries - page_size;
    last_entry := entries -> (page_size - 1);
    RETURN pg_catalog.jsonb_build_object(
      'entries', entries,
      'nextCursor', pg_catalog.jsonb_build_object(
        'occurredAt', last_entry ->> 'occurredAt', 'id', last_entry ->> 'id')
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object('entries', entries, 'nextCursor', NULL);
END
$function$;
REVOKE ALL ON FUNCTION public.read_managed_audit(text, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_managed_audit(text, integer, text, uuid) TO queue_pilot_runtime;

CREATE FUNCTION public.export_managed_tenant(p_tenant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  scope record;
BEGIN
  SELECT * INTO scope FROM public.qp_authorize_tenant(p_tenant_slug, 'none', true);
  RETURN (
    SELECT pg_catalog.jsonb_build_object(
      'configurationExportVersion', 1,
      'tenant', pg_catalog.jsonb_build_object(
        'id', tenant.id, 'slug', tenant.slug,
        'displayName', tenant.display_name, 'disabled', tenant.disabled_at IS NOT NULL
      ),
      'members', COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'issuer', app_user.issuer, 'subject', app_user.subject, 'role', membership.role,
          'disabled', membership.disabled_at IS NOT NULL OR app_user.disabled_at IS NOT NULL
        ) ORDER BY app_user.issuer, app_user.subject)
        FROM public.tenant_memberships AS membership
        JOIN public.app_users AS app_user ON app_user.id = membership.user_id
        WHERE membership.tenant_id = tenant.id
      ), '[]'::jsonb),
      'events', COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', event.id, 'slug', event.slug, 'config', event.config,
          'configRevision', event.config_revision, 'disabled', event.disabled_at IS NOT NULL,
          'equipment', COALESCE((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', equipment.id, 'label', equipment.label,
              'sortOrder', equipment.sort_order, 'disabled', equipment.disabled_at IS NOT NULL
            ) ORDER BY equipment.sort_order, equipment.id)
            FROM public.event_equipment AS equipment
            WHERE equipment.tenant_id = event.tenant_id AND equipment.event_id = event.id
          ), '[]'::jsonb),
          'printers', COALESCE((
            SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', printer.id, 'slug', printer.slug, 'label', printer.label,
              'kind', printer.kind, 'disabled', printer.disabled_at IS NOT NULL
            ) ORDER BY printer.slug)
            FROM public.printers AS printer
            WHERE printer.tenant_id = event.tenant_id AND printer.event_id = event.id
          ), '[]'::jsonb)
        ) ORDER BY event.slug)
        FROM public.events AS event
        WHERE event.tenant_id = tenant.id
      ), '[]'::jsonb)
    )
    FROM public.tenants AS tenant
    WHERE tenant.id = scope.o_tenant_id
  );
END
$function$;
REVOKE ALL ON FUNCTION public.export_managed_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_managed_tenant(text) TO queue_pilot_runtime;
