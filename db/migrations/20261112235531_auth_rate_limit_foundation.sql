-- Create "rateLimit" table
CREATE TABLE "public"."rateLimit" (
  "id" text NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "rateLimit_key_key" UNIQUE ("key")
);
-- Create "rate_limiter" table
CREATE TABLE "public"."rate_limiter" (
  "key" character varying(255) NOT NULL,
  "points" integer NOT NULL DEFAULT 0,
  "expire" bigint NULL,
  PRIMARY KEY ("key")
);
-- Runtime uses these library-owned global counters without DDL privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."rateLimit", "public"."rate_limiter" TO queue_pilot_runtime;
