-- Create "user" table
CREATE TABLE "public"."user" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "user_email_key" UNIQUE ("email")
);
-- Create "verification" table
CREATE TABLE "public"."verification" (
  "id" text NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  PRIMARY KEY ("id")
);
-- Create index "verification_identifier_idx" to table: "verification"
CREATE INDEX "verification_identifier_idx" ON "public"."verification" ("identifier");
-- Create "account" table
CREATE TABLE "public"."account" (
  "id" text NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text NULL,
  "refreshToken" text NULL,
  "idToken" text NULL,
  "accessTokenExpiresAt" timestamptz NULL,
  "refreshTokenExpiresAt" timestamptz NULL,
  "scope" text NULL,
  "password" text NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "account_provider_account_key" UNIQUE ("providerId", "accountId"),
  CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "account_user_id_idx" to table: "account"
CREATE INDEX "account_user_id_idx" ON "public"."account" ("userId");
-- Create "session" table
CREATE TABLE "public"."session" (
  "id" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text NULL,
  "userAgent" text NULL,
  "userId" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "session_token_key" UNIQUE ("token"),
  CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "session_user_id_idx" to table: "session"
CREATE INDEX "session_user_id_idx" ON "public"."session" ("userId");
-- The runtime needs database-backed session reads and adapter writes only.
GRANT USAGE ON SCHEMA public TO queue_pilot_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."user", "public"."session",
  "public"."account", "public"."verification" TO queue_pilot_runtime;
