-- Modify "print_jobs" table
ALTER TABLE "public"."print_jobs" ADD CONSTRAINT "print_jobs_output_kind_allowed" CHECK ((output_kind IS NULL) OR (output_kind = ANY (ARRAY['physical'::text, 'preview'::text]))), ADD COLUMN "output_kind" text NULL;
