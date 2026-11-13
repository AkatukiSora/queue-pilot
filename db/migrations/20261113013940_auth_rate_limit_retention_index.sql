-- Create the index used by shared rate-limit retention cleanup.
CREATE INDEX "rateLimit_lastRequest_idx" ON "public"."rateLimit" ("lastRequest");
