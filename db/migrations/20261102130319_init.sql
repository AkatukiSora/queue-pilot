-- Create "ticket_counters" table
CREATE TABLE "public"."ticket_counters" (
  "counter_key" text NOT NULL,
  "last_number" integer NOT NULL,
  PRIMARY KEY ("counter_key"),
  CONSTRAINT "ticket_counters_last_number_positive" CHECK (last_number > 0)
);
-- Create "tickets" table
CREATE TABLE "public"."tickets" (
  "id" uuid NOT NULL,
  "counter_key" text NOT NULL,
  "number" integer NOT NULL,
  "party_size" smallint NOT NULL DEFAULT 1,
  "public_token" character varying(22) NOT NULL,
  "idempotency_key" character varying(128) NOT NULL,
  "request_hash" character varying(64) NOT NULL,
  "status" text NOT NULL,
  "cancel_reason" text NULL,
  "issued_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "tickets_counter_key_number_key" UNIQUE ("counter_key", "number"),
  CONSTRAINT "tickets_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "tickets_public_token_key" UNIQUE ("public_token"),
  CONSTRAINT "tickets_cancel_reason_consistent" CHECK (((status = 'cancelled'::text) AND (cancel_reason = ANY (ARRAY['visitor'::text, 'staff'::text, 'no_show'::text]))) OR ((status <> 'cancelled'::text) AND (cancel_reason IS NULL))),
  CONSTRAINT "tickets_number_positive" CHECK (number > 0),
  CONSTRAINT "tickets_party_size_range" CHECK ((party_size >= 1) AND (party_size <= 20)),
  CONSTRAINT "tickets_public_token_format" CHECK ((public_token)::text ~ '^[A-Za-z0-9_-]{22}$'::text),
  CONSTRAINT "tickets_status_allowed" CHECK (status = ANY (ARRAY['waiting'::text, 'called'::text, 'served'::text, 'cancelled'::text]))
);
-- Create "print_jobs" table
CREATE TABLE "public"."print_jobs" (
  "id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  "lease_token" uuid NULL,
  "lease_expires_at" timestamptz NULL,
  "attempt" integer NOT NULL DEFAULT 0,
  "reprint_of" uuid NULL,
  "payload" jsonb NOT NULL,
  "detail" text NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "print_jobs_reprint_of_fkey" FOREIGN KEY ("reprint_of") REFERENCES "public"."print_jobs" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "print_jobs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "print_jobs_attempt_nonnegative" CHECK (attempt >= 0),
  CONSTRAINT "print_jobs_lease_consistent" CHECK (((status = 'printing'::text) AND (lease_token IS NOT NULL) AND (lease_expires_at IS NOT NULL)) OR ((status <> 'printing'::text) AND (lease_token IS NULL) AND (lease_expires_at IS NULL))),
  CONSTRAINT "print_jobs_status_allowed" CHECK (status = ANY (ARRAY['queued'::text, 'printing'::text, 'printed'::text, 'failed'::text, 'unknown'::text]))
);
-- Create index "print_jobs_queued_pick_idx" to table: "print_jobs"
CREATE INDEX "print_jobs_queued_pick_idx" ON "public"."print_jobs" ("created_at", "id") WHERE (status = 'queued'::text);
-- Create index "print_jobs_ticket_created_idx" to table: "print_jobs"
CREATE INDEX "print_jobs_ticket_created_idx" ON "public"."print_jobs" ("ticket_id", "created_at", "id");
