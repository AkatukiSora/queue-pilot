-- Modify "tickets" table
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_slot_equipment_key", ADD CONSTRAINT "tickets_slot_release_consistent" CHECK ((slot_released_at IS NULL) OR ((slot_starts_at IS NOT NULL) AND (status = ANY (ARRAY['cancelled'::text, 'served'::text])))), ADD COLUMN "slot_released_at" timestamptz NULL;
-- Create index "tickets_slot_equipment_key" to table: "tickets"
CREATE UNIQUE INDEX "tickets_slot_equipment_key" ON "public"."tickets" ("slot_starts_at", "equipment") WHERE (slot_released_at IS NULL);
