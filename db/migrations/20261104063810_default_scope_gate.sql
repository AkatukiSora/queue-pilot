-- Modify "print_jobs" table
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_default_scope_expand" CHECK ((tenant_id = '00000000-0000-4000-8000-000000000001'::uuid) AND (event_id = '00000000-0000-4000-8000-000000000002'::uuid));
-- Modify "ticket_counters" table
ALTER TABLE "public"."ticket_counters" ADD CONSTRAINT "ticket_counters_default_scope_expand" CHECK ((tenant_id = '00000000-0000-4000-8000-000000000001'::uuid) AND (event_id = '00000000-0000-4000-8000-000000000002'::uuid));
-- Modify "tickets" table
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_default_scope_expand" CHECK ((tenant_id = '00000000-0000-4000-8000-000000000001'::uuid) AND (event_id = '00000000-0000-4000-8000-000000000002'::uuid));
